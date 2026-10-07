#pragma once

#include <atomic>
#include <optional>

namespace Aurora::Runtime
{

  // Pending run/pause target posted by a tray click (Aurora-q9l1).
  //
  // Every tray click used to set a bare toggle flag that the tick thread
  // later resolved via setRunning(pipelineHost.isPaused()), so the target
  // was decided seconds after the click: the menu still read "Resume" while
  // a multi-second resume ran, and a second click paused right after the
  // resume succeeded. This posts the clicked target instead (run or pause,
  // last click wins), matching what PUT /api/state {running} already sends.
  //
  // Threading matches the old flag: the click callback (UI/D-Bus thread)
  // only stores, the tick thread takes and runs the multi-second
  // setRunning, so no UI thread ever blocks. Copyable-neither, movable-neither
  // by way of the atomic; one instance lives beside each tray.
  class PendingRunRequest
  {
  public:
    PendingRunRequest() = default;
    PendingRunRequest(const PendingRunRequest&) = delete;
    PendingRunRequest& operator=(const PendingRunRequest&) = delete;

    // Stores the target; overwrites any still-unconsumed click, so the last
    // click wins. true = run (resume), false = pause.
    void request(bool running)
    {
      m_pending.store(running ? kRun : kPause, std::memory_order_relaxed);
    }

    void requestRun() { request(true); }
    void requestPause() { request(false); }

    // Captures the click-time target from the state the menu label was read
    // from: the menu offers Resume when paused, Pause when running, so the
    // clicked target is run exactly when paused now.
    void requestToggle(bool isPausedNow) { request(isPausedNow); }

    // Takes and clears the pending target, or nullopt when no click is
    // waiting. A repeated run target stays a run target: applying it through
    // the idempotent setRunning(true) is a no-op, never a pause.
    std::optional<bool> take()
    {
      const int value = m_pending.exchange(kNone, std::memory_order_acq_rel);
      if(value == kNone){ return std::nullopt; }
      return value == kRun;
    }

  private:
    static constexpr int kNone{-1};
    static constexpr int kPause{0};
    static constexpr int kRun{1};

    std::atomic<int> m_pending{kNone};
  };

}
