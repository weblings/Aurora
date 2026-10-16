#pragma once

#include <map>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include <Aurora/Runtime/Config.hpp>
#include <Aurora/Runtime/Graph/GraphLoader.hpp>

// Built-in Video and Audio graphs (G2d, Aurora-ra4o.7). They live in the
// binary, not on disk. Today's ConfigData values are a param overlay on
// them (nodeId -> param -> value), applied when the doc is built, so a
// Tuning edit is rebuild + loadGraph + adoptStateFrom (state survives by
// node id) rather than an in-place Graph::setParam.
//
//   Video: cap -> rescale -> opaque -> per output: zones -> ease -> send
//   Audio: cap -> feat -> drift/beat -> per output: all -> send   (tickHz 60)
//
// Per-output node ids come from perOutputNodeId(). Video needs
// registerVideoNodes + registerFrameNodes; Audio also needs
// registerAudioNodes (audio builds only).
namespace Aurora::Runtime::Graph
{
  using ParamOverlay = std::map<std::string, std::map<std::string, nlohmann::json>>;

  // "<prefix>_<output>" with non-alphanumerics in the name mapped to '_'
  // (a '.' would break the node.port edge syntax). Prefixes: zones, ease,
  // gain, send (Video); all, gain, send (Audio).
  std::string perOutputNodeId(const std::string& prefix, const std::string& outputName);

  // Pass the ConfigData the pipeline actually runs with: an unset (0)
  // subsampleWidth stays 0 here, i.e. rescale passes through.
  ParamOverlay videoOverlayFromConfig(const ConfigData& config, const std::vector<std::string>& outputNames);
  ParamOverlay audioOverlayFromConfig(const ConfigData& config, const std::vector<std::string>& outputNames);

  // Overlay entries naming a node or param the graph lacks are ignored
  // (the loader still rejects a mistyped value).
  nlohmann::json builtInVideoGraph(
    const std::vector<std::string>& outputNames,
    const ParamOverlay& overlay = {});
  nlohmann::json builtInAudioGraph(
    const std::vector<std::string>& outputNames,
    const ParamOverlay& overlay = {});

  // Builds the doc with the config overlay and loads it with
  // knownOutputs = outputNames.
  LoadResult loadBuiltInVideoGraph(
    const NodeRegistry& registry,
    const std::vector<std::string>& outputNames,
    const ConfigData& config);
  LoadResult loadBuiltInAudioGraph(
    const NodeRegistry& registry,
    const std::vector<std::string>& outputNames,
    const ConfigData& config);
}
