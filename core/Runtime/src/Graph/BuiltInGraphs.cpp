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

    // "Show in Tuning" entry. `config` is the PUT /api/config key that
    // commits it, `section` the heading Tuning groups it under.
    json control(
      const std::string& node,
      const std::string& param,
      const std::string& config,
      const std::string& section = {})
    {
      json entry{{"node", node}, {"param", param}, {"config", config}};
      if(!section.empty()){
        entry["section"] = section;
      }
      return entry;
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

  namespace
  {
    // One gain node per output, before its send (Aurora-5ipy.7).
    void _addGain(ParamOverlay& overlay, const ConfigData& config, const std::vector<std::string>& outputNames)
    {
      for(const auto& output : outputNames){
        overlay[perOutputNodeId("gain", output)]["gain"] = config.brightness;
      }
    }
  }

  ParamOverlay videoOverlayFromConfig(const ConfigData& config, const std::vector<std::string>& outputNames)
  {
    ParamOverlay overlay;
    overlay["rescale"]["width"] = static_cast<float>(config.subsampleWidth);
    overlay["rescale"]["interpolation"] = interpolationName(config.interpolation);
    for(const auto& output : outputNames){
      overlay[perOutputNodeId("ease", output)]["smoothing"] = config.transitionSmoothing;
    }
    _addGain(overlay, config, outputNames);
    return overlay;
  }

  ParamOverlay audioOverlayFromConfig(const ConfigData& config, const std::vector<std::string>& outputNames)
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
    _addGain(overlay, config, outputNames);
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
      const std::string gain = perOutputNodeId("gain", output);
      nodes.push_back(nodeDoc(gain, "frame.gain", json::object(), {"gain"}, overlay));
      nodes.push_back(nodeDoc(send, "output.send", {{"output", output}}, {}, overlay));
      edges.push_back(edge("opaque.image", zones + ".image"));
      edges.push_back(edge(zones + ".frame", ease + ".frame"));
      edges.push_back(edge(ease + ".frame", gain + ".frame"));
      edges.push_back(edge(gain + ".frame", send + ".frame"));
    }

    // One smoothing slider drives every output's ease node; the first is its handle.
    json controls = json::array();
    controls.push_back(control("rescale", "width", "subsampleWidth"));
    controls.push_back(control("rescale", "interpolation", "interpolation"));
    if(!outputNames.empty()){
      controls.push_back(control(perOutputNodeId("ease", outputNames.front()), "smoothing", "transitionSmoothing"));
    }

    return json{
      {"version", 1},
      {"nodes", std::move(nodes)},
      {"edges", std::move(edges)},
      {"controls", std::move(controls)}};
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
      const std::string gain = perOutputNodeId("gain", output);
      nodes.push_back(nodeDoc(gain, "frame.gain", json::object(), {"gain"}, overlay));
      nodes.push_back(nodeDoc(send, "output.send", {{"output", output}}, {}, overlay));
      edges.push_back(edge("beat.color", all + ".color"));
      edges.push_back(edge(all + ".frame", gain + ".frame"));
      edges.push_back(edge(gain + ".frame", send + ".frame"));
    }

    json controls = json::array({
      control("beat", "bounceSmoothTime", "audioBounceSmoothTime", "Response speed"),
      control("beat", "brightnessSmoothTime", "audioBrightnessSmoothTime", "Response speed"),
      control("drift", "driftBaseRateDegPerSec", "audioDriftBaseRateDegPerSec", "Response speed"),
      control("beat", "vibrancySaturation", "audioVibrancySaturation", "Color character"),
      control("beat", "vibrancyValue", "audioVibrancyValue", "Color character"),
      control("drift", "fixedAnchorHue", "audioFixedAnchorHue", "Color character"),
      control("beat", "dynamismFloor", "audioDynamismFloor", "Sensitivity"),
      control("drift", "centroidStrength", "audioCentroidStrength", "Sensitivity"),
      control("beat", "referenceRms", "audioReferenceRms", "Sensitivity"),
      control("beat", "brightnessFloor", "audioBrightnessFloor", "Sensitivity"),
      control("drift", "centroidRangeHz", "audioCentroidRangeHz", "Sensitivity"),
    });

    // The Audio graph runs at today's fixed 60Hz, not the app refresh rate.
    return json{
      {"version", 1},
      {"tickHz", 60},
      {"nodes", std::move(nodes)},
      {"edges", std::move(edges)},
      {"controls", std::move(controls)}};
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
    return loadWith(builtInAudioGraph(outputNames, audioOverlayFromConfig(config, outputNames)), registry, outputNames);
  }
}
