#pragma once

#include <vector>

#include <Aurora/Runtime/ControlDescriptors.hpp>

// Placeholder descriptor *content* for the layers owned inside core
// (video/audio processing, zone runtime, app shell); input/output
// plugin content lives in those repos (see TooltipsAnalysis.md). Every
// description is the literal "Test" until copy is authored -- these
// tables prove the contribution/aggregation plumbing, not the wording.
// When real copy is written, each function should move next to the
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
