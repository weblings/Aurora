#pragma once

#include <string>

// Effective-sink report for PipeWire audio capture (Aurora-4vf). No
// PipeWire types in the signature, so it's testable without libpipewire
// (same precedent as GamescopeNodeMatch.hpp).
namespace Aurora::Input::Linux
{
  struct AudioSinkStatus
  {
    // True when the grabber was asked to follow the system default (empty
    // targetSinkName) rather than a user-pinned sink.
    bool followingDefault{false};
    // The sink actually in use: the auto-resolved default, or the explicit
    // target. Empty when nothing is known (not capturing).
    std::string sinkName;
  };

  inline AudioSinkStatus makeAudioSinkStatus(
    const std::string& requestedSinkName,
    const std::string& resolvedSinkName
  )
  {
    if(requestedSinkName.empty()){
      return {true, resolvedSinkName};
    }
    return {false, requestedSinkName};
  }
}
