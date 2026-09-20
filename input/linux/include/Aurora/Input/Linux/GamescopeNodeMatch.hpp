#pragma once

#include <string_view>

// Pure decision logic backing PipewireGrabber's registry-global callback.
// No Pipewire types in the signature, so it's testable without libpipewire.
namespace Aurora::Input::Linux
{
  inline bool matchesGamescopeNode(bool isNodeInterface, const char* nodeName)
  {
    return isNodeInterface && nodeName != nullptr && std::string_view(nodeName) == "gamescope";
  }
}
