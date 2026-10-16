#include <Aurora/Runtime/GraphRunner.hpp>

#include <algorithm>
#include <stdexcept>
#include <utility>

#include <Aurora/Runtime/Graph/BuiltInGraphs.hpp>
#include <Aurora/Runtime/Graph/FrameNodes.hpp>
#include <Aurora/Runtime/Graph/MathNodes.hpp>
#include <Aurora/Runtime/Graph/VideoNodes.hpp>
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
#include <Aurora/Runtime/Graph/AudioNodes.hpp>
#endif
#include <Aurora/Runtime/MonitorSelector.hpp>
#include <Aurora/Runtime/SubsampleDefaults.hpp>
#include <Aurora/Runtime/ZoneReconciler.hpp>

namespace Aurora::Runtime
{
  namespace
  {
    // Where the video graph's post-dropAlpha image leaves (DevFrameDump tap).
    constexpr const char* kTapNode = "opaque";
    constexpr const char* kTapPort = "image";
  }


  GraphRunner::GraphRunner(
    Input::IVideoInput& input,
    std::vector<Output::IOutput*> outputs,
    Config config,
    ZoneMapStore zoneMapStore
  ):
  m_videoInput(&input),
  m_outputs(std::move(outputs)),
  m_config(std::move(config)),
  m_zoneMapStore(std::move(zoneMapStore))
  {
    Graph::registerVideoNodes(m_registry);
    Graph::registerFrameNodes(m_registry);
    Graph::registerMathNodes(m_registry);
  }


#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
  GraphRunner::GraphRunner(
    Input::IAudioInput& input,
    std::vector<Output::IOutput*> outputs,
    Config config,
    ZoneMapStore zoneMapStore
  ):
  m_isAudio(true),
  m_audioInput(&input),
  m_outputs(std::move(outputs)),
  m_config(std::move(config)),
  m_zoneMapStore(std::move(zoneMapStore))
  {
    Graph::registerAudioNodes(m_registry);
    Graph::registerFrameNodes(m_registry);
    Graph::registerMathNodes(m_registry);
  }
#endif


  bool GraphRunner::_load(const Config& config, Graph::LoadResult& result) const
  {
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
    if(m_isAudio){
      result = Graph::loadBuiltInAudioGraph(m_registry, m_outputNames, config.data());
      return result.ok;
    }
#endif
    result = Graph::loadBuiltInVideoGraph(m_registry, m_outputNames, config.data());
    return result.ok;
  }


  nlohmann::json GraphRunner::graphJson() const
  {
#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE
    if(m_isAudio){
      return Graph::builtInAudioGraph(m_outputNames, Graph::audioOverlayFromConfig(m_config.data()));
    }
#endif
    return Graph::builtInVideoGraph(
      m_outputNames, Graph::videoOverlayFromConfig(m_config.data(), m_outputNames));
  }


  void GraphRunner::init()
  {
    if(m_videoInput){
      // Must run before refreshRate/subsampleWidth derivation: both read the
      // input's currently selected monitor.
      selectConfiguredMonitor(*m_videoInput, m_config);

      if(m_config.refreshRate() == 0){
        m_config.setRefreshRate(
          std::min<unsigned>(m_videoInput->displayRefreshRate(), Config::kMaxDerivedRefreshRate));
      }

      if(m_config.subsampleWidth() == 0){
        auto candidates = m_videoInput->subsampleResolutionCandidates();
        auto displayWidth = m_videoInput->displayResolution().x;

        if(!candidates.empty()){
          int picked = pickDefaultSubsampleWidth(candidates, displayWidth);
          m_config.setSubsampleWidth(static_cast<unsigned>(picked));
        }
      }

      // Lets a GPU-scaling grabber (Mac) deliver a frame near the size the
      // rescale node targets, instead of full resolution (Aurora-3qh).
      m_videoInput->setCaptureWidthHint(m_config.subsampleWidth());
    }

    // Re-runnable: a second init() re-reads the saved zone maps.
    m_outputNames.clear();
    m_outputsByName.clear();
    for(auto* output : m_outputs){
      m_outputNames.push_back(output->name());
      m_outputsByName[output->name()] = output;

      ZoneMap saved = m_zoneMapStore.load(output->name());
      ZoneMap reconciled = reconcileZoneMap(saved, output->zoneIds());

      // Persist now so newly discovered zones get a saved row before anyone
      // edits them.
      m_zoneMapStore.save(output->name(), reconciled);
      m_zoneMapsByOutput[output->name()] = std::move(reconciled);
    }

    Graph::LoadResult loaded;
    if(!_load(m_config, loaded)){
      throw std::runtime_error("built-in graph failed to load: " + loaded.error);
    }
    m_graph = std::move(loaded.graph);
    m_loaded = true;
  }


  void GraphRunner::tick(float dt)
  {
    if(!m_loaded){
      return;
    }

    m_graph.tick(dt, &m_host);

    if(!m_isAudio){
      const Graph::GraphValue* value = m_graph.portValue(kTapNode, kTapPort);
      if(value){
        if(const auto* image = std::get_if<Graph::ImagePtr>(value); image && *image){
          m_devFrameDump.publish(**image);
        }
      }
    }
  }


  const ZoneMap& GraphRunner::zoneMap(const std::string& outputName) const
  {
    return m_zoneMapsByOutput.at(outputName);
  }


  bool GraphRunner::updateZone(
    const std::string& outputName,
    std::uint8_t zoneId,
    const std::optional<Contracts::UVs>& uvs,
    const std::optional<bool>& active,
    const std::optional<float>& gamma
  )
  {
    auto it = m_zoneMapsByOutput.find(outputName);
    if(it == m_zoneMapsByOutput.end()){
      return false;
    }

    for(auto& zone : it->second){
      if(zone.zoneId != zoneId){
        continue;
      }

      if(uvs) zone.uvs = *uvs;
      if(active) zone.active = *active;
      if(gamma) zone.gamma = *gamma;
      zone.everConfigured = true;

      m_zoneMapStore.save(outputName, it->second);
      return true;
    }

    return false;
  }


  bool GraphRunner::setConfig(Config config, std::string& errorOut)
  {
    Graph::LoadResult loaded;
    if(!_load(config, loaded)){
      errorOut = loaded.error;
      return false;
    }

    // Adopt and swap together, and never tick the old graph afterwards:
    // adoption leaves null nodes behind in it.
    loaded.graph.adoptStateFrom(m_graph);
    m_graph = std::move(loaded.graph);
    m_config = std::move(config);
    return true;
  }


  Output::IOutput* GraphRunner::Host::output(std::string_view name)
  {
    auto it = m_runner.m_outputsByName.find(std::string(name));
    return it == m_runner.m_outputsByName.end() ? nullptr : it->second;
  }


  const ZoneMap* GraphRunner::Host::zoneMap(std::string_view outputName)
  {
    auto it = m_runner.m_zoneMapsByOutput.find(std::string(outputName));
    return it == m_runner.m_zoneMapsByOutput.end() ? nullptr : &it->second;
  }
}
