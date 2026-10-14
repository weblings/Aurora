#include <catch2/catch_test_macros.hpp>

#include <cmath>
#include <functional>
#include <memory>

#include <Aurora/Runtime/AudioOrchestrator.hpp>
#include <Aurora/Runtime/Graph/AudioNodes.hpp>
#include <Aurora/Runtime/Graph/BuiltInGraphs.hpp>
#include <Aurora/Runtime/Graph/FrameNodes.hpp>
#include <Aurora/Runtime/ZoneReconciler.hpp>

#include "GoldenFrames.hpp"
#include "GraphParityHost.hpp"

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
// Each scenario also runs through the built-in Audio graph against the same
// fixture (Aurora-ra4o.7); scripted features enter it through a test-only
// node standing in for audio.capture + audio.features.
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


  using MakeInput = std::function<SequenceAudioInput()>;

  // Two active zones plus an inactive one: broadcast reaches every active
  // zone and omits inactive ones (composeAudioFrame).
  ZoneMap pcmZones()
  {
    ZoneConfig a; a.zoneId = 1; a.everConfigured = true;
    ZoneConfig b; b.zoneId = 2; b.gamma = 0.5f; b.everConfigured = true;
    ZoneConfig c; c.zoneId = 3; c.active = false; c.everConfigured = true;
    return {a, b, c};
  }


  // AudioEffectSettings -> the ConfigData fields the built-in graph overlays.
  ConfigData configFrom(const AudioProcessing::AudioEffectSettings& settings)
  {
    ConfigData data;
    data.audioFixedAnchorHue = settings.fixedAnchorHue.value_or(-1.0f);
    data.audioBounceSmoothTime = settings.bounceSmoothTime;
    data.audioDynamismFloor = settings.dynamismFloor;
    data.audioCentroidStrength = settings.centroidStrength;
    data.audioDriftBaseRateDegPerSec = settings.driftBaseRateDegPerSec;
    data.audioVibrancySaturation = settings.vibrancySaturation;
    data.audioVibrancyValue = settings.vibrancyValue;
    data.audioReferenceRms = settings.referenceRms;
    data.audioBrightnessFloor = settings.brightnessFloor;
    data.audioCentroidRangeHz = settings.centroidRangeHz;
    data.audioBrightnessSmoothTime = settings.brightnessSmoothTime;
    return data;
  }


  Recording runPcmScenario(const std::string& tag, SequenceAudioInput& input, AudioProcessing::AudioEffectSettings settings, int ticks)
  {
    ScopedTempDir dir(tag);
    Recording recording;
    int tick = 0;

    ZoneMapStore(dir.path).save("hue", pcmZones());

    RecordingOutput output("hue", {1, 2, 3}, recording, tick);
    AudioOrchestrator orchestrator(input, {&output}, ZoneMapStore(dir.path), settings);
    orchestrator.init();

    for(tick = 0; tick < ticks; ++tick){
      orchestrator.update(Dt);
    }
    return recording;
  }


  // One output "hue" with the PCM scenarios' zones, and the audio + frame
  // nodes registered.
  struct GraphRig
  {
    Recording recording;
    int tick{0};
    std::unique_ptr<RecordingOutput> output;
    Aurora::Tests::Golden::ParityHost host;
    Aurora::Runtime::Graph::NodeRegistry registry;

    GraphRig()
    {
      output = std::make_unique<RecordingOutput>("hue", std::vector<uint8_t>{1, 2, 3}, recording, tick);
      host.outputs["hue"] = output.get();
      host.zoneMaps["hue"] = reconcileZoneMap(pcmZones(), output->zoneIds());
      Aurora::Runtime::Graph::registerAudioNodes(registry);
      Aurora::Runtime::Graph::registerFrameNodes(registry);
    }
  };


  Recording runGraphPcmScenario(SequenceAudioInput& input, const AudioProcessing::AudioEffectSettings& settings, int ticks)
  {
    GraphRig rig;
    rig.host.audio = &input;
    auto loaded = Aurora::Runtime::Graph::loadBuiltInAudioGraph(rig.registry, {"hue"}, configFrom(settings));
    INFO(loaded.error);
    REQUIRE(loaded.ok);
    // The built-in Audio graph declares today's fixed 60Hz tick.
    REQUIRE(loaded.graph.tickHz().value_or(0.0) == 60.0);

    for(rig.tick = 0; rig.tick < ticks; ++rig.tick){
      loaded.graph.tick(Dt, &rig.host);
    }
    return rig.recording;
  }


  // Fresh input per path (inputs count samples). The graph run is skipped
  // while regenerating so fixtures stay derived from the legacy path.
  void checkPcmBothPaths(
    const std::string& scenario,
    const std::string& description,
    const MakeInput& makeInput,
    const AudioProcessing::AudioEffectSettings& settings,
    int ticks)
  {
    {
      INFO("path: AudioOrchestrator");
      SequenceAudioInput input = makeInput();
      check(scenario, description, runPcmScenario(scenario, input, settings, ticks));
    }
    if(std::getenv("AURORA_UPDATE_GOLDEN")){
      return;
    }
    {
      INFO("path: built-in Audio graph");
      SequenceAudioInput input = makeInput();
      check(scenario, description, runGraphPcmScenario(input, settings, ticks));
    }
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


  // Test-only stand-in for audio.capture + audio.features: replays the
  // script's AudioFeatures, one per tick.
  class ScriptedFeaturesNode : public Aurora::Runtime::Graph::INode
  {
  public:
    explicit ScriptedFeaturesNode(FeatureScript script): m_script(std::move(script)) {}

    const std::vector<Aurora::Runtime::Graph::PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<Aurora::Runtime::Graph::PortDecl>& outputPorts() const override { return m_out; }

    void evaluate(
      const Aurora::Runtime::Graph::EvalContext&,
      float,
      std::unordered_map<std::string, Aurora::Runtime::Graph::GraphValue>& outputs) override
    {
      outputs.emplace("features", m_script.at(m_tick * m_script.dt, m_tick));
      ++m_tick;
    }

  private:
    FeatureScript m_script;
    int m_tick{0};
    std::vector<Aurora::Runtime::Graph::PortDecl> m_in{};
    std::vector<Aurora::Runtime::Graph::PortDecl> m_out{
      {"features", Aurora::Runtime::Graph::PortType::AudioFeatures, false}};
  };


  // The built-in Audio graph with cap + feat swapped for the scripted node
  // (same id "feat", so every downstream edge is the built-in's own). The
  // recording is the color the bounce node outputs, as in runFeatureScenario.
  Recording runGraphFeatureScenario(const FeatureScript& script, const AudioProcessing::AudioEffectSettings& settings)
  {
    using namespace Aurora::Runtime::Graph;

    GraphRig rig;
    rig.registry.registerType(
      "test.features",
      NodeTypeInfo{
        .meta = {.purpose = "test", .useWhen = "test", .example = "{}", .cost = "cheap"},
        .inputs = {},
        .outputs = {{"features", PortType::AudioFeatures, false}},
        .params = {},
        .factory = [script] { return std::make_unique<ScriptedFeaturesNode>(script); },
      });

    nlohmann::json doc = builtInAudioGraph({"hue"}, audioOverlayFromConfig(configFrom(settings)));
    nlohmann::json nodes = nlohmann::json::array();
    nodes.push_back({{"id", "feat"}, {"type", "test.features"}, {"params", nlohmann::json::object()}});
    for(const auto& node : doc["nodes"]){
      if(node["id"] != "cap" && node["id"] != "feat"){
        nodes.push_back(node);
      }
    }
    nlohmann::json edges = nlohmann::json::array();
    for(const auto& edge : doc["edges"]){
      if(edge[0] != "cap.buffer"){
        edges.push_back(edge);
      }
    }
    doc["nodes"] = nodes;
    doc["edges"] = edges;

    LoadOptions options;
    options.knownOutputs = {"hue"};
    auto loaded = loadGraph(doc, rig.registry, options);
    INFO(loaded.error);
    REQUIRE(loaded.ok);

    Recording recording;
    for(rig.tick = 0; rig.tick < script.ticks; ++rig.tick){
      loaded.graph.tick(script.dt, &rig.host);
      const GraphValue* color = loaded.graph.portValue("beat", "color");
      REQUIRE(color != nullptr);
      REQUIRE(std::holds_alternative<Color>(*color));
      recording.push_back({rig.tick, "color", Frame{{0, std::get<Color>(*color), 0.0f}}});
    }
    return recording;
  }


  void checkFeaturesBothPaths(
    const std::string& scenario,
    const std::string& description,
    const FeatureScript& script,
    const AudioProcessing::AudioEffectSettings& settings)
  {
    {
      INFO("path: updateDrift/updateBounce");
      check(scenario, description, runFeatureScenario(script, settings));
    }
    if(std::getenv("AURORA_UPDATE_GOLDEN")){
      return;
    }
    {
      INFO("path: built-in Audio graph");
      check(scenario, description, runGraphFeatureScenario(script, settings));
    }
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
  const MakeInput makeInput = [] {
    auto noise = std::make_shared<Lcg>(12345);
    const long beatSamples = SampleRate / 2;
    return SequenceAudioInput([noise, beatSamples](long i){
      float bed = 0.05f * std::sin(2.0f * Pi * 220.0f * wrappedSeconds(i));
      long beat = i / beatSamples;
      float bright = (beat % 2) ? 3000.0f : 0.0f;
      return bed + click(i - beat * beatSamples - SampleRate / 10, *noise, bright);
    });
  };

  checkPcmBothPaths("audio_pcm_click_track", "48kHz mono, 220Hz bed + 120BPM noise clicks (alternate clicks + 3kHz), fixedAnchorHue 30, zones 1,2 active (2 gamma 0.5), 3 inactive, 240 ticks at 1/60s.", makeInput, pinnedSettings(), 240);
}


TEST_CASE("Parity: audio PCM silence then loud bursts", "[Parity][Audio]")
{
  // 1s of digital silence (aubio on an all-zero spectrum), then a loud
  // two-tone chord with irregularly spaced clicks. 3s.
  const MakeInput makeInput = [] {
    auto noise = std::make_shared<Lcg>(777);
    return SequenceAudioInput([noise](long i){
      static const long onsets[] = {60000, 70000, 91000, 100000, 118000, 130000};
      if(i < SampleRate){
        return 0.0f;
      }
      float t = wrappedSeconds(i);
      float chord = 0.15f * (std::sin(2.0f * Pi * 330.0f * t) + std::sin(2.0f * Pi * 495.0f * t));
      float clicks = 0.0f;
      for(long onset : onsets){
        clicks += click(i - onset, *noise, 1500.0f);
      }
      return chord + clicks;
    });
  };

  checkPcmBothPaths("audio_pcm_silence_then_burst", "1s digital silence, then 330+495Hz chord with clicks at samples 60000/70000/91000/100000/118000/130000, fixedAnchorHue 30, 180 ticks at 1/60s.", makeInput, pinnedSettings(), 180);
}


TEST_CASE("Parity: audio scripted features, beats at 60Hz", "[Parity][Audio]")
{
  checkFeaturesBothPaths("audio_features_beats_60hz", "Scripted features: onsets every 0.5s (strength 1/0.3/0.6/0.1), rms swell, centroid sweep; default settings, fixedAnchorHue 30; dt 1/60, 5s.", beatScript(1.0f / 60.0f, 5.0f), pinnedSettings());
}


TEST_CASE("Parity: audio scripted features, beats at 144Hz", "[Parity][Audio]")
{
  // Same music as the 60Hz case at a different tick rate: drift/bounce are
  // time-based (1 - exp(-dt/tau)), so this pins dt handling.
  checkFeaturesBothPaths("audio_features_beats_144hz", "Same script as audio_features_beats_60hz at dt 1/144, 5s.", beatScript(1.0f / 144.0f, 5.0f), pinnedSettings());
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
  checkFeaturesBothPaths("audio_features_silence_drift", "Scripted silence: no onsets, rms 0, centroid 1500Hz constant; default settings, fixedAnchorHue 30; dt 1/60, 10s.", script, pinnedSettings());
}


TEST_CASE("Parity: audio scripted features, every setting off-default", "[Parity][Audio]")
{
  // Pins that each AudioEffectSettings field actually reaches the output
  // (through the graph: every ConfigData field reaches its node param).
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

  checkFeaturesBothPaths("audio_features_tuned_settings", "Beat script at dt 1/60, 5s, with every AudioEffectSettings field off-default (anchor 200, bounce 0.2s, dynamism 0.5, centroid strength 1 / range 500Hz, drift 20deg/s, S 0.7, V 0.8, refRms 0.3, floor 0.1, brightness 0.1s).", beatScript(1.0f / 60.0f, 5.0f), settings);
}
