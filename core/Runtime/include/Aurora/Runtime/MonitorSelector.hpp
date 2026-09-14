#pragma once

#include <Aurora/Input/IInput.hpp>
#include <Aurora/Runtime/Config.hpp>

// Config::activeMonitorName() is a name (stable across replug/reorder), not
// an index -- resolves it against the input's live monitors() and calls
// selectMonitor(). A future setup UI lists monitors() and writes this same
// field back, no IInput/Config interface change needed then.
namespace Aurora::Runtime
{
  // No-op if activeMonitorName() is empty (auto/primary) or doesn't match
  // any currently-enumerated monitor (e.g. unplugged since last saved) --
  // never throws, falls back to whatever's already selected.
  void selectConfiguredMonitor(Input::IInput& input, const Config& config);
}
