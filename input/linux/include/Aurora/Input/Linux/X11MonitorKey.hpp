#pragma once

#include <Aurora/Input/MonitorKey.hpp>

// X11Grabber's monitor keys are the shared EDID keys (Aurora/Input/MonitorKey.hpp),
// named here so the grabber and its tests keep their Linux-scoped spelling.
namespace Aurora::Input::Linux
{
  using Aurora::Input::assignMonitorKeys;
  using Aurora::Input::edidHashKey;
}
