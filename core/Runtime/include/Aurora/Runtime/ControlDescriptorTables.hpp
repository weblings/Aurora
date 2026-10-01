#pragma once

#include <string_view>
#include <vector>

#include <Aurora/Runtime/ControlDescriptors.hpp>

// Descriptor *content* for the layers owned inside core
// (video/audio processing, zone runtime, app shell); input/output
// plugin content lives in those repos (see TooltipsAnalysis.md).
// Descriptions carry the approved docs/TooltipContent.md copy. If
// these tables grow further, each function should move next to the
// module owning those settings rather than growing here.
namespace Aurora::Runtime
{
  // Video-pipeline tunables (Orchestrator/Config).
  std::vector<ControlDescriptor> videoControlDescriptors();

  // Audio-pipeline tunables (AudioProcessing/Config). fixedHueEnabled is
  // UI state for the "Use fixed hue" checkbox, persisted as
  // audioFixedAnchorHue >= 0 -- hence a bool entry alongside the slider.
  std::vector<ControlDescriptor> audioControlDescriptors();

  // Zone runtime (ZoneMap): per-zone gamma/active plus Auto-arrange.
  std::vector<ControlDescriptor> zoneControlDescriptors();

  // App shell chrome with explanatory value (mode switch).
  std::vector<ControlDescriptor> appControlDescriptors();

  // The ParamSchema a video/audio slider descriptor carries, by descriptor
  // key (e.g. "audio.centroidRangeHz"). Throws std::out_of_range for a key
  // without one -- callers are Config's own setters, so a miss is a bug.
  const Contracts::ParamSchema& paramSchema(std::string_view key);

  // The one clamp rule for every numeric setting (Aurora-ta5): non-finite
  // -> the schema default, below min -> -1 when allowsUnset, else clamped
  // to [min, max]. Config's setters and its constructor both apply it, so
  // REST writes and a hand-edited config.json get the same treatment.
  float sanitizeParam(std::string_view key, float value);
}
