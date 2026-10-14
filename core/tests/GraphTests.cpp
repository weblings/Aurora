// G1 graph runtime core tests (Aurora-ra4o.2): topo order, state carry,
// absent/error propagation, self-heal, and every loader rejection class.
// Real Tier 1 nodes arrive in G2a-c; these test-only nodes are the smallest
// shapes that exercise the runtime.
#include <catch2/catch_test_macros.hpp>

#include <cctype>
#include <cmath>
#include <limits>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Runtime/Graph/Graph.hpp>
#include <Aurora/Runtime/Graph/GraphLoader.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

using namespace Aurora::Runtime::Graph;
using Aurora::Contracts::Color;

namespace
{
  struct Probes
  {
    std::vector<std::string> order; // node ids in evaluate-call order
    std::unordered_map<std::string, Color> sinkReceived;
  };

  class ConstNode : public INode
  {
  public:
    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext& ctx,
      float,
      std::unordered_map<std::string, GraphValue>& outputs) override
    {
      outputs.emplace(
        "out",
        Color(
          static_cast<uint8_t>(std::get<float>(ctx.params.at("r"))),
          static_cast<uint8_t>(std::get<float>(ctx.params.at("g"))),
          static_cast<uint8_t>(std::get<float>(ctx.params.at("b")))));
    }

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"out", PortType::Color, false}};
  };

  class PipeNode : public INode
  {
  public:
    explicit PipeNode(PortType type):
    m_in{{"in", type, true}},
    m_out{{"out", type, false}}
    {}

    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext& ctx,
      float,
      std::unordered_map<std::string, GraphValue>& outputs) override
    {
      outputs.emplace("out", ctx.inputs.at("in"));
    }

  private:
    std::vector<PortDecl> m_in;
    std::vector<PortDecl> m_out;
  };

  // Passes Color through and records call order (topo-order tests).
  class PassNode : public INode
  {
  public:
    explicit PassNode(std::shared_ptr<Probes> probes):
    m_probes(std::move(probes)),
    m_in{{"in", PortType::Color, true}},
    m_out{{"out", PortType::Color, false}}
    {}

    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext& ctx,
      float,
      std::unordered_map<std::string, GraphValue>& outputs) override
    {
      m_probes->order.push_back(ctx.nodeId);
      outputs.emplace("out", ctx.inputs.at("in"));
    }

  private:
    std::shared_ptr<Probes> m_probes;
    std::vector<PortDecl> m_in;
    std::vector<PortDecl> m_out;
  };

  // Stateful: emits how many ticks it has seen. State must survive ticks
  // and swaps (matched by stable node id).
  class CounterNode : public INode
  {
  public:
    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext&,
      float,
      std::unordered_map<std::string, GraphValue>& outputs) override
    {
      m_ticks++;
      outputs.emplace("out", Color(static_cast<uint8_t>(m_ticks & 0xFF), 0, 0));
    }

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"out", PortType::Color, false}};
    int m_ticks{0};
  };

  class AbsentNode : public INode
  {
  public:
    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext&,
      float,
      std::unordered_map<std::string, GraphValue>& outputs) override
    {
      outputs.emplace("out", Absent{});
    }

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"out", PortType::Color, false}};
  };

  class ErrorNode : public INode
  {
  public:
    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext& ctx,
      float,
      std::unordered_map<std::string, GraphValue>& outputs) override
    {
      outputs.emplace("out", GraphError{ctx.nodeId, "test error from " + ctx.nodeId});
    }

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"out", PortType::Color, false}};
  };

  class ThrowerNode : public INode
  {
  public:
    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext&,
      float,
      std::unordered_map<std::string, GraphValue>&) override
    {
      throw std::runtime_error("test throw");
    }

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"out", PortType::Color, false}};
  };

  // Two required inputs (fan-out + join tests), plus one param of each
  // kind so defaults and validation are exercisable through one node.
  class JoinNode : public INode
  {
  public:
    explicit JoinNode(std::shared_ptr<Probes> probes):
    m_probes(std::move(probes)),
    m_in{{"a", PortType::Color, true}, {"b", PortType::Color, true}},
    m_out{{"out", PortType::Color, false}}
    {}

    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext& ctx,
      float,
      std::unordered_map<std::string, GraphValue>& outputs) override
    {
      m_probes->order.push_back(ctx.nodeId);
      outputs.emplace("out", ctx.inputs.at("a"));
    }

  private:
    std::shared_ptr<Probes> m_probes;
    std::vector<PortDecl> m_in;
    std::vector<PortDecl> m_out;
  };

  // Optional input: runs even with no edge, applying its default.
  class OptInNode : public INode
  {
  public:
    explicit OptInNode(std::shared_ptr<Probes> probes):
    m_probes(std::move(probes)),
    m_in{{"in", PortType::Color, false}},
    m_out{{"out", PortType::Color, false}}
    {}

    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext& ctx,
      float,
      std::unordered_map<std::string, GraphValue>& outputs) override
    {
      m_probes->order.push_back(ctx.nodeId);
      const GraphValue& in = ctx.inputs.at("in");
      if(isAbsent(in)){
        outputs.emplace("out", Color(0, 0, 255));
      } else {
        outputs.emplace("out", in);
      }
    }

  private:
    std::shared_ptr<Probes> m_probes;
    std::vector<PortDecl> m_in;
    std::vector<PortDecl> m_out;
  };

  // One fixed value per Sequence-A port type (round-trip tests).
  class ValueSrcNode : public INode
  {
  public:
    ValueSrcNode()
    {
      m_image = std::make_shared<Aurora::Contracts::ImageData>();
      m_image->format = Aurora::Contracts::PixelFormat::RGB;
      m_image->imageMatrix = cv::Mat(1, 1, CV_8UC3, cv::Scalar(9, 8, 7));
      m_out = {
        {"outImage", PortType::Image, false},
        {"outAudio", PortType::AudioBuffer, false},
        {"outFeatures", PortType::AudioFeatures, false},
        {"outColor", PortType::Color, false},
        {"outFrame", PortType::Frame, false},
      };
    }

    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext&,
      float,
      std::unordered_map<std::string, GraphValue>& outputs) override
    {
      Aurora::Contracts::AudioBuffer buffer;
      buffer.samples = {0.5f, -0.25f};
      buffer.sampleRate = 48000;
      buffer.channelCount = 1;
      Aurora::Contracts::AudioFeatures features;
      features.onsetDetected = true;
      features.onsetStrength = 0.75f;
      features.rms = 0.125f;
      features.spectralCentroid = 440.0f;
      Aurora::Contracts::Frame frame{
        {Aurora::Contracts::Zone{3, Color(11, 22, 33), 0.5f}},
      };
      outputs.emplace("outImage", m_image);
      outputs.emplace("outAudio", buffer);
      outputs.emplace("outFeatures", features);
      outputs.emplace("outColor", Color(1, 2, 3));
      outputs.emplace("outFrame", frame);
    }

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{};
    std::shared_ptr<Aurora::Contracts::ImageData> m_image;
  };

  // Sink shape (output.send stand-in): required input, no outputs, an
  // output-binding enum param. Records what arrived per node id.
  class SendNode : public INode
  {
  public:
    explicit SendNode(std::shared_ptr<Probes> probes):
    m_probes(std::move(probes)),
    m_in{{"in", PortType::Color, true}}
    {}

    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext& ctx,
      float,
      std::unordered_map<std::string, GraphValue>&) override
    {
      m_probes->sinkReceived[ctx.nodeId] = std::get<Color>(ctx.inputs.at("in"));
    }

  private:
    std::shared_ptr<Probes> m_probes;
    std::vector<PortDecl> m_in;
    std::vector<PortDecl> m_out{};
  };

  // Encodes every param kind into a color (param validation tests).
  class ParamProbeNode : public INode
  {
  public:
    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext& ctx,
      float,
      std::unordered_map<std::string, GraphValue>& outputs) override
    {
      const std::string& mode = std::get<std::string>(ctx.params.at("mode"));
      bool flag = std::get<bool>(ctx.params.at("flag"));
      const std::optional<float>& bias = std::get<std::optional<float>>(ctx.params.at("bias"));
      outputs.emplace(
        "out",
        Color(
          static_cast<uint8_t>(mode == "b" ? 10 : 1),
          static_cast<uint8_t>(flag ? 20 : 2),
          static_cast<uint8_t>(bias.has_value() ? 30 : 3)));
    }

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"out", PortType::Color, false}};
  };

  // Writes nothing: the evaluator must flag the missing output loudly.
  class SilentNode : public INode
  {
  public:
    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext&,
      float,
      std::unordered_map<std::string, GraphValue>&) override
    {}

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"out", PortType::Color, false}};
  };

  // Poisons its own state on the first tick (Aurora-5y0 shape): the
  // evaluator must reset it and count one self-heal, keeping the outputs.
  class BadStateNode : public INode
  {
  public:
    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext&,
      float,
      std::unordered_map<std::string, GraphValue>& outputs) override
    {
      if(m_armed){
        m_value = std::numeric_limits<float>::quiet_NaN();
        m_armed = false;
      }
      outputs.emplace("out", Color(10, 20, 30));
    }

    bool checkStateInvariants() const override { return std::isfinite(m_value); }
    void resetState() override { m_value = 1.0f; }

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"out", PortType::Color, false}};
    float m_value{1.0f};
    bool m_armed{true};
  };

  ParamDecl floatParam(
    const std::string& name,
    float min,
    float max,
    float defaultValue,
    const std::string& unit = "")
  {
    ParamDecl decl;
    decl.name = name;
    decl.kind = ParamKind::Float;
    decl.schema = {name, min, max, 0.01f, unit, defaultValue, false};
    decl.description = name;
    return decl;
  }

  NodeRegistry makeTestRegistry(std::shared_ptr<Probes> probes)
  {
    NodeRegistry registry;
    auto meta = [](const std::string& purpose, const std::string& example){
      return NodeTypeMeta{purpose, "test-only", example, "cheap"};
    };

    NodeTypeInfo info;
    info.meta = meta("constant color source", R"({"id":"c","type":"test.const","params":{"r":1,"g":2,"b":3}})");
    info.outputs = {{"out", PortType::Color, false}};
    info.params = {floatParam("r", 0, 255, 0), floatParam("g", 0, 255, 0), floatParam("b", 0, 255, 0)};
    info.factory = []{ return std::make_unique<ConstNode>(); };
    CHECK(registry.registerType("test.const", std::move(info)));

    info = {};
    info.meta = meta("color passthrough that records call order", R"({"id":"p","type":"test.passthrough"})");
    info.inputs = {{"in", PortType::Color, true}};
    info.outputs = {{"out", PortType::Color, false}};
    info.factory = [probes]{ return std::make_unique<PassNode>(probes); };
    CHECK(registry.registerType("test.passthrough", std::move(info)));

    info = {};
    info.meta = meta("emits its tick count as red", R"({"id":"n","type":"test.counter"})");
    info.outputs = {{"out", PortType::Color, false}};
    info.factory = []{ return std::make_unique<CounterNode>(); };
    CHECK(registry.registerType("test.counter", std::move(info)));

    info = {};
    info.meta = meta("always absent", R"({"id":"s","type":"test.absent"})");
    info.outputs = {{"out", PortType::Color, false}};
    info.factory = []{ return std::make_unique<AbsentNode>(); };
    CHECK(registry.registerType("test.absent", std::move(info)));

    info = {};
    info.meta = meta("always errors with its own id", R"({"id":"boom","type":"test.error"})");
    info.outputs = {{"out", PortType::Color, false}};
    info.factory = []{ return std::make_unique<ErrorNode>(); };
    CHECK(registry.registerType("test.error", std::move(info)));

    info = {};
    info.meta = meta("throws from evaluate", R"({"id":"t","type":"test.thrower"})");
    info.outputs = {{"out", PortType::Color, false}};
    info.factory = []{ return std::make_unique<ThrowerNode>(); };
    CHECK(registry.registerType("test.thrower", std::move(info)));

    info = {};
    info.meta = meta("writes no output", R"({"id":"s","type":"test.silent"})");
    info.outputs = {{"out", PortType::Color, false}};
    info.factory = []{ return std::make_unique<SilentNode>(); };
    CHECK(registry.registerType("test.silent", std::move(info)));

    info = {};
    info.meta = meta("poisons its state on the first tick", R"({"id":"b","type":"test.badstate"})");
    info.outputs = {{"out", PortType::Color, false}};
    info.factory = []{ return std::make_unique<BadStateNode>(); };
    CHECK(registry.registerType("test.badstate", std::move(info)));

    info = {};
    info.meta = meta("two inputs, forwards a", R"({"id":"j","type":"test.join"})");
    info.inputs = {{"a", PortType::Color, true}, {"b", PortType::Color, true}};
    info.outputs = {{"out", PortType::Color, false}};
    info.factory = [probes]{ return std::make_unique<JoinNode>(probes); };
    CHECK(registry.registerType("test.join", std::move(info)));

    info = {};
    info.meta = meta("optional input with a blue default", R"({"id":"o","type":"test.optin"})");
    info.inputs = {{"in", PortType::Color, false}};
    info.outputs = {{"out", PortType::Color, false}};
    info.factory = [probes]{ return std::make_unique<OptInNode>(probes); };
    CHECK(registry.registerType("test.optin", std::move(info)));

    info = {};
    info.meta = meta("one fixed value per port type", R"({"id":"v","type":"test.valuesrc"})");
    info.outputs = {
      {"outImage", PortType::Image, false},
      {"outAudio", PortType::AudioBuffer, false},
      {"outFeatures", PortType::AudioFeatures, false},
      {"outColor", PortType::Color, false},
      {"outFrame", PortType::Frame, false},
    };
    info.factory = []{ return std::make_unique<ValueSrcNode>(); };
    CHECK(registry.registerType("test.valuesrc", std::move(info)));

    for(PortType type : {
          PortType::Image,
          PortType::AudioBuffer,
          PortType::AudioFeatures,
          PortType::Color,
          PortType::Frame}){
      info = {};
      info.meta = meta(
        std::string("passthrough for ") + portTypeName(type),
        "{}");
      info.inputs = {{"in", type, true}};
      info.outputs = {{"out", type, false}};
      info.factory = [type]{ return std::make_unique<PipeNode>(type); };
      std::string name = std::string("test.pipe.") + portTypeName(type);
      for(auto& c : name){
        c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
      }
      CHECK(registry.registerType(name, std::move(info)));
    }

    info = {};
    info.meta = meta("sink bound to one output", R"({"id":"s","type":"test.send","params":{"output":"hue"}})");
    info.inputs = {{"in", PortType::Color, true}};
    ParamDecl output;
    output.name = "output";
    output.kind = ParamKind::Enum;
    output.description = "output this sink sends to";
    info.params = {output};
    info.factory = [probes]{ return std::make_unique<SendNode>(probes); };
    info.sinkBindingParam = "output";
    CHECK(registry.registerType("test.send", std::move(info)));

    info = {};
    info.meta = meta("encodes every param kind into a color", R"({"id":"q","type":"test.paramprobe"})");
    info.outputs = {{"out", PortType::Color, false}};
    ParamDecl mode;
    mode.name = "mode";
    mode.kind = ParamKind::Enum;
    mode.enumOptions = {"a", "b"};
    mode.defaultEnum = "a";
    mode.description = "mode";
    ParamDecl flag;
    flag.name = "flag";
    flag.kind = ParamKind::Bool;
    flag.defaultBool = false;
    flag.description = "flag";
    ParamDecl bias;
    bias.name = "bias";
    bias.kind = ParamKind::OptionalFloat;
    bias.schema = {"bias", -100.f, 100.f, 0.1f, "", 0.f, false};
    bias.description = "bias";
    info.params = {mode, flag, bias};
    info.factory = []{ return std::make_unique<ParamProbeNode>(); };
    CHECK(registry.registerType("test.paramprobe", std::move(info)));

    return registry;
  }

  Graph mustLoad(
    const NodeRegistry& registry,
    const std::string& text,
    const LoadOptions& options = {})
  {
    LoadResult result = loadGraphFromString(text, registry, options);
    INFO(result.error);
    REQUIRE(result.ok);
    return std::move(result.graph);
  }

  std::string failWith(
    const NodeRegistry& registry,
    const std::string& text,
    const LoadOptions& options = {})
  {
    LoadResult result = loadGraphFromString(text, registry, options);
    INFO("expected a load failure but the graph loaded");
    REQUIRE(!result.ok);
    return result.error;
  }

  Color colorOf(const Graph& graph, const std::string& node, const std::string& port)
  {
    const GraphValue* value = graph.portValue(node, port);
    REQUIRE(value != nullptr);
    INFO("expected a Color");
    REQUIRE(std::holds_alternative<Color>(*value));
    return std::get<Color>(*value);
  }
}

TEST_CASE("Graph evaluates in topo order, not declaration order", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph graph = mustLoad(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "c", "type": "test.passthrough"},
      {"id": "b", "type": "test.passthrough"},
      {"id": "a", "type": "test.const", "params": {"r": 1, "g": 2, "b": 3}}
    ],
    "edges": [["a.out", "b.in"], ["b.out", "c.in"]]
  })");
  graph.tick(1.f / 60.f);
  CHECK(probes->order == std::vector<std::string>{"b", "c"});
  CHECK(colorOf(graph, "c", "out") == Color(1, 2, 3));
}

TEST_CASE("Graph fan-out from one output is allowed", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph graph = mustLoad(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "c", "type": "test.const", "params": {"r": 4, "g": 5, "b": 6}},
      {"id": "j", "type": "test.join"}
    ],
    "edges": [["c.out", "j.a"], ["c.out", "j.b"]]
  })");
  graph.tick(1.f / 60.f);
  CHECK(colorOf(graph, "j", "out") == Color(4, 5, 6));
}

TEST_CASE("Graph node state carries across ticks", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph graph = mustLoad(registry, R"({
    "version": 1,
    "nodes": [{"id": "n", "type": "test.counter"}]
  })");
  graph.tick(1.f / 60.f);
  graph.tick(1.f / 60.f);
  graph.tick(1.f / 60.f);
  CHECK(colorOf(graph, "n", "out") == Color(3, 0, 0));
  CHECK(graph.tickCount() == 3);
}

TEST_CASE("Graph state carries across swaps by stable node id", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph live = mustLoad(registry, R"({
    "version": 1,
    "nodes": [{"id": "n", "type": "test.counter"}]
  })");
  live.tick(1.f / 60.f);
  live.tick(1.f / 60.f);

  Graph next = mustLoad(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "n", "type": "test.counter"},
      {"id": "p", "type": "test.passthrough"}
    ],
    "edges": [["n.out", "p.in"]]
  })");
  next.adoptStateFrom(live);
  next.tick(1.f / 60.f);
  // Counter continued (3), not restarted (1): the instance moved with id "n".
  CHECK(colorOf(next, "p", "out") == Color(3, 0, 0));
}

TEST_CASE("Graph absent propagates and skips downstream evaluates", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph graph = mustLoad(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "s", "type": "test.absent"},
      {"id": "p1", "type": "test.passthrough"},
      {"id": "p2", "type": "test.passthrough"}
    ],
    "edges": [["s.out", "p1.in"], ["p1.out", "p2.in"]]
  })");
  graph.tick(1.f / 60.f);
  const GraphValue* value = graph.portValue("p2", "out");
  REQUIRE(value != nullptr);
  CHECK(isAbsent(*value));
  CHECK(probes->order.empty());
}

TEST_CASE("Graph error propagates with the originating node id", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph graph = mustLoad(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "boom", "type": "test.error"},
      {"id": "p1", "type": "test.passthrough"},
      {"id": "p2", "type": "test.passthrough"}
    ],
    "edges": [["boom.out", "p1.in"], ["p1.out", "p2.in"]]
  })");
  graph.tick(1.f / 60.f);
  const GraphValue* value = graph.portValue("p2", "out");
  REQUIRE(value != nullptr);
  const GraphError* err = asError(*value);
  REQUIRE(err != nullptr);
  CHECK(err->nodeId == "boom");
  CHECK(err->message == "test error from boom");
  CHECK(probes->order.empty());
}

TEST_CASE("Graph converts a throwing evaluate into an error, never a crash", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph graph = mustLoad(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "t", "type": "test.thrower"},
      {"id": "p", "type": "test.passthrough"}
    ],
    "edges": [["t.out", "p.in"]]
  })");
  graph.tick(1.f / 60.f);
  const GraphValue* value = graph.portValue("p", "out");
  REQUIRE(value != nullptr);
  const GraphError* err = asError(*value);
  REQUIRE(err != nullptr);
  CHECK(err->nodeId == "t");
  CHECK(err->message.find("evaluate threw") != std::string::npos);
}

TEST_CASE("Graph flags a node that forgets an output", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph graph = mustLoad(registry, R"({
    "version": 1,
    "nodes": [{"id": "s", "type": "test.silent"}]
  })");
  graph.tick(1.f / 60.f);
  const GraphValue* value = graph.portValue("s", "out");
  REQUIRE(value != nullptr);
  const GraphError* err = asError(*value);
  REQUIRE(err != nullptr);
  CHECK(err->nodeId == "s");
  CHECK(err->message.find("did not produce output 'out'") != std::string::npos);
}

TEST_CASE("Graph self-heals poisoned state once and keeps the outputs", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph graph = mustLoad(registry, R"({
    "version": 1,
    "nodes": [{"id": "b", "type": "test.badstate"}]
  })");
  graph.tick(1.f / 60.f);
  CHECK(graph.selfHeals() == 1);
  CHECK(colorOf(graph, "b", "out") == Color(10, 20, 30));
  graph.tick(1.f / 60.f);
  CHECK(graph.selfHeals() == 1);
  CHECK(colorOf(graph, "b", "out") == Color(10, 20, 30));
}

TEST_CASE("Graph optional input without an edge still evaluates", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph graph = mustLoad(registry, R"({
    "version": 1,
    "nodes": [{"id": "o", "type": "test.optin"}]
  })");
  graph.tick(1.f / 60.f);
  CHECK(probes->order == std::vector<std::string>{"o"});
  CHECK(colorOf(graph, "o", "out") == Color(0, 0, 255));

  Graph fed = mustLoad(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "c", "type": "test.const", "params": {"r": 5, "g": 6, "b": 7}},
      {"id": "o", "type": "test.optin"}
    ],
    "edges": [["c.out", "o.in"]]
  })");
  fed.tick(1.f / 60.f);
  CHECK(colorOf(fed, "o", "out") == Color(5, 6, 7));
}

TEST_CASE("Graph round-trips all five Sequence-A port types", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph graph = mustLoad(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "v", "type": "test.valuesrc"},
      {"id": "pi", "type": "test.pipe.image"},
      {"id": "pa", "type": "test.pipe.audiobuffer"},
      {"id": "pf", "type": "test.pipe.audiofeatures"},
      {"id": "pc", "type": "test.pipe.color"},
      {"id": "pr", "type": "test.pipe.frame"}
    ],
    "edges": [
      ["v.outImage", "pi.in"],
      ["v.outAudio", "pa.in"],
      ["v.outFeatures", "pf.in"],
      ["v.outColor", "pc.in"],
      ["v.outFrame", "pr.in"]
    ]
  })");
  graph.tick(1.f / 60.f);

  const GraphValue* audio = graph.portValue("pa", "out");
  REQUIRE(audio != nullptr);
  const auto* buffer = std::get_if<Aurora::Contracts::AudioBuffer>(audio);
  REQUIRE(buffer != nullptr);
  CHECK(buffer->samples == std::vector<float>{0.5f, -0.25f});
  CHECK(buffer->sampleRate == 48000);
  CHECK(buffer->channelCount == 1);

  const GraphValue* features = graph.portValue("pf", "out");
  REQUIRE(features != nullptr);
  const auto* feats = std::get_if<Aurora::Contracts::AudioFeatures>(features);
  REQUIRE(feats != nullptr);
  CHECK(feats->onsetDetected);
  CHECK(feats->onsetStrength == 0.75f);
  CHECK(feats->rms == 0.125f);
  CHECK(feats->spectralCentroid == 440.0f);

  const GraphValue* color = graph.portValue("pc", "out");
  REQUIRE(color != nullptr);
  CHECK(std::get<Color>(*color) == Color(1, 2, 3));

  const GraphValue* frame = graph.portValue("pr", "out");
  REQUIRE(frame != nullptr);
  const auto* zones = std::get_if<Aurora::Contracts::Frame>(frame);
  REQUIRE(zones != nullptr);
  REQUIRE(zones->size() == 1);
  CHECK(zones->at(0).id == 3);
  CHECK(zones->at(0).color == Color(11, 22, 33));
  CHECK(zones->at(0).gamma == 0.5f);
}

TEST_CASE("Graph image travels by reference through fan-out", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph graph = mustLoad(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "v", "type": "test.valuesrc"},
      {"id": "p1", "type": "test.pipe.image"},
      {"id": "p2", "type": "test.pipe.image"},
      {"id": "p3", "type": "test.pipe.image"}
    ],
    "edges": [
      ["v.outImage", "p1.in"],
      ["p1.out", "p2.in"],
      ["v.outImage", "p3.in"]
    ]
  })");
  graph.tick(1.f / 60.f);
  auto imageOf = [&](const std::string& node){
    const GraphValue* value = graph.portValue(node, node == "v" ? "outImage" : "out");
    REQUIRE(value != nullptr);
    const auto* image = std::get_if<std::shared_ptr<Aurora::Contracts::ImageData>>(value);
    REQUIRE(image != nullptr);
    return *image;
  };
  CHECK(imageOf("p2") == imageOf("v"));
  CHECK(imageOf("p3") == imageOf("v"));
}

TEST_CASE("Graph tickHz is optional, Audio-rate graphs declare it", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph with = mustLoad(registry, R"({
    "version": 1, "tickHz": 60,
    "nodes": [{"id": "n", "type": "test.counter"}]
  })");
  REQUIRE(with.tickHz().has_value());
  CHECK(*with.tickHz() == 60.0);

  Graph without = mustLoad(registry, R"({
    "version": 1,
    "nodes": [{"id": "n", "type": "test.counter"}]
  })");
  CHECK(!without.tickHz().has_value());
}

TEST_CASE("Graph sink receives values and binds its output param", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  LoadOptions options;
  options.knownOutputs = {"hue"};
  Graph graph = mustLoad(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "c", "type": "test.const", "params": {"r": 7, "g": 8, "b": 9}},
      {"id": "s", "type": "test.send", "params": {"output": "hue"}}
    ],
    "edges": [["c.out", "s.in"]]
  })", options);
  graph.tick(1.f / 60.f);
  REQUIRE(probes->sinkReceived.find("s") != probes->sinkReceived.end());
  CHECK(probes->sinkReceived.at("s") == Color(7, 8, 9));
}

TEST_CASE("Graph absent into a sink sends nothing", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph graph = mustLoad(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "s0", "type": "test.absent"},
      {"id": "s", "type": "test.send", "params": {"output": "hue"}}
    ],
    "edges": [["s0.out", "s.in"]]
  })");
  graph.tick(1.f / 60.f);
  CHECK(probes->sinkReceived.find("s") == probes->sinkReceived.end());
}

TEST_CASE("Graph param kinds fill defaults and validate", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph defaults = mustLoad(registry, R"({
    "version": 1,
    "nodes": [{"id": "q", "type": "test.paramprobe"}]
  })");
  defaults.tick(1.f / 60.f);
  CHECK(colorOf(defaults, "q", "out") == Color(1, 2, 3));

  Graph explicit_ = mustLoad(registry, R"({
    "version": 1,
    "nodes": [{"id": "q", "type": "test.paramprobe",
                "params": {"mode": "b", "flag": true, "bias": 1.5}}]
  })");
  explicit_.tick(1.f / 60.f);
  CHECK(colorOf(explicit_, "q", "out") == Color(10, 20, 30));

  Graph nulled = mustLoad(registry, R"({
    "version": 1,
    "nodes": [{"id": "q", "type": "test.paramprobe", "params": {"bias": null}}]
  })");
  nulled.tick(1.f / 60.f);
  CHECK(colorOf(nulled, "q", "out") == Color(1, 2, 3));

  CHECK(failWith(registry, R"({
    "version": 1,
    "nodes": [{"id": "q", "type": "test.paramprobe", "params": {"mode": "c"}}]
  })").find("unknown option 'c'") != std::string::npos);

  CHECK(failWith(registry, R"({
    "version": 1,
    "nodes": [{"id": "q", "type": "test.paramprobe", "params": {"flag": "yes"}}]
  })").find("'flag'") != std::string::npos);

  CHECK(failWith(registry, R"({
    "version": 1,
    "nodes": [{"id": "q", "type": "test.paramprobe", "params": {"nope": 1}}]
  })").find("unknown param 'nope'") != std::string::npos);
}

TEST_CASE("Graph registry metadata exports node descriptors", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  auto descriptors = registry.toDescriptors();
  bool hasNode = false;
  bool hasParam = false;
  for(const auto& descriptor : descriptors){
    if(descriptor.key == "node.test.const"){
      hasNode = true;
    }
    if(descriptor.key == "node.test.const.r"){
      hasParam = true;
      CHECK(descriptor.kind == "slider");
    }
  }
  CHECK(hasNode);
  CHECK(hasParam);
  CHECK(!registry.registerType("test.const", NodeTypeInfo{}));
  CHECK(registry.find("test.nope") == nullptr);
}

TEST_CASE("Graph loader rejects unknown types", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  std::string error = failWith(registry, R"({
    "version": 1,
    "nodes": [{"id": "x", "type": "nope.nope"}]
  })");
  CHECK(error.find("unknown type 'nope.nope'") != std::string::npos);
  CHECK(error.find("'x'") != std::string::npos);
}

TEST_CASE("Graph loader rejects port-type mismatches", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  std::string error = failWith(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "c", "type": "test.const"},
      {"id": "pr", "type": "test.pipe.frame"}
    ],
    "edges": [["c.out", "pr.in"]]
  })");
  CHECK(error.find("port-type mismatch") != std::string::npos);
  CHECK(error.find("Color") != std::string::npos);
  CHECK(error.find("Frame") != std::string::npos);
  CHECK(error.find("c.out") != std::string::npos);
  CHECK(error.find("pr.in") != std::string::npos);
}

TEST_CASE("Graph loader rejects cycles", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  std::string error = failWith(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "a", "type": "test.passthrough"},
      {"id": "b", "type": "test.passthrough"}
    ],
    "edges": [["a.out", "b.in"], ["b.out", "a.in"]]
  })");
  CHECK(error.find("cycle") != std::string::npos);
  CHECK(error.find("'a'") != std::string::npos);
  CHECK(error.find("'b'") != std::string::npos);
}

TEST_CASE("Graph loader rejects missing required inputs", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  std::string error = failWith(registry, R"({
    "version": 1,
    "nodes": [{"id": "p", "type": "test.passthrough"}]
  })");
  CHECK(error.find("missing required input 'in'") != std::string::npos);
  CHECK(error.find("'p'") != std::string::npos);
  CHECK(error.find("Color") != std::string::npos);
}

TEST_CASE("Graph loader rejects unregistered outputs", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  LoadOptions options;
  options.knownOutputs = {"other"};
  std::string error = failWith(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "c", "type": "test.const"},
      {"id": "s", "type": "test.send", "params": {"output": "hue"}}
    ],
    "edges": [["c.out", "s.in"]]
  })", options);
  CHECK(error.find("unregistered output 'hue'") != std::string::npos);
  CHECK(error.find("'s'") != std::string::npos);
}

TEST_CASE("Graph loader rejects more than one edge into one input", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  std::string error = failWith(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "a", "type": "test.const"},
      {"id": "b", "type": "test.const"},
      {"id": "p", "type": "test.passthrough"}
    ],
    "edges": [["a.out", "p.in"], ["b.out", "p.in"]]
  })");
  CHECK(error.find("more than one edge into 'p.in'") != std::string::npos);
}

TEST_CASE("Graph loader rejects two sinks on one output", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  LoadOptions options;
  options.knownOutputs = {"hue"};
  std::string error = failWith(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "a", "type": "test.const"},
      {"id": "b", "type": "test.const"},
      {"id": "s1", "type": "test.send", "params": {"output": "hue"}},
      {"id": "s2", "type": "test.send", "params": {"output": "hue"}}
    ],
    "edges": [["a.out", "s1.in"], ["b.out", "s2.in"]]
  })", options);
  CHECK(error.find("both send to it") != std::string::npos);
  CHECK(error.find("pick-or-mix") != std::string::npos);
}

TEST_CASE("Graph loader rejects bad node and edge references", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);

  CHECK(failWith(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "a", "type": "test.const"},
      {"id": "a", "type": "test.const"}
    ]
  })").find("duplicate node id 'a'") != std::string::npos);

  CHECK(failWith(registry, R"({
    "version": 1,
    "nodes": [{"id": "", "type": "test.const"}]
  })").find("non-empty string 'id'") != std::string::npos);

  CHECK(failWith(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "c", "type": "test.const"},
      {"id": "p", "type": "test.passthrough"}
    ],
    "edges": [["ghost.out", "p.in"]]
  })").find("source node 'ghost'") != std::string::npos);

  CHECK(failWith(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "c", "type": "test.const"},
      {"id": "p", "type": "test.passthrough"}
    ],
    "edges": [["c.out", "ghost.in"]]
  })").find("target node 'ghost'") != std::string::npos);

  CHECK(failWith(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "c", "type": "test.const"},
      {"id": "p", "type": "test.passthrough"}
    ],
    "edges": [["c.nope", "p.in"]]
  })").find("no output port 'nope'") != std::string::npos);

  CHECK(failWith(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "c", "type": "test.const"},
      {"id": "p", "type": "test.passthrough"}
    ],
    "edges": [["c.out", "p.nope"]]
  })").find("no input port 'nope'") != std::string::npos);

  CHECK(failWith(registry, R"({
    "version": 1,
    "nodes": [
      {"id": "c", "type": "test.const"},
      {"id": "p", "type": "test.passthrough"}
    ],
    "edges": [["cout", "p.in"]]
  })").find("must be \"node.port\"") != std::string::npos);

  CHECK(failWith(registry, R"({
    "version": 1,
    "nodes": [{"id": "c", "type": "test.const", "params": {"r": "red"}}]
  })").find("'r'") != std::string::npos);
}

TEST_CASE("Graph loader rejects bad versions, tickHz and controls", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);

  CHECK(failWith(registry, R"({
    "nodes": [{"id": "n", "type": "test.counter"}]
  })").find("'version' is required") != std::string::npos);

  CHECK(failWith(registry, R"({
    "version": 2,
    "nodes": [{"id": "n", "type": "test.counter"}]
  })").find("unsupported graph version 2") != std::string::npos);

  CHECK(failWith(registry, R"({
    "version": 1, "tickHz": -5,
    "nodes": [{"id": "n", "type": "test.counter"}]
  })").find("'tickHz'") != std::string::npos);

  CHECK(failWith(registry, R"({
    "version": 1,
    "nodes": [{"id": "n", "type": "test.counter"}],
    "controls": [{"node": "ghost", "param": "x"}]
  })").find("unknown node 'ghost'") != std::string::npos);

  CHECK(failWith(registry, R"({
    "version": 1,
    "nodes": [{"id": "n", "type": "test.counter"}],
    "controls": [{"node": "n", "param": "nope"}]
  })").find("has no param 'nope'") != std::string::npos);

  // Valid controls and ignored ui pass.
  Graph graph = mustLoad(registry, R"({
    "version": 1,
    "nodes": [{"id": "c", "type": "test.const"}],
    "controls": [{"node": "c", "param": "r", "group": "tuning"}],
    "ui": {"c": {"x": 40, "y": 80}}
  })");
  CHECK(graph.nodeCount() == 1);
}

TEST_CASE("Graph failed load keeps the running graph", "[Graph]")
{
  auto probes = std::make_shared<Probes>();
  NodeRegistry registry = makeTestRegistry(probes);
  Graph live = mustLoad(registry, R"({
    "version": 1,
    "nodes": [{"id": "n", "type": "test.counter"}]
  })");
  live.tick(1.f / 60.f);
  live.tick(1.f / 60.f);

  LoadResult bad = loadGraphFromString(R"({
    "version": 1,
    "nodes": [
      {"id": "a", "type": "test.passthrough"},
      {"id": "b", "type": "test.passthrough"}
    ],
    "edges": [["a.out", "b.in"], ["b.out", "a.in"]]
  })", registry);
  REQUIRE(!bad.ok);

  // The running graph is untouched: its state and ticking continue.
  live.tick(1.f / 60.f);
  CHECK(colorOf(live, "n", "out") == Color(3, 0, 0));
  CHECK(live.tickCount() == 3);
}

