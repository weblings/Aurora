#pragma once

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <mutex>
#include <optional>
#include <string>
#include <thread>

#include <nlohmann/json.hpp>

// Test on lights (Aurora-52oz.5): one draft temporarily replaces the live
// effect, and the server puts the live effect back by itself.
namespace Aurora::Runtime
{
  struct LightTestOptions
  {
    std::int64_t confirmMs = 120000;  // cap on a test kept alive by heartbeats
    std::int64_t heartbeatMs = 2000;  // what clients are told to send at
    std::int64_t lapseMs = 6000;      // revert after this long without one
  };


  struct LightTestHooks
  {
    // Runs the graph on the lights. "" or why it cannot.
    std::function<std::string(const nlohmann::json& doc)> start;
    // Puts the live effect back. "" or an error.
    std::function<std::string()> revert;
    // Changes when the test's pipeline is gone (rebuilt or paused), so there
    // is nothing left to revert.
    std::function<std::uint64_t()> generation;
  };


  class LightTest
  {
  public:
    using Clock = std::function<std::int64_t()>; // milliseconds

    LightTest(LightTestHooks hooks, LightTestOptions options = {}, Clock clock = {});
    ~LightTest();

    // Starts a test, ending the one running (its lights are not reverted in
    // between). "" or the reason it was refused, the running test then stays.
    std::string start(const std::string& session, const nlohmann::json& doc);

    // False when `session` has no running test.
    bool heartbeat(const std::string& session);

    // Reverts now. False when `session` has no running test; `error` is the
    // revert's own error.
    bool revert(const std::string& session, std::string& error);

    // Reverts the running test whoever started it (Aurora-zfre), ending it
    // with `reason`. False when none runs.
    bool stop(std::string& error, const char* reason = "stopped");

    // Disarms without reverting, for a confirm that made the graph live.
    // False when `session` has no running test.
    bool confirm(const std::string& session);

    // The graph under test, when `session` owns the running test.
    std::optional<nlohmann::json> testedGraph(const std::string& session);

    struct Info
    {
      bool active{false};
      std::int64_t confirmRemainingMs{0};
      std::int64_t lapseRemainingMs{0};
      // Why the last test ended: reverted, confirm_timeout, heartbeat_lost,
      // pipeline_gone, confirmed, stopped, superseded (an effect choice). Empty before the
      // first test ends.
      std::string lastEnd;
    };

    Info info();

    // Ends a test whose deadline passed or whose pipeline is gone.
    void poll();

    // Polls on a thread; stopped by the destructor.
    void startWatchdog(std::int64_t intervalMs = 500);

    const LightTestOptions& options() const { return m_options; }

  private:
    void _expireLocked();
    void _endLocked(const char* reason);

    LightTestHooks m_hooks;
    LightTestOptions m_options;
    Clock m_clock;

    std::mutex m_mutex;
    bool m_active{false};
    std::string m_session;
    nlohmann::json m_doc;
    std::int64_t m_startedAt{0};
    std::int64_t m_lastBeat{0};
    std::uint64_t m_generation{0};
    std::string m_lastEnd;

    std::thread m_watchdog;
    std::mutex m_wakeMutex;
    std::condition_variable m_wake;
    bool m_stop{false};
  };
}
