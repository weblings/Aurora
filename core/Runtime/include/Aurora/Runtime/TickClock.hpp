#pragma once

#include <algorithm>
#include <chrono>

// The app's one tick-rate rule, shared by every platform's tick loop
// (Aurora-skv). Video ticks at the display refresh rate; audio has no
// display-derived rate and uses the default. Each tick's dt is this
// interval, passed explicitly into whichever orchestrator runs -- the
// "one clock per graph, dt in the eval context" model the node graph
// needs (docs/planning/NodeGraphPipeline.md).
namespace Aurora::Runtime
{
  constexpr unsigned DefaultTickRateHz = 60;

  // 0 == no rate known (audio mode, or nothing running yet).
  inline double tickIntervalSeconds(unsigned rateHz = 0)
  {
    return 1.0 / (rateHz > 0 ? rateHz : DefaultTickRateHz);
  }

  // The least a tick loop sleeps after a tick (Aurora-cgr). PipelineHost::tick
  // holds the host mutex for the whole tick, so a loop that overruns its
  // interval and re-enters at once starves every API route waiting on it.
  constexpr std::chrono::milliseconds MinTickYield{1};

  // When the loop wakes for its next tick: one interval after tickStart, but
  // never sooner than MinTickYield from `now`, so an overrunning or very
  // high-rate loop still opens a window for waiters. Ticks are not made up.
  inline std::chrono::steady_clock::time_point nextTickTime(
    std::chrono::steady_clock::time_point tickStart,
    double intervalSeconds,
    std::chrono::steady_clock::time_point now
  )
  {
    const auto due = tickStart + std::chrono::duration_cast<std::chrono::steady_clock::duration>(
      std::chrono::duration<double>(intervalSeconds)
    );
    return std::max(due, now + MinTickYield);
  }
}
