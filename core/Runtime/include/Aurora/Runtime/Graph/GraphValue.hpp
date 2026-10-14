#pragma once

#include <memory>
#include <optional>
#include <string>
#include <variant>

#include <Aurora/Contracts/AudioBuffer.hpp>
#include <Aurora/Contracts/AudioFeatures.hpp>
#include <Aurora/Contracts/Color.hpp>
#include <Aurora/Contracts/Frame.hpp>
#include <Aurora/Contracts/ImageData.hpp>
#include <Aurora/Runtime/Graph/GraphTypes.hpp>

// Per-tick values on graph edges (G1, Aurora-ra4o.2).
//
// - Absent: the node produced no value this tick (today's skipped ticks:
//   unhealthy video source, empty audio buffer). Propagates downstream and
//   output.send sends nothing.
// - GraphError: a runtime node failure. Carries the originating node id and
//   propagates downstream NaN-style, so the editor can highlight the path
//   from the failing node to the affected outputs. Outside the port type
//   system: any port can carry it.
// - Image travels by shared reference (never copied); everything else by
//   value (NodeGraphPipeline.md "Proposed shape").
namespace Aurora::Runtime::Graph
{
  struct Absent
  {
    bool operator==(const Absent&) const = default;
  };

  struct GraphError
  {
    std::string nodeId; // originating node, preserved through propagation
    std::string message;
    bool operator==(const GraphError&) const = default;
  };

  // Hue in degrees. A distinct type so a future Float port can't be
  // confused with it.
  struct Angle
  {
    float degrees = 0.0f;
    bool operator==(const Angle&) const = default;
  };

  // Shared, never copied. A capture node reuses the same pointer while the
  // source frame is unchanged, so downstream nodes can cache by identity.
  using ImagePtr = std::shared_ptr<Contracts::ImageData>;

  using GraphValue = std::variant<
    Absent,
    GraphError,
    ImagePtr,
    Contracts::AudioBuffer,
    Contracts::AudioFeatures,
    Contracts::Color,
    Contracts::Frame,
    Angle>;

  inline bool isAbsent(const GraphValue& value)
  {
    return std::holds_alternative<Absent>(value);
  }

  inline bool isError(const GraphValue& value)
  {
    return std::holds_alternative<GraphError>(value);
  }

  inline const GraphError* asError(const GraphValue& value)
  {
    return std::get_if<GraphError>(&value);
  }

  // The port type a value satisfies, or nullopt for Absent/GraphError
  // (both flow on any port).
  inline std::optional<PortType> valuePortType(const GraphValue& value)
  {
    if(std::holds_alternative<ImagePtr>(value)){
      return PortType::Image;
    }
    if(std::holds_alternative<Contracts::AudioBuffer>(value)){
      return PortType::AudioBuffer;
    }
    if(std::holds_alternative<Contracts::AudioFeatures>(value)){
      return PortType::AudioFeatures;
    }
    if(std::holds_alternative<Contracts::Color>(value)){
      return PortType::Color;
    }
    if(std::holds_alternative<Contracts::Frame>(value)){
      return PortType::Frame;
    }
    if(std::holds_alternative<Angle>(value)){
      return PortType::Angle;
    }
    return std::nullopt;
  }
}
