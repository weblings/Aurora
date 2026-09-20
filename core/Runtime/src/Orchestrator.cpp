#include <Aurora/Runtime/Orchestrator.hpp>

#include <utility>

#include <Aurora/Processing/ImageProcessing.hpp>
#include <Aurora/Runtime/FrameCompositor.hpp>
#include <Aurora/Runtime/MonitorSelector.hpp>
#include <Aurora/Runtime/SubsampleDefaults.hpp>
#include <Aurora/Runtime/ZoneReconciler.hpp>

namespace Aurora::Runtime
{
  Orchestrator::Orchestrator(
    Input::IVideoInput& input,
    std::vector<Output::IOutput*> outputs,
    Config config,
    ZoneMapStore zoneMapStore
  ):
  m_input(input),
  m_outputs(std::move(outputs)),
  m_config(std::move(config)),
  m_zoneMapStore(std::move(zoneMapStore))
  {}


  void Orchestrator::init()
  {
    // Must run before refreshRate/subsampleWidth derivation below -- both
    // read the input's *currently selected* monitor.
    selectConfiguredMonitor(m_input, m_config);

    if(m_config.refreshRate() == 0){
      m_config.setRefreshRate(m_input.displayRefreshRate());
    }

    if(m_config.subsampleWidth() == 0){
      auto candidates = m_input.subsampleResolutionCandidates();
      auto displayWidth = m_input.displayResolution().x;

      if(!candidates.empty()){
        int picked = pickDefaultSubsampleWidth(candidates, displayWidth);
        m_config.setSubsampleWidth(static_cast<unsigned>(picked));
      }
    }

    for(auto* output : m_outputs){
      ZoneMap saved = m_zoneMapStore.load(output->name());
      ZoneMap reconciled = reconcileZoneMap(saved, output->zoneIds());

      // Persist immediately so newly discovered zones get a saved row even
      // before anyone edits them, matching huenicorn's save-on-every-setter feel.
      m_zoneMapStore.save(output->name(), reconciled);
      m_zoneMapsByOutput[output->name()] = std::move(reconciled);
    }
  }


  void Orchestrator::_prepareSource(Contracts::ImageData& source) const
  {
    const auto subsampleWidth = static_cast<int>(m_config.subsampleWidth());

    if(subsampleWidth > 0 && source.width() > subsampleWidth){
      Contracts::ImageData resized;
      Processing::ImageProcessing::rescale(source, resized, subsampleWidth, m_config.interpolation());

      if(resized.hasData()){
        source = std::move(resized);
      }
    }

    // dropAlpha() is a safe no-op pass-through for already-opaque formats --
    // see docs/ProcessingAnalysis.md -- so it's fine to call unconditionally.
    Contracts::ImageData opaque;
    Processing::ImageProcessing::dropAlpha(source, opaque);
    source = std::move(opaque);
  }


  void Orchestrator::update()
  {
    m_input.grabFrameSubsample(m_frameData);
    if(!m_frameData.hasData()){
      return;
    }

    Contracts::ImageData source = m_frameData;
    _prepareSource(source);

    for(auto* output : m_outputs){
      const auto& zoneMap = m_zoneMapsByOutput.at(output->name());

      Contracts::Frame frame = composeFrame(source, zoneMap);
      Contracts::Frame smoothed = m_smoother.smooth(output->name(), frame, m_config.transitionSmoothing());

      output->send(smoothed);
    }
  }


  const ZoneMap& Orchestrator::zoneMap(const std::string& outputName) const
  {
    return m_zoneMapsByOutput.at(outputName);
  }


  bool Orchestrator::updateZone(
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


  const Config& Orchestrator::config() const
  {
    return m_config;
  }
}
