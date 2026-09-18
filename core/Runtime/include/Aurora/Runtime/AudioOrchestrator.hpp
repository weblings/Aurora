#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Input/IAudioInput.hpp>
#include <Aurora/Output/IOutput.hpp>
#include <Aurora/Processing/AudioFeatureExtractor.hpp>
#include <Aurora/Processing/AudioProcessing.hpp>
#include <Aurora/Runtime/ZoneMap.hpp>
#include <Aurora/Runtime/ZoneMapStore.hpp>

// Ties one IAudioInput to any number of IOutputs per-tick -- the audio
// sibling of Orchestrator, deliberately NOT a generalization of it. The two
// pipelines share almost no real steps beyond "send a Frame to each
// output" -- Orchestrator's crop/ZoneMap/composeFrame chain is entirely
// video-shaped, audio has no per-zone spatial concept at all. Validated
// against real VJ software (TouchDesigner's CHOP/TOP split, Resolume's
// audio-as-modulator model), not just this project's own precedent -- see
// Analysis/AudioAnalysis.md's orchestration section.
//
// Unlike Orchestrator::update(), this takes an explicit dt: drift/bounce
// are time-integrated (continuous exponential damping, a rotation rate in
// degrees/sec), not stateless per-tick math, so real elapsed time matters
// here in a way it doesn't for a crop-and-average.
namespace Aurora::Runtime
{
  class AudioOrchestrator
  {
  public:
    // input/outputs must already be init()'d; AudioOrchestrator doesn't own them.
    AudioOrchestrator(
      Input::IAudioInput& input,
      std::vector<Output::IOutput*> outputs,
      ZoneMapStore zoneMapStore,
      Processing::AudioProcessing::AudioEffectSettings settings
    );

    // Reconciles + persists each output's zone map against its live
    // zoneIds() -- same shape as Orchestrator::init(), no refreshRate/
    // subsampleWidth step since neither concept applies to audio.
    void init();

    // One tick: read -> extractFeatures -> updateDrift/updateBounce ->
    // broadcast one Frame per output -> send. No Smoother pass here --
    // updateBounce's own damping already serves that role; stacking a
    // second, independently-tuned easing on top would fight it rather than
    // help.
    void update(float dt);

    // Throws std::out_of_range if outputName wasn't passed to the constructor.
    const ZoneMap& zoneMap(const std::string& outputName) const;
    // Same patch-style contract as Orchestrator::updateZone: only the fields
    // passed are edited, everConfigured is set by the call happening at all,
    // and the result persists immediately via the same ZoneMapStore used at
    // init(). uvs is spatially meaningless for audio but accepted (and
    // persisted) so the shared zone routes stay route-compatible. Returns
    // false (no-op) if outputName isn't live or zoneId isn't in its zone map.
    bool updateZone(
      const std::string& outputName,
      std::uint8_t zoneId,
      const std::optional<Contracts::UVs>& uvs,
      const std::optional<bool>& active,
      const std::optional<float>& gamma
    );

  private:
    Input::IAudioInput& m_input;
    std::vector<Output::IOutput*> m_outputs;
    ZoneMapStore m_zoneMapStore;
    Processing::AudioProcessing::AudioEffectSettings m_settings;
    std::unordered_map<std::string, ZoneMap> m_zoneMapsByOutput;
    Processing::AudioProcessing::DriftState m_driftState;
    Processing::AudioProcessing::BounceState m_bounceState;
    Contracts::AudioBuffer m_buffer;

    // Lazily constructed on the first non-empty buffer -- AudioFeatureExtractor
    // needs a real sampleRate up front (aubio's objects are configured at
    // construction), which isn't known until the input actually produces data.
    std::unique_ptr<Processing::AudioProcessing::AudioFeatureExtractor> m_featureExtractor;
  };
}
