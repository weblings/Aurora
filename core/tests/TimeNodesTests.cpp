// Tier 2 time/state nodes (Aurora-id8j.4): fake-clock cases through the Graph.
#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <cmath>
#include <limits>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Runtime/Graph/FrameNodes.hpp>
#include <Aurora/Runtime/Graph/Graph.hpp>
#include <Aurora/Runtime/Graph/GraphLoader.hpp>
#include <Aurora/Runtime/Graph/TimeNodes.hpp>

using Catch::Approx;
using namespace Aurora::Runtime::Graph;

namespace
{
  // Test-only source: emits whatever value the test last set, on port "value".
  GraphValue g_value = 0.f;
  GraphValue g_amount = 0.f;

  class TestSource : public INode
  {
  public:
    TestSource(const GraphValue* source, PortType type)
    : m_source(source)
    , m_out{{"value", type, false}}
    {}

    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }

    void evaluate(
      const EvalContext&,
      float,
      std::unordered_map<std::string, GraphValue>& outputs) override
    {
      outputs.emplace("value", *m_source);
    }

  private:
    const GraphValue* m_source;
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out;
  };

  void addSource(NodeRegistry& registry, const std::string& type, const GraphValue* source, PortType port)
  {
    registry.registerType(
      type,
      NodeTypeInfo{
        .meta = {.purpose = "test", .useWhen = "test", .example = "{}", .cost = "cheap"},
        .inputs = {},
        .outputs = {{"value", port, false}},
        .params = {},
        .factory = [source, port] { return std::make_unique<TestSource>(source, port); },
      });
  }

  NodeRegistry makeRegistry()
  {
    NodeRegistry registry;
    registerTimeNodes(registry);
    registerFrameNodes(registry);
    addSource(registry, "test.float", &g_value, PortType::Float);
    addSource(registry, "test.angle", &g_value, PortType::Angle);
    addSource(registry, "test.trigger", &g_value, PortType::Trigger);
    addSource(registry, "test.amount", &g_amount, PortType::Float);
    addSource(registry, "test.frame", &g_value, PortType::Frame);
    return registry;
  }

  // One source feeding node "m" on `inPort`.
  Graph load(
    const std::string& sourceType,
    const std::string& type,
    const std::string& params,
    const std::string& inPort,
    bool withAmount = false)
  {
    NodeRegistry registry = makeRegistry();
    std::string nodes = R"({"id": "s", "type": ")" + sourceType + R"(", "params": {}},)";
    std::string edges = R"(["s.value", "m.)" + inPort + R"("])";
    if(withAmount){
      nodes += R"({"id": "a", "type": "test.amount", "params": {}},)";
      edges += R"(, ["a.value", "m.amount"])";
    }
    LoadResult loaded = loadGraphFromString(
      R"({"version": 1, "nodes": [)" + nodes + R"({"id": "m", "type": ")" + type +
        R"(", "params": )" + params + R"(}], "edges": [)" + edges + "]}",
      registry);
    INFO(loaded.error);
    REQUIRE(loaded.ok);
    return std::move(loaded.graph);
  }

  Graph loadAlone(const std::string& type, const std::string& params)
  {
    NodeRegistry registry = makeRegistry();
    LoadResult loaded = loadGraphFromString(
      R"({"version": 1, "nodes": [{"id": "m", "type": ")" + type + R"(", "params": )" + params +
        R"(}], "edges": []})",
      registry);
    INFO(loaded.error);
    REQUIRE(loaded.ok);
    return std::move(loaded.graph);
  }

  const GraphValue& out(Graph& graph, const char* port = "value")
  {
    const GraphValue* value = graph.portValue("m", port);
    REQUIRE(value != nullptr);
    return *value;
  }

  float outFloat(Graph& graph)
  {
    const float* number = std::get_if<float>(&out(graph));
    REQUIRE(number != nullptr);
    return *number;
  }

  float outAngle(Graph& graph)
  {
    const Angle* angle = std::get_if<Angle>(&out(graph, "angle"));
    REQUIRE(angle != nullptr);
    return angle->degrees;
  }

  // 0..255 value of channel 0 (r), 1 (g) or 2 (b).
  float channel(const Aurora::Contracts::Color& color, int index)
  {
    return color.toNormalized()[index] * 255.f;
  }

  // Ticks `seconds` of fake time at `hz`.
  void run(Graph& graph, float hz, float seconds)
  {
    int ticks = static_cast<int>(std::lround(seconds * hz));
    for(int i = 0; i < ticks; ++i){
      graph.tick(1.f / hz);
    }
  }
}

TEST_CASE("smooth.exp settles in the same time at 30, 60 and 240 Hz", "[TimeNodes]")
{
  const float expected = 1.f - std::exp(-1.f); // one tau after a 0 -> 1 step
  for(float hz : {30.f, 60.f, 240.f}){
    INFO(hz);
    Graph graph = load("test.float", "smooth.exp", R"({"tau": 0.5})", "value");
    g_value = 0.f;
    graph.tick(1.f / hz); // first tick snaps
    g_value = 1.f;
    run(graph, hz, 0.5f);
    CHECK(outFloat(graph) == Approx(expected).margin(1e-4f));
  }
}

TEST_CASE("smooth.exp snaps on the first tick and tau 0 is instant", "[TimeNodes]")
{
  Graph graph = load("test.float", "smooth.exp", R"({"tau": 2})", "value");
  g_value = 0.7f;
  graph.tick(1.f / 60.f);
  CHECK(outFloat(graph) == Approx(0.7f));

  Graph instant = load("test.float", "smooth.exp", R"({"tau": 0})", "value");
  g_value = 0.f;
  instant.tick(1.f / 60.f);
  g_value = 1.f;
  instant.tick(1.f / 60.f);
  CHECK(outFloat(instant) == Approx(1.f));
}

TEST_CASE("rollingAverage settles in the same time at 30, 60 and 240 Hz", "[TimeNodes]")
{
  const float expected = 1.f - std::exp(-2.f);
  for(float hz : {30.f, 60.f, 240.f}){
    INFO(hz);
    Graph graph = load("test.float", "rollingAverage", R"({"tau": 0.4})", "value");
    g_value = 0.f;
    graph.tick(1.f / hz);
    g_value = 1.f;
    run(graph, hz, 0.8f);
    CHECK(outFloat(graph) == Approx(expected).margin(1e-4f));
  }
}

TEST_CASE("smooth.angle takes the shortest arc and settles at any rate", "[TimeNodes]")
{
  const float expected = 350.f + 20.f * (1.f - std::exp(-1.f)); // 350 -> 10 is +20 deg
  for(float hz : {30.f, 60.f, 240.f}){
    INFO(hz);
    Graph graph = load("test.angle", "smooth.angle", R"({"tau": 0.5})", "angle");
    g_value = Angle{350.f};
    graph.tick(1.f / hz);
    g_value = Angle{10.f};
    run(graph, hz, 0.5f);
    CHECK(std::fmod(outAngle(graph), 360.f) == Approx(std::fmod(expected, 360.f)).margin(1e-2f));
  }
}

TEST_CASE("smooth.angle wraps an input outside 0..360", "[TimeNodes]")
{
  Graph graph = load("test.angle", "smooth.angle", R"({"tau": 1})", "angle");
  g_value = Angle{-30.f};
  graph.tick(1.f / 60.f);
  CHECK(outAngle(graph) == Approx(330.f));
}

TEST_CASE("integrate accumulates degrees per second and wraps", "[TimeNodes]")
{
  for(float hz : {30.f, 60.f, 240.f}){
    INFO(hz);
    Graph graph = load("test.float", "integrate", R"({"initial": 350})", "rate");
    g_value = 90.f;
    run(graph, hz, 1.f); // 350 + 90 -> 80
    CHECK(outAngle(graph) == Approx(80.f).margin(1e-2f));
  }
  Graph backwards = load("test.float", "integrate", R"({"initial": 10})", "rate");
  g_value = -60.f;
  run(backwards, 60.f, 1.f); // 10 - 60 -> 310
  CHECK(outAngle(backwards) == Approx(310.f).margin(1e-2f));
}

TEST_CASE("stepOnTrigger steps on each pulse and holds between", "[TimeNodes]")
{
  Graph graph = load("test.trigger", "stepOnTrigger", R"({"scale": 1})", "trigger", true);
  g_amount = 90.f;
  g_value = Trigger{false};
  graph.tick(1.f / 60.f);
  CHECK(outAngle(graph) == Approx(0.f));
  g_value = Trigger{true};
  graph.tick(1.f / 60.f);
  CHECK(outAngle(graph) == Approx(90.f));
  g_value = Trigger{false};
  graph.tick(1.f / 60.f);
  CHECK(outAngle(graph) == Approx(90.f));
  g_amount = 300.f;
  g_value = Trigger{true};
  graph.tick(1.f / 60.f);
  CHECK(outAngle(graph) == Approx(30.f)); // 390 wraps
}

TEST_CASE("stepOnTrigger without an amount input steps by scale", "[TimeNodes]")
{
  Graph graph = load("test.trigger", "stepOnTrigger", R"({"scale": 45})", "trigger");
  g_value = Trigger{true};
  graph.tick(1.f / 60.f);
  graph.tick(1.f / 60.f);
  CHECK(outAngle(graph) == Approx(90.f));
}

TEST_CASE("lfo cycles at rateHz regardless of tick rate", "[TimeNodes]")
{
  for(float hz : {30.f, 60.f, 240.f}){
    INFO(hz);
    Graph sine = loadAlone("lfo", R"({"shape": "sine", "rateHz": 0.5, "min": 0, "max": 1})");
    run(sine, hz, 0.5f); // a quarter cycle: sine is at its midpoint
    CHECK(outFloat(sine) == Approx(0.5f).margin(1e-3f));
    run(sine, hz, 0.5f); // half cycle: the top
    CHECK(outFloat(sine) == Approx(1.f).margin(1e-3f));
    run(sine, hz, 1.f); // full cycle: back at min
    CHECK(outFloat(sine) == Approx(0.f).margin(1e-3f));

    Graph saw = loadAlone("lfo", R"({"shape": "saw", "rateHz": 0.5, "min": -1, "max": 1})");
    run(saw, hz, 0.5f);
    CHECK(outFloat(saw) == Approx(-0.5f).margin(1e-3f));
  }
}

TEST_CASE("lfo square flips at half a cycle and honors min and max", "[TimeNodes]")
{
  Graph square = loadAlone("lfo", R"({"shape": "square", "rateHz": 0.5, "min": 2, "max": 4})");
  run(square, 60.f, 0.5f);
  CHECK(outFloat(square) == Approx(2.f));
  run(square, 60.f, 1.f); // 0.75 of the cycle
  CHECK(outFloat(square) == Approx(4.f));
}

TEST_CASE("frame.smoothTime settles in the same time at 30, 60 and 240 Hz", "[TimeNodes]")
{
  const float expected = 255.f * (1.f - std::exp(-1.f));
  for(float hz : {30.f, 60.f, 240.f}){
    INFO(hz);
    Graph graph = load("test.frame", "frame.smoothTime", R"({"tau": 0.3})", "frame");
    g_value = Aurora::Contracts::Frame{{7, Aurora::Contracts::Color(0, 0, 0), 0.5f}};
    graph.tick(1.f / hz);
    g_value = Aurora::Contracts::Frame{{7, Aurora::Contracts::Color(255, 0, 0), 0.5f}};
    run(graph, hz, 0.3f);
    const auto* frame = std::get_if<Aurora::Contracts::Frame>(&out(graph, "frame"));
    REQUIRE(frame != nullptr);
    REQUIRE(frame->size() == 1);
    CHECK((*frame)[0].id == 7);
    CHECK((*frame)[0].gamma == Approx(0.5f));
    CHECK(channel((*frame)[0].color, 0) == Approx(expected).margin(1.f));
  }
}

TEST_CASE("frame.smoothTime snaps a new zone and forgets a dropped one", "[TimeNodes]")
{
  using Aurora::Contracts::Color;
  using Aurora::Contracts::Frame;
  Graph graph = load("test.frame", "frame.smoothTime", R"({"tau": 10})", "frame");
  g_value = Frame{{1, Color(0, 0, 0), 0.f}};
  graph.tick(1.f / 60.f);
  g_value = Frame{{1, Color(255, 0, 0), 0.f}, {2, Color(0, 200, 0), 0.f}};
  graph.tick(1.f / 60.f);
  const auto* frame = std::get_if<Frame>(&out(graph, "frame"));
  REQUIRE(frame != nullptr);
  CHECK(channel((*frame)[0].color, 0) < 20.f); // zone 1 barely moved with a long tau
  CHECK(channel((*frame)[1].color, 1) == Approx(200.f)); // zone 2 had no history, snapped

  g_value = Frame{{2, Color(0, 0, 0), 0.f}};
  graph.tick(1.f / 60.f);
  g_value = Frame{{1, Color(255, 0, 0), 0.f}};
  graph.tick(1.f / 60.f);
  frame = std::get_if<Frame>(&out(graph, "frame"));
  REQUIRE(frame != nullptr);
  CHECK(channel((*frame)[0].color, 0) == Approx(255.f)); // dropped zone 1 came back and snapped
}

TEST_CASE("time nodes turn a non-finite input into a node error", "[TimeNodes]")
{
  const float nan = std::numeric_limits<float>::quiet_NaN();
  for(const char* type : {"smooth.exp", "rollingAverage"}){
    INFO(type);
    Graph graph = load("test.float", type, "{}", "value");
    g_value = nan;
    graph.tick(1.f / 60.f);
    CHECK(asError(out(graph)) != nullptr);
  }
  Graph integrate = load("test.float", "integrate", "{}", "rate");
  g_value = std::numeric_limits<float>::infinity();
  integrate.tick(1.f / 60.f);
  CHECK(asError(out(integrate, "angle")) != nullptr);

  Graph angle = load("test.angle", "smooth.angle", "{}", "angle");
  g_value = Angle{nan};
  angle.tick(1.f / 60.f);
  CHECK(asError(out(angle, "angle")) != nullptr);
}

TEST_CASE("time nodes recover after a bad tick", "[TimeNodes]")
{
  Graph graph = load("test.float", "smooth.exp", R"({"tau": 1})", "value");
  g_value = 0.5f;
  graph.tick(1.f / 60.f);
  g_value = std::numeric_limits<float>::quiet_NaN();
  graph.tick(1.f / 60.f);
  g_value = 0.25f;
  graph.tick(1.f / 60.f);
  CHECK(std::isfinite(outFloat(graph)));
}

TEST_CASE("time node params clamp to the declared range at load", "[TimeNodes]")
{
  Graph graph = load("test.float", "smooth.exp", R"({"tau": 1e9})", "value");
  g_value = 0.f;
  graph.tick(1.f / 60.f);
  g_value = 1.f;
  graph.tick(1.f / 60.f);
  // tau clamps to 60 s, so one 60 Hz tick moves 1 - exp(-1/3600)
  CHECK(outFloat(graph) == Approx(1.f - std::exp(-1.f / 3600.f)).epsilon(0.01));
}

TEST_CASE("time node descriptors carry full agent metadata", "[TimeNodes]")
{
  NodeRegistry registry;
  registerTimeNodes(registry);
  REQUIRE(registry.types().size() == 6);
  for(const auto& descriptor : registry.toDescriptors()){
    if(registry.find(descriptor.key.substr(5)) == nullptr){
      continue; // param entry
    }
    INFO(descriptor.key);
    CHECK(!descriptor.description.empty());
    CHECK(!descriptor.useWhen.empty());
    CHECK(!descriptor.example.empty());
    CHECK(!descriptor.cost.empty());
  }
}

TEST_CASE("time node examples parse as graph nodes of their own type", "[TimeNodes]")
{
  NodeRegistry registry;
  registerTimeNodes(registry);
  registerFrameNodes(registry);
  for(const std::string& type : registry.types()){
    INFO(type);
    nlohmann::json example = nlohmann::json::parse(registry.find(type)->meta.example);
    CHECK(example.at("type") == type);
  }
}
