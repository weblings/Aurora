#pragma once

#include <optional>
#include <string>
#include <string_view>
#include <vector>

// PipeWire audio-sink enumeration backing GET /api/linux/audio-sinks
// (Aurora-67y). Split like GamescopeNodeMatch.hpp: the registry-global
// parsing is a pure helper with no PipeWire types in its signature, so
// it's testable without libpipewire; enumerateAudioSinks() owns the
// short-lived loop/context/registry and reuses AudioGrabber's
// sync-round-trip pattern.
namespace Aurora::Input::Linux
{
  struct AudioSinkInfo
  {
    // Exact PipeWire node.name -- the audioTargetSinkName value.
    std::string name;
    // Human-readable node.description; may be empty when the node
    // carries none (callers fall back to name).
    std::string description;
  };

  // Pure decision logic for one registry global: accepts only Node
  // interfaces whose media.class is exactly "Audio/Sink" with a real
  // node.name. Rejects sources (Audio/Source), video/device nodes, and
  // class-less graph-clock nodes (Dummy-Driver, Freewheel-Driver) --
  // PipeWire answers queries fine with no session manager running even
  // though nothing real exists (see docs/lessons/input.md), so matching
  // on the class rather than mere presence matters.
  inline std::optional<AudioSinkInfo> matchAudioSinkNode(
    bool isNodeInterface,
    const char* mediaClass,
    const char* nodeName,
    const char* nodeDescription
  )
  {
    if(!isNodeInterface || mediaClass == nullptr || nodeName == nullptr){
      return std::nullopt;
    }
    if(std::string_view(mediaClass) != "Audio/Sink"){
      return std::nullopt;
    }
    if(std::string_view(nodeName).empty()){
      return std::nullopt;
    }
    return AudioSinkInfo{nodeName, nodeDescription ? nodeDescription : ""};
  }

  // Lists every Audio/Sink node currently on the PipeWire registry.
  // Never throws: connect failures (no daemon, no session manager) and
  // the enumeration timeout all report as an empty list, so the HTTP
  // route stays infallible and the WebUI falls back to its
  // System-default-only dropdown.
  std::vector<AudioSinkInfo> enumerateAudioSinks();
}
