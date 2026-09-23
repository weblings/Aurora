#pragma once

#include <cstdint>

#include <Aurora/Input/IVideoInput.hpp>

// Pure reduction backing PipewireGrabber::displayRefreshRate(). PipeWire
// fractions are frequently unreduced, so .num alone must never be trusted
// as Hz (one backend negotiated 15729223). No Pipewire types in the
// signature, so it's testable without libpipewire.
namespace Aurora::Input::Linux
{
  inline IVideoInput::RefreshRate reduceFramerate(uint32_t num, uint32_t denom)
  {
    if(denom == 0){
      return 0;
    }
    return num / denom;
  }
}

