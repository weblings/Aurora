#include <Aurora/Runtime/Graph/BuiltInGraphs.hpp>

#include <cctype>
#include <initializer_list>
#include <unordered_set>

namespace Aurora::Runtime::Graph
{
  namespace
  {
    using nlohmann::json;

    std::string interpolationName(Contracts::Interpolation::Type type)
    {
      for(const auto& [name, value] : Contracts::Interpolation::availableInterpolations){
        if(value == type){
          return name;
        }
      }
      return "Area";
    }

    // `params` holds only bindings (e.g. "output"); the loader fills the
    // rest from registry defaults. Overlay applies only to `tunable` names,
    // so a stray overlay key can't fail the load.
    json nodeDoc(
      const std::string& id,
      const std::string& type,
      json params,
      std::initializer_list<const char*> tunable,
      const ParamOverlay& overlay)
    {
      auto it = overlay.find(id);
      if(it != overlay.end()){
        for(const char* name : tunable){
          auto value = it->second.find(name);
          if(value != it->second.end()){
            params[name] = value->second;
          }
        }
      }
      return json{{"id", id}, {"type", type}, {"params", std::move(params)}};
    }

    json edge(const std::string& from, const std::string& to)
    {
      return json::array({from, to});
    }

    LoadResult loadWith(
      const json& doc,
      const NodeRegistry& registry,
      const std::vector<std::string>& outputNames)
    {
      LoadOptions options;
      options.knownOutputs = std::unordered_set<std::string>(outputNames.begin(), outputNames.end());
      return loadGraph(doc, registry, options);
    }
  } // namespace

  std::string perOutputNodeId(const std::string& prefix, const std::string& outputName)
  {
    std::string id = prefix + "_";
    for(char c : outputName){
      id += std::isalnum(static_cast<unsigned char>(c)) ? c : '_';
    }
    return id;
  }

  ParamOverlay videoOverlayFromConfig(const ConfigData& config, const std::vector<std::string>& outputNames)
  {
    ParamOverlay overlay;
    overlay["rescale"]["width"] = static_cast<float>(config.subsampleWidth);
    overlay["rescale"]["interpolation"] = interpolationName(config.interpolation);
    for(const auto& output : outputNames){
      overlay[perOutputNodeId("ease", output)]["smoothing"] = config.transitionSmoothing;
    }
    return overlay;
  }

  ParamOverlay audioOverlayFromConfig(const ConfigData& config)
  {
    ParamOverlay overlay;
    // Config's negative hue means unset/random, which the graph spells null.
    json anchor = config.audioFixedAnchorHue >= 0.f ? json(config.audioFixedAnchorHue) : json(nullptr);
    overlay["drift"]["fixedAnchorHue"] = anchor;
    overlay["drift"]["driftBaseRateDegPerSec"] = config.audioDriftBaseRateDegPerSec;
    overlay["drift"]["centroidStrength"] = config.audioCentroidStrength;
    overlay["drift"]["centroidRangeHz"] = config.audioCentroidRangeHz;
    overlay["beat"]["bounceSmoothTime"] = config.audioBounceSmoothTime;
    overlay["beat"]["dynamismFloor"] = config.audioDynamismFloor;
    overlay["beat"]["vibrancySaturation"] = config.audioVibrancySaturation;
    overlay["beat"]["vibrancyValue"] = config.audioVibrancyValue;
    overlay["beat"]["referenceRms"] = config.audioReferenceRms;
    overlay["beat"]["brightnessFloor"] = config.audioBrightnessFloor;
    overlay["beat"]["brightnessSmoothTime"] = config.audioBrightnessSmoothTime;
    return overlay;
  }

  json builtInVideoGraph(const std::vector<std::string>& outputNames, const ParamOverlay& overlay)
  {
    json nodes = json::array();
    json edges = json::array();

    nodes.push_back(nodeDoc("cap", "video.capture", json::object(), {}, overlay));
    nodes.push_back(nodeDoc(
      "rescale", "image.rescale", json::object(), {"width", "interpolation"}, overlay));
    nodes.push_back(nodeDoc("opaque", "image.dropAlpha", json::object(), {}, overlay));
    edges.push_back(edge("cap.image", "rescale.image"));
    edges.push_back(edge("rescale.image", "opaque.image"));

    for(const auto& output : outputNames){
      const std::string zones = perOutputNodeId("zones", output);
      const std::string ease = perOutputNodeId("ease", output);
      const std::string send = perOutputNodeId("send", output);
      nodes.push_back(nodeDoc(zones, "zones.sample", {{"output", output}}, {}, overlay));
      nodes.push_back(nodeDoc(ease, "frame.smooth", {{"output", output}}, {"smoothing"}, overlay));
      nodes.push_back(nodeDoc(send, "output.send", {{"output", output}}, {}, overlay));
      edges.push_back(edge("opaque.image", zones + ".image"));
      edges.push_back(edge(zones + ".frame", ease + ".frame"));
      edges.push_back(edge(ease + ".frame", send + ".frame"));
    }

    return json{{"version", 1}, {"nodes", std::move(nodes)}, {"edges", std::move(edges)}};
  }

  json builtInAudioGraph(const std::vector<std::string>& outputNames, const ParamOverlay& overlay)
  {
    json nodes = json::array();
    json edges = json::array();

    nodes.push_back(nodeDoc("cap", "audio.capture", json::object(), {}, overlay));
    nodes.push_back(nodeDoc("feat", "audio.features", json::object(), {}, overlay));
    nodes.push_back(nodeDoc(
      "drift",
      "audio.drift",
      json::object(),
      {"fixedAnchorHue", "driftBaseRateDegPerSec", "centroidStrength", "centroidRangeHz"},
      overlay));
    nodes.push_back(nodeDoc(
      "beat",
      "audio.bounce",
      json::object(),
      {"bounceSmoothTime",
       "dynamismFloor",
       "vibrancySaturation",
       "vibrancyValue",
       "referenceRms",
       "brightnessFloor",
       "brightnessSmoothTime"},
      overlay));
    edges.push_back(edge("cap.buffer", "feat.buffer"));
    edges.push_back(edge("feat.features", "drift.features"));
    edges.push_back(edge("feat.features", "beat.features"));
    edges.push_back(edge("drift.anchor", "beat.anchor"));

    for(const auto& output : outputNames){
      const std::string all = perOutputNodeId("all", output);
      const std::string send = perOutputNodeId("send", output);
      nodes.push_back(nodeDoc(all, "frame.broadcast", {{"output", output}}, {}, overlay));
      nodes.push_back(nodeDoc(send, "output.send", {{"output", output}}, {}, overlay));
      edges.push_back(edge("beat.color", all + ".color"));
      edges.push_back(edge(all + ".frame", send + ".frame"));
    }

    // The Audio graph runs at today's fixed 60Hz, not the app refresh rate.
    return json{{"version", 1}, {"tickHz", 60}, {"nodes", std::move(nodes)}, {"edges", std::move(edges)}};
  }

  LoadResult loadBuiltInVideoGraph(
    const NodeRegistry& registry,
    const std::vector<std::string>& outputNames,
    const ConfigData& config)
  {
    return loadWith(
      builtInVideoGraph(outputNames, videoOverlayFromConfig(config, outputNames)), registry, outputNames);
  }

  LoadResult loadBuiltInAudioGraph(
    const NodeRegistry& registry,
    const std::vector<std::string>& outputNames,
    const ConfigData& config)
  {
    return loadWith(builtInAudioGraph(outputNames, audioOverlayFromConfig(config)), registry, outputNames);
  }
}
