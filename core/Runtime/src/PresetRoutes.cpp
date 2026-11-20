#include <Aurora/Runtime/PresetRoutes.hpp>

#include <functional>
#include <memory>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include <Aurora/Network/Http/Server/HttpServer.hpp>
#include <Aurora/Runtime/DraftRoutes.hpp>
#include <Aurora/Runtime/Graph/AllNodes.hpp>
#include <Aurora/Runtime/Graph/BuiltInGraphs.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

namespace Aurora::Runtime
{
  using Aurora::Network::Http::Server::HttpMethod;
  using Aurora::Network::Http::Server::HttpServer;
  using Aurora::Network::Http::Server::Request;
  using Aurora::Network::Http::Server::Response;
  using nlohmann::json;

  namespace
  {
    using Graph::perOutputNodeId;

    struct Preset
    {
      std::string id;
      std::string title;
      std::string description;
      std::vector<std::string> inputs;
      std::function<json(const std::vector<std::string>&)> build;
    };

    json _node(const std::string& id, const std::string& type, json params = json::object())
    {
      return {{"id", id}, {"type", type}, {"params", std::move(params)}};
    }

    json _edge(const std::string& from, const std::string& to)
    {
      return json::array({from, to});
    }

    json _control(const std::string& node, const std::string& param, const std::string& label, const std::string& section)
    {
      return {{"node", node}, {"param", param}, {"label", label}, {"section", section}};
    }

    json _doc(json nodes, json edges, json controls)
    {
      return {{"version", 1}, {"nodes", std::move(nodes)}, {"edges", std::move(edges)}, {"controls", std::move(controls)}};
    }

    // Screen colors pulse with the bass: video zones scaled by smoothed bass loudness.
    json _buildBoth(const std::vector<std::string>& outputs)
    {
      json nodes = json::array({
        _node("cap", "video.capture"),
        _node("rescale", "image.rescale"),
        _node("opaque", "image.dropAlpha"),
        _node("mic", "audio.capture"),
        _node("bands", "audio.bands"),
        _node("level", "smooth.exp", {{"tau", 0.15}}),
        _node("pulse", "math.mapRange", {{"inMin", 0.0}, {"inMax", 0.25}, {"outMin", 0.6}, {"outMax", 1.4}})
      });
      json edges = json::array({
        _edge("cap.image", "rescale.image"),
        _edge("rescale.image", "opaque.image"),
        _edge("mic.buffer", "bands.buffer"),
        _edge("bands.bass", "level.value"),
        _edge("level.value", "pulse.value")
      });
      for(const auto& output : outputs){
        const std::string zones = perOutputNodeId("zones", output);
        const std::string ease = perOutputNodeId("ease", output);
        const std::string boost = perOutputNodeId("boost", output);
        const std::string send = perOutputNodeId("send", output);
        nodes.push_back(_node(zones, "zones.sample", {{"output", output}}));
        nodes.push_back(_node(ease, "frame.smooth", {{"output", output}}));
        nodes.push_back(_node(boost, "frame.brightnessScale"));
        nodes.push_back(_node(send, "output.send", {{"output", output}}));
        edges.push_back(_edge("opaque.image", zones + ".image"));
        edges.push_back(_edge(zones + ".frame", ease + ".frame"));
        edges.push_back(_edge(ease + ".frame", boost + ".frame"));
        edges.push_back(_edge("pulse.value", boost + ".factor"));
        edges.push_back(_edge(boost + ".frame", send + ".frame"));
      }
      json controls = json::array({
        _control("pulse", "outMin", "Quiet brightness", "Pulse"),
        _control("pulse", "outMax", "Loud brightness", "Pulse"),
        _control("pulse", "inMax", "Bass for full pulse", "Pulse"),
        _control("level", "tau", "Pulse smoothing", "Pulse")
      });
      if(!outputs.empty()){
        controls.push_back(_control(perOutputNodeId("ease", outputs.front()), "smoothing", "Color smoothing", "Color"));
      }
      return _doc(std::move(nodes), std::move(edges), std::move(controls));
    }

    // A hue ramp scrolling across the zones, no capture input.
    json _buildSpatial(const std::vector<std::string>& outputs)
    {
      json nodes = json::array({
        _node("sweep", "lfo", {{"shape", "saw"}, {"rateHz", 0.05}, {"min", 0.0}, {"max", 360.0}}),
        _node("ramp", "image.hueRamp")
      });
      json edges = json::array({_edge("sweep.value", "ramp.phase")});
      for(const auto& output : outputs){
        const std::string zones = perOutputNodeId("zones", output);
        const std::string ease = perOutputNodeId("ease", output);
        const std::string send = perOutputNodeId("send", output);
        nodes.push_back(_node(zones, "zones.sample", {{"output", output}}));
        nodes.push_back(_node(ease, "frame.smooth", {{"output", output}}));
        nodes.push_back(_node(send, "output.send", {{"output", output}}));
        edges.push_back(_edge("ramp.image", zones + ".image"));
        edges.push_back(_edge(zones + ".frame", ease + ".frame"));
        edges.push_back(_edge(ease + ".frame", send + ".frame"));
      }
      json controls = json::array({
        _control("sweep", "rateHz", "Sweep speed", "Motion"),
        _control("ramp", "angle", "Sweep direction", "Motion"),
        _control("ramp", "span", "Hue range", "Color"),
        _control("ramp", "saturation", "Saturation", "Color")
      });
      if(!outputs.empty()){
        controls.push_back(_control(perOutputNodeId("ease", outputs.front()), "smoothing", "Color smoothing", "Color"));
      }
      return _doc(std::move(nodes), std::move(edges), std::move(controls));
    }

    const std::vector<Preset>& _presets()
    {
      static const std::vector<Preset> presets{
        {"video", "Screen colors", "Lights follow the colors on screen, like the built-in Video effect.",
          {"video"}, [](const auto& outputs){ return Graph::builtInVideoGraph(outputs); }},
        {"audio", "Music colors", "Hue drifts with the music and brightness bounces on the beat, like the built-in Audio effect.",
          {"audio"}, [](const auto& outputs){ return Graph::builtInAudioGraph(outputs); }},
        {"both", "Screen colors with bass pulse", "Lights follow the screen and swell with the bass of whatever is playing.",
          {"video", "audio"}, _buildBoth},
        {"spatial", "Rainbow sweep", "A rainbow scrolls across the room's zones. Needs no screen or audio input.",
          {}, _buildSpatial}
      };
      return presets;
    }

    json _controlLabels(const json& graph)
    {
      json labels = json::array();
      for(const auto& control : graph.value("controls", json::array())){
        const std::string fallback = control.value("node", "") + "." + control.value("param", "");
        labels.push_back(control.value("label", fallback));
      }
      return labels;
    }

    void _reply(Response& res, int status, const json& body)
    {
      res.status = status;
      res.contentType = "application/json";
      res.body = body.dump();
    }
  }


  void registerPresetRoutes(HttpServer& server, const Registry& registry, const std::filesystem::path& configRoot)
  {
    auto nodes = std::make_shared<Graph::NodeRegistry>();
    Graph::registerAllNodes(*nodes, true);

    // A preset is offered when every node type it uses is registered.
    auto available = std::make_shared<std::vector<const Preset*>>();
    for(const Preset& preset : _presets()){
      bool usable = true;
      const json probe = preset.build({"probe"});
      for(const auto& node : probe["nodes"]){
        usable = usable && nodes->find(node["type"].get<std::string>()) != nullptr;
      }
      if(usable){
        available->push_back(&preset);
      }
    }

    server.addRoute(HttpMethod::Get, "/api/graph/presets", [available, &registry, configRoot](const Request&, Response& res){
      const auto outputs = graphOutputNames(registry, configRoot);
      json list = json::array();
      for(const Preset* preset : *available){
        list.push_back({
          {"id", preset->id},
          {"title", preset->title},
          {"description", preset->description},
          {"inputs", preset->inputs},
          {"controls", _controlLabels(preset->build(outputs))}
        });
      }
      _reply(res, 200, {{"presets", std::move(list)}});
    });

    server.addRoute(HttpMethod::Get, "/api/graph/presets/:id", [available, nodes, &registry, configRoot](const Request& req, Response& res){
      const std::string& id = req.pathParams.at("id");
      for(const Preset* preset : *available){
        if(preset->id != id){
          continue;
        }
        const auto outputs = graphOutputNames(registry, configRoot);
        if(outputs.empty()){
          _reply(res, 409, {{"error", "no_outputs"}});
          return;
        }
        json graph = preset->build(outputs);
        // The agent edits and saves this, so it starts with the picker text set (Aurora-mfud).
        graph["minorVersion"] = 1;
        graph["title"] = preset->title;
        graph["description"] = preset->description;
        json body = validateGraphDoc(*nodes, registry, configRoot, graph);
        body["id"] = preset->id;
        body["title"] = preset->title;
        body["description"] = preset->description;
        body["inputs"] = preset->inputs;
        body["outputs"] = outputs;
        body["graph"] = std::move(graph);
        _reply(res, 200, body);
        return;
      }
      _reply(res, 404, {{"error", "unknown_preset"}});
    });
  }
}
