#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <filesystem>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>

#include <Aurora/Runtime/Pipeline.hpp>

namespace Aurora::Runtime
{
  // Turns the input's "monitors changed" signal (Aurora-9fn3) into one rebuild.
  // Displays settle in bursts (a hotplug can fire several events over a second
  // or two), so every signal pushes the rebuild out by the debounce and only a
  // quiet period lets it run. The rebuild re-enumerates and re-resolves the
  // saved monitor. A signal that lands while a light test runs waits for the
  // test to end; one that lands while paused is dropped, since resume
  // rebuilds anyway. Rebuilds block, so poll() belongs on its own thread
  // (see start()), never the tick loop.
  class MonitorChangeWatcher
  {
  public:
    using Clock = std::chrono::steady_clock;
    using Take = std::function<bool()>;
    using Flag = std::function<bool()>;
    // Called off the tick loop.
    using Rebuild = std::function<void()>;

    static constexpr std::chrono::milliseconds kDebounce{1000};

    MonitorChangeWatcher(Take take, Flag paused, Flag busy, Rebuild rebuild,
                         Clock::duration debounce = kDebounce,
                         Clock::duration interval = std::chrono::milliseconds(250))
      : m_take(std::move(take)), m_paused(std::move(paused)), m_busy(std::move(busy)),
        m_rebuild(std::move(rebuild)), m_debounce(debounce), m_interval(interval) {}

    ~MonitorChangeWatcher() { stop(); }

    MonitorChangeWatcher(const MonitorChangeWatcher&) = delete;
    MonitorChangeWatcher& operator=(const MonitorChangeWatcher&) = delete;

    void poll(Clock::time_point now = Clock::now())
    {
      if(m_take()){
        m_due = now + m_debounce;
        m_pending = true;
      }
      if(!m_pending || now < m_due){ return; }

      if(m_paused()){
        m_pending = false;
        return;
      }
      if(m_busy()){ return; }

      m_pending = false;
      m_rebuild();
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
    Take m_take;
    Flag m_paused;
    Flag m_busy;
    Rebuild m_rebuild;
    Clock::duration m_debounce;
    Clock::duration m_interval;
    bool m_pending{false};
    Clock::time_point m_due{};

    std::mutex m_threadMutex;
    std::mutex m_waitMutex;
    std::condition_variable m_wake;
    std::atomic<bool> m_stop{false};
    std::thread m_thread;
  };

  // The host-wired watcher. `busy` says a light test runs. Keep `host`,
  // `registry` and `configRoot` alive past stop().
  inline std::unique_ptr<MonitorChangeWatcher> makeHostMonitorChangeWatcher(
    PipelineHost& host, const Registry& registry, const std::filesystem::path& configRoot,
    std::function<bool()> busy)
  {
    return std::make_unique<MonitorChangeWatcher>(
      [&host]{ return host.takeMonitorsChanged(); },
      [&host]{ return host.isPaused(); },
      std::move(busy),
      [&host, &registry, configRoot]{
        std::string error;
        if(!host.reconnect(registry, configRoot, error)){ host.log(LogLevel::Error, "Monitor change rebuild failed: " + error); }
      });
  }
}
