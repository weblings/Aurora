#pragma once

#include <optional>
#include <string>

// Tooltip descriptor schema (see docs/TooltipsAnalysis.md). Lives in
// Contracts -- not Runtime -- so input/output plugins can author
// descriptors without depending on Runtime (which already depends on
// their interfaces, so the reverse edge would be a layering cycle).
// Runtime's DescriptorRegistry aggregates these; the frontend looks them
// up purely by key.
namespace Aurora::Contracts
{
  // A numeric setting's one definition (Aurora-ta5): the UI renders its
  // slider from this, and the owning setter clamps through it, so the
  // range can't drift between frontend and backend. Shaped like the node
  // graph's future per-param schema (NodeGraphPipeline.md, "UX").
  struct ParamSchema
  {
    std::string label;       // user-facing control label
    float min{0.f};
    float max{1.f};
    float step{0.01f};
    std::string unit;        // display suffix, e.g. "s", "Hz", "°"
    float defaultValue{0.f}; // also what a non-finite write resets to

    // Below min persists as -1, meaning "unset" (fixed hue's "random
    // anchor"), instead of clamping up to min.
    bool allowsUnset{false};
  };


  struct ControlDescriptor
  {
    std::string key;         // namespaced, e.g. "video.transitionSmoothing"
    std::string kind;        // "slider" | "dropdown" | "bool" | "text" | "button"
    std::string description; // user-facing tooltip text
    std::optional<ParamSchema> param{}; // numeric settings only
  };
}
