#pragma once

#include <optional>
#include <string>
#include <string_view>
#include <variant>
#include <vector>

#include <Aurora/Contracts/ControlDescriptor.hpp>

// Sequence-A port and param shapes for the node graph (G1, Aurora-ra4o.2).
// Frozen format source: docs/planning/NodeGraphPipeline.md "Frozen format (G0)".
namespace Aurora::Runtime::Graph
{
  // Sequence A port types. Angle was pulled forward from Tier 2 (G1c) so
  // audio.drift can feed its anchor to audio.bounce. Tier 2 adds Float and
  // Trigger; UVs stays a param shape, never a port.
  enum class PortType
  {
    Image,
    AudioBuffer,
    AudioFeatures,
    Color,
    Frame,
    Angle
  };

  const char* portTypeName(PortType type);
  std::optional<PortType> parsePortType(std::string_view name);

  struct PortDecl
  {
    std::string name;
    PortType type = PortType::Color;
    // Inputs only: an unconnected required input fails the load. Outputs
    // ignore this flag.
    bool required = true;
  };

  // Param kinds use Contracts::ParamSchema (Aurora-ta5): float and
  // optional-float carry label/min/max/step/unit/default; bool and enum
  // carry their own defaults below plus the schema's label.
  enum class ParamKind
  {
    Float,
    Bool,
    Enum,
    OptionalFloat
  };

  const char* paramKindName(ParamKind kind);
  std::optional<ParamKind> parseParamKind(std::string_view name);

  struct ParamDecl
  {
    std::string name;
    ParamKind kind = ParamKind::Float;
    Contracts::ParamSchema schema{};
    // Enum only: allowed values and default (must be one of them).
    std::vector<std::string> enumOptions{};
    std::string defaultEnum{};
    // Bool only.
    bool defaultBool = false;
    // Short agent/param description (details source for tooltips).
    std::string description{};
  };

  // float -> Float, bool -> Bool, string -> Enum,
  // optional<float> -> OptionalFloat (nullopt == unset, e.g. random anchor).
  using ParamValue = std::variant<float, bool, std::string, std::optional<float>>;
}
