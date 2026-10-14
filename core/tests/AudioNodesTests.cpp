// G2b Tier 1 audio nodes (Aurora-ra4o.5): per-node tests through the Graph.
// Wraps existing functions unchanged: IAudioInput::readNextBuffer,
// AudioFeatureExtractor, updateDrift, updateBounce.
#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_floating_point.hpp>

#include <memory>
#include <string>

#include <Aurora/Runtime/AudioFrameCompositor.hpp>
#include <Aurora/Runtime/Graph/AudioNodes.hpp>
#include <Aurora/Runtime/Graph/Graph.hpp>
#include <Aurora/Runtime/Graph/GraphLoader.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

using namespace Aurora::Contracts;
using namespace Aurora::Input;
using namespace Aurora::Runtime;
using namespace Aurora::Runtime::Graph;

namespace
{
  class FakeAudioInput : public IAudioInput
  {
  public:
    const std::string& name() const override
    {
      static const std::string s_name = "FakeAudio";
      return s_name;
    }

    void readNextBuffer(AudioBuffer& buffer) override
    {
      reads++;
      if(!hasBuffer){
        buffer = AudioBuffer{};
        return;
      }
      buffer.sampleRate = sampleRate;
      buffer.channelCount = 1;
      buffer.samples = samples;
    }

    bool hasBuffer{true};
    unsigned sampleRate{44100};
    std::vector<float> samples{0.5f, -0.5f, 0.5f, -0.5f};
    int reads{0};
  };

  class FakeHost : public IGraphHost
  {
  public:
    IAudioInput* audioInput() override { return audio; }

    IAudioInput* audio{nullptr};
  };

  NodeRegistry makeAudioRegistry()
  {
    NodeRegistry registry;
    registerAudioNodes(registry);
    return registry;
  }

  Aurora::Runtime::Graph::Graph requireGraph(const std::string& json, NodeRegistry& registry)
  {
    LoadResult result = loadGraphFromString(json, registry);
    REQUIRE(result.ok);
    return std::move(result.graph);
  }

  const AudioBuffer& requireBuffer(const GraphValue* value)
  {
    REQUIRE(value != nullptr);
    const AudioBuffer* buffer = std::get_if<AudioBuffer>(value);
    REQUIRE(buffer != nullptr);
    return *buffer;
  }

  const AudioFeatures& requireFeatures(const GraphValue* value)
  {
    REQUIRE(value != nullptr);
    const AudioFeatures* features = std::get_if<AudioFeatures>(value);
    REQUIRE(features != nullptr);
    return *features;
  }

  const Angle& requireAngle(const GraphValue* value)
  {
    REQUIRE(value != nullptr);
    const Angle* angle = std::get_if<Angle>(value);
    REQUIRE(angle != nullptr);
    return *angle;
  }

  const Color& requireColor(const GraphValue* value)
  {
    REQUIRE(value != nullptr);
    const Color* color = std::get_if<Color>(value);
    REQUIRE(color != nullptr);
    return *color;
  }

  // capture -> features -> drift -> bounce, all defaults except the pinned anchor.
  const char* kFullChain = R"({"version": 1, "nodes": [
    {"id": "cap", "type": "audio.capture", "params": {}},
    {"id": "feat", "type": "audio.features", "params": {}},
    {"id": "drift", "type": "audio.drift", "params": {"fixedAnchorHue": 120.0}},
    {"id": "beat", "type": "audio.bounce", "params": {"fixedAnchorHue": 120.0}}
  ], "edges": [
    ["cap.buffer", "feat.buffer"],
    ["feat.features", "drift.features"],
    ["feat.features", "beat.features"],
    ["drift.anchor", "beat.anchor"]
  ]})";
} // namespace

TEST_CASE("audio node types are registered", "[AudioNodes]")
{
  NodeRegistry registry = makeAudioRegistry();
  CHECK(registry.find("audio.capture") != nullptr);
  CHECK(registry.find("audio.features") != nullptr);
  CHECK(registry.find("audio.drift") != nullptr);
  CHECK(registry.find("audio.bounce") != nullptr);
}

TEST_CASE("audio.capture emits the buffer, Absent when empty, error without host", "[AudioNodes]")
{
  NodeRegistry registry = makeAudioRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(
    R"({"version": 1, "nodes": [{"id": "cap", "type": "audio.capture", "params": {}}], "edges": []})",
    registry);

  FakeAudioInput input;
  FakeHost host;
  host.audio = &input;

  graph.tick(1.f / 60.f, &host);
  const AudioBuffer& buffer = requireBuffer(graph.portValue("cap", "buffer"));
  CHECK(buffer.sampleRate == 44100);
  CHECK(buffer.samples.size() == 4);

  input.hasBuffer = false;
  graph.tick(1.f / 60.f, &host);
  REQUIRE(graph.portValue("cap", "buffer") != nullptr);
  CHECK(isAbsent(*graph.portValue("cap", "buffer")));

  Aurora::Runtime::Graph::Graph noHost = requireGraph(
    R"({"version": 1, "nodes": [{"id": "cap", "type": "audio.capture", "params": {}}], "edges": []})",
    registry);
  noHost.tick(1.f / 60.f, nullptr);
  const GraphValue* value = noHost.portValue("cap", "buffer");
  REQUIRE(value != nullptr);
  const GraphError* err = asError(*value);
  REQUIRE(err != nullptr);
  CHECK(err->nodeId == "cap");
}

TEST_CASE("audio.features extracts rms through the Graph", "[AudioNodes]")
{
  NodeRegistry registry = makeAudioRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(
    R"({"version": 1, "nodes": [
      {"id": "cap", "type": "audio.capture", "params": {}},
      {"id": "feat", "type": "audio.features", "params": {}}
    ], "edges": [["cap.buffer", "feat.buffer"]]})",
    registry);

  FakeAudioInput input;
  FakeHost host;
  host.audio = &input;

  graph.tick(1.f / 60.f, &host);
  const AudioFeatures& features = requireFeatures(graph.portValue("feat", "features"));
  // {0.5, -0.5, 0.5, -0.5} mono: rms is exactly 0.5. Four samples never
  // fill a 512-sample aubio hop, so no onset fires.
  CHECK_THAT(features.rms, Catch::Matchers::WithinRel(0.5f, 1e-6f));
  CHECK_FALSE(features.onsetDetected);
}

TEST_CASE("audio.drift seeds the anchor from fixedAnchorHue and drifts", "[AudioNodes]")
{
  NodeRegistry registry = makeAudioRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(
    R"({"version": 1, "nodes": [
      {"id": "cap", "type": "audio.capture", "params": {}},
      {"id": "feat", "type": "audio.features", "params": {}},
      {"id": "drift", "type": "audio.drift", "params": {"fixedAnchorHue": 120.0}}
    ], "edges": [
      ["cap.buffer", "feat.buffer"],
      ["feat.features", "drift.features"]
    ]})",
    registry);

  FakeAudioInput input;
  FakeHost host;
  host.audio = &input;

  constexpr float dt = 1.f / 60.f;
  graph.tick(dt, &host);
  // First tick only establishes state (updateDrift's cold-start rule).
  CHECK(requireAngle(graph.portValue("drift", "anchor")).degrees == 120.f);

  graph.tick(dt, &host);
  // Default drift rate is 10 deg/s in the negative direction; the silent
  // fake buffer has centroid 0, so no rate bias applies.
  CHECK_THAT(
    requireAngle(graph.portValue("drift", "anchor")).degrees,
    Catch::Matchers::WithinRel(120.f - 10.f * dt, 1e-4f));
}

TEST_CASE("audio chain capture -> features -> drift -> bounce matches the orchestrator's first tick", "[AudioNodes]")
{
  NodeRegistry registry = makeAudioRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(kFullChain, registry);

  FakeAudioInput input;
  FakeHost host;
  host.audio = &input;

  graph.tick(1.f / 60.f, &host);
  // First tick: bounce seeds current/target from the live anchor (120) and
  // brightness from this tick's factor (rms 0.5 / ref 0.5 = full), so the
  // color is the anchor at full vibrancy -- same as
  // AudioOrchestrator::update's first send with these settings.
  CHECK(requireColor(graph.portValue("beat", "color")) == Color::fromHSV(120.f, 0.95f, 0.95f));
}

TEST_CASE("audio.drift and audio.bounce stay silent while capture is empty", "[AudioNodes]")
{
  NodeRegistry registry = makeAudioRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(kFullChain, registry);

  FakeAudioInput input;
  FakeHost host;
  host.audio = &input;

  graph.tick(1.f / 60.f, &host);
  REQUIRE_FALSE(isAbsent(*graph.portValue("beat", "color")));

  input.hasBuffer = false;
  graph.tick(1.f / 60.f, &host);
  // Empty buffer -> Absent propagates through features, drift and bounce,
  // and output.send would send nothing -- the orchestrator's early return.
  CHECK(isAbsent(*graph.portValue("cap", "buffer")));
  CHECK(isAbsent(*graph.portValue("feat", "features")));
  CHECK(isAbsent(*graph.portValue("drift", "anchor")));
  CHECK(isAbsent(*graph.portValue("beat", "color")));

  // State froze while Absent: the anchor resumes from where it was, it did
  // not advance during the empty tick.
  input.hasBuffer = true;
  graph.tick(1.f / 60.f, &host);
  CHECK_THAT(
    requireAngle(graph.portValue("drift", "anchor")).degrees,
    Catch::Matchers::WithinRel(120.f - 10.f / 60.f, 1e-4f));
}

TEST_CASE("changing fixedAnchorHue re-seeds drift and bounce together", "[AudioNodes]")
{
  NodeRegistry registry = makeAudioRegistry();
  Aurora::Runtime::Graph::Graph live = requireGraph(kFullChain, registry);

  FakeAudioInput input;
  FakeHost host;
  host.audio = &input;

  constexpr float dt = 1.f / 60.f;
  live.tick(dt, &host);
  live.tick(dt, &host);
  live.tick(dt, &host);
  // Anchor drifted off 120 by now.
  REQUIRE(requireAngle(live.portValue("drift", "anchor")).degrees != 120.f);

  // Same chain, new fixed hue on both nodes -- params arrive via a graph
  // swap, state carries by stable node id (adoptStateFrom).
  Aurora::Runtime::Graph::Graph next = requireGraph(
    R"({"version": 1, "nodes": [
      {"id": "cap", "type": "audio.capture", "params": {}},
      {"id": "feat", "type": "audio.features", "params": {}},
      {"id": "drift", "type": "audio.drift", "params": {"fixedAnchorHue": 240.0}},
      {"id": "beat", "type": "audio.bounce", "params": {"fixedAnchorHue": 240.0}}
    ], "edges": [
      ["cap.buffer", "feat.buffer"],
      ["feat.features", "drift.features"],
      ["feat.features", "beat.features"],
      ["drift.anchor", "beat.anchor"]
    ]})",
    registry);
  next.adoptStateFrom(live);
  next.tick(dt, &host);

  // Both ends re-seeded from the new anchor on the next tick, mirroring
  // AudioOrchestrator::setSettings resetting both states: the color snaps
  // to the new hue instead of damping from the old position.
  CHECK(next.portValue("drift", "anchor") != nullptr);
  CHECK(requireAngle(next.portValue("drift", "anchor")).degrees == 240.f);
  CHECK(requireColor(next.portValue("beat", "color")) == Color::fromHSV(240.f, 0.95f, 0.95f));
}

TEST_CASE("clearing fixedAnchorHue keeps the running anchor", "[AudioNodes]")
{
  NodeRegistry registry = makeAudioRegistry();
  Aurora::Runtime::Graph::Graph live = requireGraph(kFullChain, registry);

  FakeAudioInput input;
  FakeHost host;
  host.audio = &input;

  constexpr float dt = 1.f / 60.f;
  live.tick(dt, &host);

  Aurora::Runtime::Graph::Graph next = requireGraph(
    R"({"version": 1, "nodes": [
      {"id": "cap", "type": "audio.capture", "params": {}},
      {"id": "feat", "type": "audio.features", "params": {}},
      {"id": "drift", "type": "audio.drift", "params": {}},
      {"id": "beat", "type": "audio.bounce", "params": {}}
    ], "edges": [
      ["cap.buffer", "feat.buffer"],
      ["feat.features", "drift.features"],
      ["feat.features", "beat.features"],
      ["drift.anchor", "beat.anchor"]
    ]})",
    registry);
  next.adoptStateFrom(live);
  next.tick(dt, &host);

  // No reset: the anchor kept drifting from 120 instead of re-seeding
  // (which would pick a random pair and almost surely move off 120).
  CHECK_THAT(
    requireAngle(next.portValue("drift", "anchor")).degrees,
    Catch::Matchers::WithinRel(120.f - 10.f * dt, 1e-4f));
}

TEST_CASE("frame.broadcast matches composeAudioFrame over the live zone map", "[AudioNodes]")
{
  class ZoneHost : public IGraphHost
  {
  public:
    const ZoneMap* zoneMap(std::string_view name) override
    {
      return name == "hue" ? &map : nullptr;
    }
    ZoneMap map{};
  };

  ZoneConfig a;
  a.zoneId = 1;
  a.gamma = 0.4f;
  ZoneConfig off;
  off.zoneId = 2;
  off.active = false;
  ZoneConfig b;
  b.zoneId = 3;
  ZoneHost host;
  host.map = {a, off, b};

  NodeRegistry registry = makeAudioRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(
    R"({"version": 1, "nodes": [
      {"id": "cap", "type": "audio.capture", "params": {}},
      {"id": "feat", "type": "audio.features", "params": {}},
      {"id": "drift", "type": "audio.drift", "params": {"fixedAnchorHue": 120.0}},
      {"id": "beat", "type": "audio.bounce", "params": {"fixedAnchorHue": 120.0}},
      {"id": "all", "type": "frame.broadcast", "params": {"output": "hue"}}
    ], "edges": [
      ["cap.buffer", "feat.buffer"],
      ["feat.features", "drift.features"],
      ["feat.features", "beat.features"],
      ["drift.anchor", "beat.anchor"],
      ["beat.color", "all.color"]
    ]})",
    registry);

  FakeAudioInput input;
  struct Both : IGraphHost
  {
    IAudioInput* audioInput() override { return audio; }
    const ZoneMap* zoneMap(std::string_view name) override { return zones->zoneMap(name); }
    IAudioInput* audio{nullptr};
    ZoneHost* zones{nullptr};
  } both;
  both.audio = &input;
  both.zones = &host;

  graph.tick(1.f / 60.f, &both);
  const Color& color = requireColor(graph.portValue("beat", "color"));
  const GraphValue* value = graph.portValue("all", "frame");
  REQUIRE(value != nullptr);
  const Frame* frame = std::get_if<Frame>(value);
  REQUIRE(frame != nullptr);
  Frame expected = composeAudioFrame(color, host.map);
  REQUIRE(frame->size() == 2); // inactive zone omitted
  REQUIRE(expected.size() == 2);
  for(std::size_t i = 0; i < expected.size(); i++){
    CHECK((*frame)[i].id == expected[i].id);
    CHECK((*frame)[i].color == color);
    CHECK((*frame)[i].gamma == expected[i].gamma);
  }
}
