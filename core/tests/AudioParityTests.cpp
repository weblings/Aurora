#include <catch2/catch_test_macros.hpp>

#include <cmath>
#include <functional>

#include <Aurora/Runtime/AudioOrchestrator.hpp>

#include "GoldenFrames.hpp"

using namespace Aurora::Contracts;
using namespace Aurora::Input;
using namespace Aurora::Runtime;
using namespace Aurora::Tests::Golden;
namespace AudioProcessing = Aurora::Processing::AudioProcessing;

// Golden parity scenarios for the audio path, at two levels:
//  - PCM through AudioOrchestrator: the full path incl. aubio's
//    AudioFeatureExtractor, which update() always runs internally.
//  - Scripted AudioFeatures straight into updateDrift/updateBounce: no
//    aubio, so these pin the color model exactly; they are also what the
//    node graph's Tier 2 decomposition (drift/bounce as primitives) is
//    checked against.
// Every scenario pins fixedAnchorHue -- randomAnchorHue() seeds from
// std::random_device. See GoldenFrames.hpp for fixtures/regeneration.
namespace
{
  constexpr float Pi = 3.14159265358979f;
  constexpr unsigned SampleRate = 48000;
  constexpr int SamplesPerTick = SampleRate / 60; // the app's fixed 1/60s audio tick
  constexpr float Dt = 1.0f / 60.0f;

  struct ScopedTempDir
  {
    std::filesystem::path path;

    explicit ScopedTempDir(const std::string& name):
    path(std::filesystem::temp_directory_path() / ("aurora-audio-parity-" + name))
    {
      std::filesystem::remove_all(path);
    }

    ~ScopedTempDir()
    {
      std::filesystem::remove_all(path);
    }
  };


  // One tick's worth of mono PCM per read, from a generator over the
  // absolute sample index -- deterministic, no wall clock.
  class SequenceAudioInput : public IAudioInput
  {
  public:
    using Generator = std::function<float(long sampleIndex)>;

    explicit SequenceAudioInput(Generator generator): m_generator(std::move(generator)) {}

    const std::string& name() const override
    {
      static const std::string s_name = "SequenceAudioInput";
      return s_name;
    }

    void readNextBuffer(AudioBuffer& buffer) override
    {
      buffer.sampleRate = SampleRate;
      buffer.channelCount = 1;
      buffer.samples.resize(SamplesPerTick);
      for(auto& sample : buffer.samples){
        sample = m_generator(m_sampleIndex++);
      }
    }

  private:
    Generator m_generator;
    long m_sampleIndex{0};
  };


  Recording runPcmScenario(const std::string& tag, SequenceAudioInput& input, AudioProcessing::AudioEffectSettings settings, int ticks)
  {
    ScopedTempDir dir(tag);
    Recording recording;
    int tick = 0;

    // Two active zones plus an inactive one: broadcast reaches every active
    // zone and omits inactive ones (composeAudioFrame).
    ZoneConfig a; a.zoneId = 1; a.everConfigured = true;
    ZoneConfig b; b.zoneId = 2; b.gamma = 0.5f; b.everConfigured = true;
    ZoneConfig c; c.zoneId = 3; c.active = false; c.everConfigured = true;
    ZoneMapStore(dir.path).save("hue", {a, b, c});

    RecordingOutput output("hue", {1, 2, 3}, recording, tick);
    AudioOrchestrator orchestrator(input, {&output}, ZoneMapStore(dir.path), settings);
    orchestrator.init();

    for(tick = 0; tick < ticks; ++tick){
      orchestrator.update(Dt);
    }
    return recording;
  }


  // Seconds within the current second: integer-Hz tones repeat every
  // second, and a small phase argument keeps sin() identical across libms
  // (a raw multi-second float phase loses precision and drifts by platform).
  float wrappedSeconds(long sampleIndex)
  {
    return static_cast<float>(sampleIndex % SampleRate) / SampleRate;
  }


  // A click: short noise burst with a fast exponential decay. Loud against
  // a quiet bed so aubio's onset decision has a wide margin -- fixtures run
  // on platforms whose aubio uses different FFT backends.
  float click(long sinceOnset, Lcg& noise, float brightHz)
  {
    if(sinceOnset < 0 || sinceOnset > SampleRate / 20){
      return 0.0f;
    }
    float t = static_cast<float>(sinceOnset) / SampleRate;
    float envelope = std::exp(-t / 0.008f);
    float tone = brightHz > 0.0f ? 0.4f * std::sin(2.0f * Pi * brightHz * t) : 0.0f;
    return envelope * (0.5f * noise.nextSigned() + tone);
  }


  struct FeatureScript
  {
    float dt;
    int ticks;
    std::function<AudioFeatures(float seconds, int tick)> at;
  };


  Recording runFeatureScenario(const FeatureScript& script, const AudioProcessing::AudioEffectSettings& settings)
  {
    Recording recording;
    AudioProcessing::DriftState drift;
    AudioProcessing::BounceState bounce;

    for(int tick = 0; tick < script.ticks; ++tick){
      AudioFeatures features = script.at(tick * script.dt, tick);
      AudioProcessing::updateDrift(drift, features, settings, script.dt);
      Color color = AudioProcessing::updateBounce(bounce, drift, features, settings, script.dt);
      recording.push_back({tick, "color", Frame{{0, color, 0.0f}}});
    }
    return recording;
  }


  // Beats every 0.5s with strengths cycling strong/weak, a slow loudness
  // swell, and a centroid sweep -- every input the color model reads moves.
  // Onset ticks are derived from time, so the 60Hz and 144Hz runs describe
  // the same music.
  FeatureScript beatScript(float dt, float seconds)
  {
    return {dt, static_cast<int>(std::lround(seconds / dt)), [dt](float t, int tick){
      static const float strengths[] = {1.0f, 0.3f, 0.6f, 0.1f};
      AudioFeatures features;
      int beat = static_cast<int>(std::floor(t / 0.5f));
      int beatTick = static_cast<int>(std::lround(beat * 0.5f / dt));
      features.onsetDetected = tick == beatTick && beat > 0;
      features.onsetStrength = features.onsetDetected ? strengths[beat % 4] : 0.0f;
      features.rms = 0.3f + 0.2f * std::sin(t * 1.3f);
      features.spectralCentroid = 2000.0f + 1500.0f * std::sin(t * 0.4f);
      return features;
    }};
  }


  AudioProcessing::AudioEffectSettings pinnedSettings()
  {
    AudioProcessing::AudioEffectSettings settings;
    settings.fixedAnchorHue = 30.0f;
    return settings;
  }
}


TEST_CASE("Parity: audio PCM click track through AudioOrchestrator", "[Parity][Audio]")
{
  // 120 BPM clicks over a quiet 220Hz bed; every other click carries a 3kHz
  // tone so the spectral centroid moves too. 4s.
  Lcg noise(12345);
  const long beatSamples = SampleRate / 2;
  SequenceAudioInput input([&](long i){
    float bed = 0.05f * std::sin(2.0f * Pi * 220.0f * wrappedSeconds(i));
    long beat = i / beatSamples;
    float bright = (beat % 2) ? 3000.0f : 0.0f;
    return bed + click(i - beat * beatSamples - SampleRate / 10, noise, bright);
  });

  auto recording = runPcmScenario("clicks", input, pinnedSettings(), 240);
  check("audio_pcm_click_track", "48kHz mono, 220Hz bed + 120BPM noise clicks (alternate clicks + 3kHz), fixedAnchorHue 30, zones 1,2 active (2 gamma 0.5), 3 inactive, 240 ticks at 1/60s.", recording);
}


TEST_CASE("Parity: audio PCM silence then loud bursts", "[Parity][Audio]")
{
  // 1s of digital silence (aubio on an all-zero spectrum), then a loud
  // two-tone chord with irregularly spaced clicks. 3s.
  Lcg noise(777);
  const long onsets[] = {60000, 70000, 91000, 100000, 118000, 130000};
  SequenceAudioInput input([&](long i){
    if(i < SampleRate){
      return 0.0f;
    }
    float t = wrappedSeconds(i);
    float chord = 0.15f * (std::sin(2.0f * Pi * 330.0f * t) + std::sin(2.0f * Pi * 495.0f * t));
    float clicks = 0.0f;
    for(long onset : onsets){
      clicks += click(i - onset, noise, 1500.0f);
    }
    return chord + clicks;
  });

  auto recording = runPcmScenario("silence-burst", input, pinnedSettings(), 180);
  check("audio_pcm_silence_then_burst", "1s digital silence, then 330+495Hz chord with clicks at samples 60000/70000/91000/100000/118000/130000, fixedAnchorHue 30, 180 ticks at 1/60s.", recording);
}


TEST_CASE("Parity: audio scripted features, beats at 60Hz", "[Parity][Audio]")
{
  auto recording = runFeatureScenario(beatScript(1.0f / 60.0f, 5.0f), pinnedSettings());
  check("audio_features_beats_60hz", "Scripted features: onsets every 0.5s (strength 1/0.3/0.6/0.1), rms swell, centroid sweep; default settings, fixedAnchorHue 30; dt 1/60, 5s.", recording);
}


TEST_CASE("Parity: audio scripted features, beats at 144Hz", "[Parity][Audio]")
{
  // Same music as the 60Hz case at a different tick rate: drift/bounce are
  // time-based (1 - exp(-dt/tau)), so this pins dt handling.
  auto recording = runFeatureScenario(beatScript(1.0f / 144.0f, 5.0f), pinnedSettings());
  check("audio_features_beats_144hz", "Same script as audio_features_beats_60hz at dt 1/144, 5s.", recording);
}


TEST_CASE("Parity: audio scripted features, silence drift only", "[Parity][Audio]")
{
  // No onsets, no loudness, fixed centroid: pure ambient drift at the base
  // rate, relaxing at brightnessFloor.
  FeatureScript script{1.0f / 60.0f, 600, [](float, int){
    AudioFeatures features;
    features.spectralCentroid = 1500.0f;
    return features;
  }};
  auto recording = runFeatureScenario(script, pinnedSettings());
  check("audio_features_silence_drift", "Scripted silence: no onsets, rms 0, centroid 1500Hz constant; default settings, fixedAnchorHue 30; dt 1/60, 10s.", recording);
}


TEST_CASE("Parity: audio scripted features, every setting off-default", "[Parity][Audio]")
{
  // Pins that each AudioEffectSettings field actually reaches the output.
  AudioProcessing::AudioEffectSettings settings;
  settings.fixedAnchorHue = 200.0f;
  settings.bounceSmoothTime = 0.2f;
  settings.dynamismFloor = 0.5f;
  settings.centroidStrength = 1.0f;
  settings.driftBaseRateDegPerSec = 20.0f;
  settings.vibrancySaturation = 0.7f;
  settings.vibrancyValue = 0.8f;
  settings.referenceRms = 0.3f;
  settings.brightnessFloor = 0.1f;
  settings.centroidRangeHz = 500.0f;
  settings.brightnessSmoothTime = 0.1f;

  auto recording = runFeatureScenario(beatScript(1.0f / 60.0f, 5.0f), settings);
  check("audio_features_tuned_settings", "Beat script at dt 1/60, 5s, with every AudioEffectSettings field off-default (anchor 200, bounce 0.2s, dynamism 0.5, centroid strength 1 / range 500Hz, drift 20deg/s, S 0.7, V 0.8, refRms 0.3, floor 0.1, brightness 0.1s).", recording);
}
