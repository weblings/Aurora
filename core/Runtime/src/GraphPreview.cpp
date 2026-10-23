#include <Aurora/Runtime/GraphPreview.hpp>

#include <algorithm>
#include <utility>

#include <Aurora/Runtime/Graph/AllNodes.hpp>
#include <Aurora/Runtime/Graph/GraphLoader.hpp>

namespace Aurora::Runtime
{
  namespace
  {
    constexpr float kCostSmoothing = 0.1f;

    GraphPreview::Zone _zone(const Contracts::Zone& zone)
    {
      const glm::vec3 rgb = zone.color.toNormalized();
      return {zone.id, rgb.r, rgb.g, rgb.b, false};
    }

    GraphPreview::Zone _errorZone(std::uint8_t id)
    {
      return {id, 1.f, 0.f, 1.f, true};
    }
  }


  Output::IOutput* GraphPreview::Host::output(std::string_view name)
  {
    auto it = m_owner.m_sinks.find(name);
    return it == m_owner.m_sinks.end() ? nullptr : it->second.get();
  }


  std::shared_ptr<GraphPreview> GraphPreview::create(
    const nlohmann::json& doc,
    const Graph::NodeRegistry& registry,
    const std::unordered_set<std::string>& knownOutputs,
    std::string& errorOut)
  {
    std::shared_ptr<GraphPreview> preview(new GraphPreview());
    if(!preview->_load(doc, registry, knownOutputs, false, errorOut)){
      return nullptr;
    }
    return preview;
  }


  bool GraphPreview::reload(
    const nlohmann::json& doc,
    const Graph::NodeRegistry& registry,
    const std::unordered_set<std::string>& knownOutputs,
    std::string& errorOut)
  {
    return _load(doc, registry, knownOutputs, true, errorOut);
  }


  bool GraphPreview::_load(
    const nlohmann::json& doc,
    const Graph::NodeRegistry& registry,
    const std::unordered_set<std::string>& knownOutputs,
    bool adopt,
    std::string& errorOut)
  {
    Graph::LoadOptions options;
    options.knownOutputs = knownOutputs;
    Graph::LoadResult loaded = Graph::loadGraph(doc, registry, options);
    if(!loaded.ok){
      errorOut = loaded.error;
      return false;
    }
    if(adopt){
      loaded.graph.adoptStateFrom(m_graph);
    }
    m_graph = std::move(loaded.graph);

    m_sends.clear();
    std::map<std::string, std::unique_ptr<Sink>, std::less<>> sinks;
    for(const auto& node : doc.at("nodes")){
      if(node.value("type", "") != "output.send"){
        continue;
      }
      const std::string output = node.at("params").at("output").get<std::string>();
      m_sends.push_back({node.at("id").get<std::string>(), output});
      if(sinks.find(output) == sinks.end()){
        sinks.emplace(output, std::make_unique<Sink>(output));
      }
    }
    m_sinks = std::move(sinks);

    // Outputs the new graph no longer sends to drop out of the snapshot.
    std::lock_guard<std::mutex> lock(m_mutex);
    auto& outputs = m_snapshot.outputs;
    outputs.erase(
      std::remove_if(outputs.begin(), outputs.end(), [&](const OutputColors& colors){
        return m_sinks.find(colors.output) == m_sinks.end();
      }),
      outputs.end());
    m_snapshot.errors.clear();
    return true;
  }


  void GraphPreview::tick(float dt, Graph::IGraphHost& live)
  {
    const auto start = std::chrono::steady_clock::now();
    Host host(*this, live);
    m_graph.tick(dt, &host);

    Snapshot next;
    {
      std::lock_guard<std::mutex> lock(m_mutex);
      next = m_snapshot;
    }
    next.errors.clear();

    auto place = [&](OutputColors colors){
      auto it = std::find_if(next.outputs.begin(), next.outputs.end(), [&](const OutputColors& existing){
        return existing.output == colors.output;
      });
      if(it == next.outputs.end()){
        next.outputs.push_back(std::move(colors));
      } else {
        *it = std::move(colors);
      }
    };

    for(const SendNode& send : m_sends){
      bool got = false;
      Contracts::Frame frame = m_sinks.at(send.output)->takeFrame(got);
      if(got){
        OutputColors colors{send.output, {}};
        for(const auto& zone : frame){
          colors.zones.push_back(_zone(zone));
        }
        place(std::move(colors));
        continue;
      }

      // A failing node never reaches output.send, so read the error off the
      // edge that feeds it. An absent value keeps the previous colors.
      const Graph::GraphError* error = nullptr;
      for(const auto& edge : m_graph.edges()){
        if(edge.toNode == send.nodeId && edge.toPort == "frame"){
          const Graph::GraphValue* value = m_graph.portValue(edge.fromNode, edge.fromPort);
          error = value ? Graph::asError(*value) : nullptr;
          break;
        }
      }
      if(error == nullptr){
        continue;
      }
      next.errors.push_back({send.output, error->nodeId, error->message});
      OutputColors colors{send.output, {}};
      if(Output::IOutput* output = live.output(send.output)){
        for(std::uint8_t id : output->zoneIds()){
          colors.zones.push_back(_errorZone(id));
        }
      }
      place(std::move(colors));
    }

    const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count();
    std::lock_guard<std::mutex> lock(m_mutex);
    next.tickMs = m_snapshot.tickMs == 0.0 ? ms : m_snapshot.tickMs + (ms - m_snapshot.tickMs) * kCostSmoothing;
    m_snapshot = std::move(next);
  }


  GraphPreview::Snapshot GraphPreview::snapshot() const
  {
    std::lock_guard<std::mutex> lock(m_mutex);
    return m_snapshot;
  }
}
