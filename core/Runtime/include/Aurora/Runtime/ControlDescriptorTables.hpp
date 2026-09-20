#pragma once

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
}
