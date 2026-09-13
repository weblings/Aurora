#pragma once

#include <optional>
#include <string>

// The decision logic from huenicorn's GnuLinuxAdapter::_createGrabber(),
// split from actually constructing a grabber so it's unit-testable (see
// Analysis/LinuxCaptureAnalysis.md). Only X11 is wired to a real
// implementation this pass -- the Pipewire outcomes are real decisions
// today, with the grabber to construct for them still pending.
namespace Aurora::Input::Linux
{
  enum class Backend
  {
    GamescopePipewire,
    WaylandPipewire,
    X11,
    Unavailable
  };

  Backend selectBackend(
    const std::optional<std::string>& sessionType,
    bool gamescopeWaylandDisplaySet,
    bool pipewireAvailable,
    bool x11Available
  );

  // Thin wrapper reading the real environment -- matches huenicorn's actual
  // runtime behavior. pipewireAvailable/x11Available mirror the
  // PIPEWIRE_GRABBER_AVAILABLE/X11_GRABBER_AVAILABLE build-time flags.
  Backend selectBackendFromEnvironment(
    bool pipewireAvailable,
    bool x11Available
  );
}
