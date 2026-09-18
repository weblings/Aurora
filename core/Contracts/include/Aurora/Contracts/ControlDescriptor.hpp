#pragma once

#include <string>

// Tooltip descriptor schema (see Analysis/TooltipsAnalysis.md). Lives in
// Contracts -- not Runtime -- so input/output plugins can author
// descriptors without depending on Runtime (which already depends on
// their interfaces, so the reverse edge would be a layering cycle).
// Runtime's DescriptorRegistry aggregates these; the frontend looks them
// up purely by key.
namespace Aurora::Contracts
{
  struct ControlDescriptor
  {
    std::string key;         // namespaced, e.g. "video.transitionSmoothing"
    std::string kind;        // "slider" | "dropdown" | "bool" | "text" | "button"
    std::string description; // user-facing tooltip text
  };
}
