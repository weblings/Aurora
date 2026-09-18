#include <Aurora/Runtime/AudioOrchestrator.hpp>

#include <utility>

#include <Aurora/Runtime/AudioFrameCompositor.hpp>
#include <Aurora/Runtime/ZoneReconciler.hpp>

namespace Aurora::Runtime
{
  AudioOrchestrator::AudioOrchestrator(
    Input::IAudioInput& input,
    std::vector<Output::IOutput*> outputs,
    ZoneMapStore zoneMapStore,
    Processing::AudioProcessing::AudioEffectSettings settings
  ):
  m_input(input),
  m_outputs(std::move(outputs)),
  m_zoneMapStore(std::move(zoneMapStore)),
  m_settings(std::move(settings))
  {}


  void AudioOrchestrator::init()
  {
    for(auto* output : m_outputs){
      ZoneMap saved = m_zoneMapStore.load(output->name());
      ZoneMap reconciled = reconcileZoneMap(saved, output->zoneIds());

      // Persist immediately so newly discovered zones get a saved row even
      // before anyone edits them, same reasoning as Orchestrator::init().
      m_zoneMapStore.save(output->name(), reconciled);
      m_zoneMapsByOutput[output->name()] = std::move(reconciled);
    }
  }


  void AudioOrchestrator::update(float dt)
  {
    m_input.readNextBuffer(m_buffer);
    if(m_buffer.samples.empty()){
      return;
    }

    if(!m_featureExtractor){
      m_featureExtractor = std::make_unique<Processing::AudioProcessing::AudioFeatureExtractor>(
        m_buffer.sampleRate
      );
    }

    auto features = m_featureExtractor->process(m_buffer);
    Processing::AudioProcessing::updateDrift(m_driftState, features, m_settings, dt);
    Contracts::Color color = Processing::AudioProcessing::updateBounce(
      m_bounceState, m_driftState, features, m_settings, dt
    );

    for(auto* output : m_outputs){
      const auto& zoneMap = m_zoneMapsByOutput.at(output->name());
      Contracts::Frame frame = composeAudioFrame(color, zoneMap);
      output->send(frame);
    }
  }


  bool AudioOrchestrator::updateZone(
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


  const ZoneMap& AudioOrchestrator::zoneMap(const std::string& outputName) const
  {
    return m_zoneMapsByOutput.at(outputName);
  }
}
