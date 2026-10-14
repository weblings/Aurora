// G2c Tier 1 frame nodes (Aurora-ra4o.6): per-node tests through the Graph.
// Wraps existing functions unchanged: Smoother::smooth and IOutput::send.
// frame.broadcast (composeAudioFrame) is audio-gated, tested in AudioNodesTests.
#include <catch2/catch_test_macros.hpp>

#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Output/IOutput.hpp>
#include <Aurora/Runtime/Graph/FrameNodes.hpp>
#include <Aurora/Runtime/Graph/Graph.hpp>
#include <Aurora/Runtime/Graph/GraphLoader.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>
#include <Aurora/Runtime/Smoother.hpp>

using namespace Aurora::Contracts;
using namespace Aurora::Output;
using namespace Aurora::Runtime;
using namespace Aurora::Runtime::Graph;

namespace
{
  // Test-only Frame source: the ungated frame nodes have no ungated producer.
  struct SourceState
  {
    Frame frame{};
    bool present{true};
  };
  SourceState g_source;

  class TestFrameSource : public INode
  {
  public:
    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }

    void evaluate(
      const EvalContext&,
      float,
      std::unordered_map<std::string, GraphValue>& outputs) override
    {
      if(g_source.present){
        outputs.emplace("frame", g_source.frame);
      } else {
        outputs.emplace("frame", Absent{});
      }
    }

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"frame", PortType::Frame, false}};
  };

  class FakeOutput : public IOutput
  {
  public:
    explicit FakeOutput(std::string outputName)
    : m_name(std::move(outputName))
    {}

    const std::string& name() const override { return m_name; }
    void init() override {}
    bool isConnected() const override { return true; }
    void shutdown(bool) override {}
    std::vector<uint8_t> zoneIds() const override { return {1}; }
    void send(const Frame& frame) override { sent.push_back(frame); }

    std::vector<Frame> sent{};

  private:
    std::string m_name;
  };

  class FakeHost : public IGraphHost
  {
  public:
    IOutput* output(std::string_view name) override
    {
      auto it = outputs.find(std::string(name));
      return it != outputs.end() ? it->second : nullptr;
    }

    std::unordered_map<std::string, IOutput*> outputs{};
  };

  NodeRegistry makeFrameRegistry()
  {
    NodeRegistry registry;
    registerFrameNodes(registry);
    registry.registerType(
      "test.frame",
      NodeTypeInfo{
        .meta = {.purpose = "test", .useWhen = "test", .example = "{}", .cost = "cheap"},
        .inputs = {},
        .outputs = {{"frame", PortType::Frame, false}},
        .params = {},
        .factory = [] { return std::make_unique<TestFrameSource>(); },
      });
    return registry;
  }

  Aurora::Runtime::Graph::Graph requireGraph(const std::string& json, NodeRegistry& registry)
  {
    LoadResult result = loadGraphFromString(json, registry);
    REQUIRE(result.ok);
    return std::move(result.graph);
  }

  const char* kSmoothSend = R"({"version": 1, "nodes": [
    {"id": "src", "type": "test.frame", "params": {}},
    {"id": "ease", "type": "frame.smooth", "params": {"output": "hue", "smoothing": 0.5}},
    {"id": "send", "type": "output.send", "params": {"output": "hue"}}
  ], "edges": [["src.frame", "ease.frame"], ["ease.frame", "send.frame"]]})";
} // namespace

TEST_CASE("frame node types are registered", "[FrameNodes]")
{
  NodeRegistry registry = makeFrameRegistry();
  CHECK(registry.find("frame.smooth") != nullptr);
  CHECK(registry.find("output.send") != nullptr);
}

TEST_CASE("frame.smooth matches Smoother::smooth tick for tick", "[FrameNodes]")
{
  NodeRegistry registry = makeFrameRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(
    R"({"version": 1, "nodes": [
      {"id": "src", "type": "test.frame", "params": {}},
      {"id": "ease", "type": "frame.smooth", "params": {"output": "hue", "smoothing": 0.5}}
    ], "edges": [["src.frame", "ease.frame"]]})",
    registry);

  Smoother reference;
  const std::vector<Frame> inputs{
    {{1, Color(0, 0, 0), 0.6f}, {2, Color(10, 20, 30)}},
    {{1, Color(255, 255, 255), 0.6f}, {2, Color(200, 100, 50)}},
    {{1, Color(100, 0, 200), 0.6f}, {2, Color(0, 0, 0)}},
  };
  for(const Frame& input : inputs){
    g_source.frame = input;
    graph.tick(1.f / 60.f);
    Frame expected = reference.smooth("hue", input, 0.5f);

    const GraphValue* value = graph.portValue("ease", "frame");
    REQUIRE(value != nullptr);
    const Frame* actual = std::get_if<Frame>(value);
    REQUIRE(actual != nullptr);
    REQUIRE(actual->size() == expected.size());
    for(std::size_t i = 0; i < expected.size(); i++){
      CHECK((*actual)[i].id == expected[i].id);
      CHECK((*actual)[i].color == expected[i].color);
      CHECK((*actual)[i].gamma == expected[i].gamma);
    }
  }
}

TEST_CASE("frame.smooth without an output param fails the node", "[FrameNodes]")
{
  NodeRegistry registry = makeFrameRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(
    R"({"version": 1, "nodes": [
      {"id": "src", "type": "test.frame", "params": {}},
      {"id": "ease", "type": "frame.smooth", "params": {}}
    ], "edges": [["src.frame", "ease.frame"]]})",
    registry);

  g_source = {{{1, Color(1, 2, 3)}}, true};
  graph.tick(1.f / 60.f);
  const GraphValue* value = graph.portValue("ease", "frame");
  REQUIRE(value != nullptr);
  const GraphError* err = asError(*value);
  REQUIRE(err != nullptr);
  CHECK(err->nodeId == "ease");
}

TEST_CASE("output.send delivers the smoothed frame to the named output", "[FrameNodes]")
{
  NodeRegistry registry = makeFrameRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(kSmoothSend, registry);

  FakeOutput hue("hue");
  FakeOutput other("other");
  FakeHost host;
  host.outputs = {{"hue", &hue}, {"other", &other}};

  g_source = {{{1, Color(0, 0, 0)}}, true};
  graph.tick(1.f / 60.f, &host);
  g_source = {{{1, Color(255, 255, 255)}}, true};
  graph.tick(1.f / 60.f, &host);

  REQUIRE(hue.sent.size() == 2);
  CHECK(other.sent.empty());
  CHECK(hue.sent[0][0].color == Color(0, 0, 0)); // first tick is never smoothed
  Smoother reference;
  reference.smooth("hue", {{1, Color(0, 0, 0)}}, 0.5f);
  CHECK(hue.sent[1][0].color == reference.smooth("hue", {{1, Color(255, 255, 255)}}, 0.5f)[0].color);
}

TEST_CASE("output.send sends nothing when the frame is Absent", "[FrameNodes]")
{
  NodeRegistry registry = makeFrameRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(kSmoothSend, registry);

  FakeOutput hue("hue");
  FakeHost host;
  host.outputs = {{"hue", &hue}};

  g_source = {{{1, Color(9, 9, 9)}}, false};
  graph.tick(1.f / 60.f, &host);
  CHECK(hue.sent.empty());
}

TEST_CASE("output.send fails on an unknown output or a missing host", "[FrameNodes]")
{
  NodeRegistry registry = makeFrameRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(
    R"({"version": 1, "nodes": [
      {"id": "src", "type": "test.frame", "params": {}},
      {"id": "send", "type": "output.send", "params": {"output": "ghost"}}
    ], "edges": [["src.frame", "send.frame"]]})",
    registry);
  g_source = {{{1, Color(1, 1, 1)}}, true};

  // Sinks have no port to read an error from: check the tick survives and
  // nothing reaches the registered (different) output.
  FakeOutput hue("hue");
  FakeHost host;
  host.outputs = {{"hue", &hue}};
  graph.tick(1.f / 60.f, &host);
  CHECK(hue.sent.empty());

  Aurora::Runtime::Graph::Graph noHost = requireGraph(
    R"({"version": 1, "nodes": [
      {"id": "src", "type": "test.frame", "params": {}},
      {"id": "send", "type": "output.send", "params": {"output": "hue"}}
    ], "edges": [["src.frame", "send.frame"]]})",
    registry);
  noHost.tick(1.f / 60.f, nullptr);
  CHECK(hue.sent.empty());
}
