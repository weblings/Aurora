#pragma once

#include <cstddef>
#include <optional>
#include <string>
#include <string_view>
#include <variant>
#include <vector>

#include <Aurora/Contracts/Color.hpp>
#include <Aurora/Contracts/ControlDescriptor.hpp>

// Sequence-A port and param shapes for the node graph (G1, Aurora-ra4o.2).
// Frozen format source: docs/planning/NodeGraphPipeline.md "Frozen format (G0)".
namespace Aurora::Runtime::Graph
{
  // Angle was pulled forward from Tier 2 (G1c) so audio.drift can feed its
  // anchor to audio.bounce. Float (scalar) and Trigger (per-tick pulse) are
  // the Tier 2 additions (id8j.1); UVs stays a param shape, never a port.
  enum class PortType
  {
    Image,
    AudioBuffer,
    AudioFeatures,
    Color,
    Frame,
    Angle,
    Float,
    Trigger
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
    // One sentence on what the port carries, shown in the editor inspector
    // and describe_node.
    std::string description{};
  };

  // Param kinds use Contracts::ParamSchema (Aurora-ta5): float and
  // optional-float carry label/min/max/step/unit/default; bool and enum
  // carry their own defaults below plus the schema's label.
  enum class ParamKind
  {
    Float,
    Bool,
    Enum,
    OptionalFloat,
    Gradient
  };

  const char* paramKindName(ParamKind kind);
  std::optional<ParamKind> parseParamKind(std::string_view name);

  // Color stops along 0..1, ascending by position. The loader guarantees
  // 2..kMaxGradientStops stops with positions in range (id8j.5).
  struct GradientStop
  {
    float position = 0.0f;
    Contracts::Color color{};
    bool operator==(const GradientStop&) const = default;
  };

  struct Gradient
  {
    std::vector<GradientStop> stops;
    bool operator==(const Gradient&) const = default;
  };

  constexpr size_t kMaxGradientStops = 16;

  // "#rrggbb" (lowercase on output, either case on input), the gradient
  // stop color form in graph.json and GET /api/nodes.
  std::string colorToHex(const Contracts::Color& color);
  std::optional<Contracts::Color> parseHexColor(std::string_view text);

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
    // Gradient only.
    Gradient defaultGradient{};
    // Short agent/param description (details source for tooltips).
    std::string description{};
  };

  // float -> Float, bool -> Bool, string -> Enum,
  // optional<float> -> OptionalFloat (nullopt == unset, e.g. random anchor),
  // Gradient -> Gradient.
  using ParamValue = std::variant<float, bool, std::string, std::optional<float>, Gradient>;
}
