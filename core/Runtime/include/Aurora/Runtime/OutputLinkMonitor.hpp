#pragma once

#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include <filesystem>

#include <Aurora/Output/IOutput.hpp>
#include <Aurora/Runtime/Pipeline.hpp>

namespace Aurora::Runtime
{
  // Watches the device behind each output (Aurora-lt66) and keeps one host
  // condition in step: set while a probe says Busy, Unreachable or Stopped,
  // cleared when all are Ok or there is nothing to probe (paused, idle). A
  // Stopped output that was not Ok on the previous poll is reconnected by
  // itself, so a first Stopped only raises the row. Repeat attempts back off.
  // Probes block, so poll() belongs on its own thread (see start()), never the
  // tick loop.
  class OutputLinkMonitor
  {
  public:
    static constexpr const char* kSource = "output_link";
    static constexpr const char* kUnreachableMessage = "Can't reach your lights";
    static constexpr const char* kStoppedMessage = "Your lights stopped streaming, reconnecting";
    static constexpr const char* kBusyMessage = "Another app is streaming to your lights";
    static constexpr std::chrono::seconds kMaxBackoff{60};

    using Clock = std::chrono::steady_clock;
    using Probes = std::function<std::vector<Output::LinkProbe>()>;
    using Set = std::function<void(const std::string& source, const std::string& message)>;
    using Clear = std::function<void(const std::string& source)>;
    // Called off the tick loop. Must itself decline while paused.
    using Reconnect = std::function<void()>;
    using Paused = std::function<bool()>;

    OutputLinkMonitor(Probes probes, Set set, Clear clear, Reconnect reconnect, Paused paused,
                      Clock::duration interval = std::chrono::seconds(3))
      : m_probes(std::move(probes)), m_set(std::move(set)), m_clear(std::move(clear)),
        m_reconnect(std::move(reconnect)), m_paused(std::move(paused)), m_interval(interval) {}

    ~OutputLinkMonitor() { stop(); }

    OutputLinkMonitor(const OutputLinkMonitor&) = delete;
    OutputLinkMonitor& operator=(const OutputLinkMonitor&) = delete;

    void poll(Clock::time_point now = Clock::now())
    {
      if(m_checked && now - m_lastCheck < m_interval){ return; }
      m_checked = true;
      m_lastCheck = now;

      Output::LinkState worst = Output::LinkState::Ok;
      for(const auto& probe : m_probes()){
        worst = std::max(worst, probe());
      }
      // A pause that landed during the probes: the stream is meant to be down.
      if(m_paused()){ worst = Output::LinkState::Ok; }

      const Output::LinkState previous = m_last;
      m_last = worst;
      if(worst != Output::LinkState::Stopped){ m_attempts = 0; m_nextReconnect = {}; }

      if(worst == Output::LinkState::Ok){
        if(m_message != nullptr){ m_clear(kSource); m_message = nullptr; }
        return;
      }
      const char* message = worst == Output::LinkState::Busy ? kBusyMessage
        : worst == Output::LinkState::Unreachable ? kUnreachableMessage : kStoppedMessage;
      if(message != m_message){ m_set(kSource, message); m_message = message; }

      if(worst == Output::LinkState::Stopped && previous != Output::LinkState::Ok && now >= m_nextReconnect){
        m_reconnect();
        // A deleted area or a refused start stays Stopped, so each retry waits twice as long.
        m_nextReconnect = now + std::min<Clock::duration>(m_interval * (1 << m_attempts), kMaxBackoff);
        m_attempts = std::min(m_attempts + 1, 16);
      }
    }

    void start()
    {
      std::lock_guard<std::mutex> lock(m_threadMutex);
      if(m_thread.joinable()){ return; }
      m_stop = false;
      m_thread = std::thread([this]{
        while(!m_stop){
          poll();
          std::unique_lock<std::mutex> wait(m_waitMutex);
          m_wake.wait_for(wait, m_interval, [this]{ return m_stop.load(); });
        }
      });
    }

    void stop()
    {
      std::lock_guard<std::mutex> lock(m_threadMutex);
      {
        std::lock_guard<std::mutex> wait(m_waitMutex);
        m_stop = true;
      }
      m_wake.notify_all();
      if(m_thread.joinable()){ m_thread.join(); }
    }

  private:
    Probes m_probes;
    Set m_set;
    Clear m_clear;
    Reconnect m_reconnect;
    Paused m_paused;
    Clock::duration m_interval;
    Clock::time_point m_lastCheck{};
    bool m_checked{false};
    Output::LinkState m_last{Output::LinkState::Ok};
    Clock::time_point m_nextReconnect{};
    int m_attempts{0};
    const char* m_message{nullptr};

    std::mutex m_threadMutex;
    std::mutex m_waitMutex;
    std::condition_variable m_wake;
    std::atomic<bool> m_stop{false};
    std::thread m_thread;
  };

  // The host-wired monitor all three apps run. Keep `host`, `registry` and
  // `configRoot` alive past stop().
  inline std::unique_ptr<OutputLinkMonitor> makeHostLinkMonitor(
    PipelineHost& host, const Registry& registry, const std::filesystem::path& configRoot)
  {
    return std::make_unique<OutputLinkMonitor>(
      [&host]{ return host.linkProbes(); },
      [&host](const std::string& source, const std::string& message){ host.setCondition(source, message); },
      [&host](const std::string& source){ host.clearCondition(source); },
      [&host, &registry, configRoot]{
        std::string error;
        if(!host.reconnect(registry, configRoot, error)){ host.log(LogLevel::Error, "Output reconnect failed: " + error); }
      },
      [&host]{ return host.isPaused(); });
  }
}
