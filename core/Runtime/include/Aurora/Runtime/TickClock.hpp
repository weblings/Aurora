#pragma once

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
}
