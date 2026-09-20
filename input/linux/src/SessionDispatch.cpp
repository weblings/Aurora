#include <Aurora/Input/Linux/SessionDispatch.hpp>

#include <cstdlib>


namespace Aurora::Input::Linux
{
  Backend selectBackend(
    const std::optional<std::string>& sessionType,
    bool gamescopeWaylandDisplaySet,
    bool pipewireAvailable,
    bool x11Available
  )
  {
    // Gamescope sets XDG_SESSION_TYPE=x11 for legacy child compatibility but
    // doesn't run a portal ScreenCast backend -- its own marker env var takes
    // priority so this doesn't fall through to a black-screening X11 grab.
    if(pipewireAvailable && gamescopeWaylandDisplaySet){
      return Backend::GamescopePipewire;
    }

    if(pipewireAvailable && sessionType == "wayland"){
      return Backend::WaylandPipewire;
    }

    if(x11Available && sessionType == "x11"){
      return Backend::X11;
    }

    return Backend::Unavailable;
  }


  Backend selectBackendFromEnvironment(
    bool pipewireAvailable,
    bool x11Available
  )
  {
    const char* sessionTypeEnv = std::getenv("XDG_SESSION_TYPE");
    std::optional<std::string> sessionType = sessionTypeEnv ? std::optional<std::string>(sessionTypeEnv) : std::nullopt;
    bool gamescopeWaylandDisplaySet = std::getenv("GAMESCOPE_WAYLAND_DISPLAY") != nullptr;

    return selectBackend(sessionType, gamescopeWaylandDisplaySet, pipewireAvailable, x11Available);
  }
}
