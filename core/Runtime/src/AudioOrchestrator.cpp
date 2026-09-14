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

    auto features = Processing::AudioProcessing::extractFeatures(m_buffer);
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


  const ZoneMap& AudioOrchestrator::zoneMap(const std::string& outputName) const
  {
    return m_zoneMapsByOutput.at(outputName);
  }
}
