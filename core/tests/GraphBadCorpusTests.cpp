// Bad-graph corpus + loader fuzz (Aurora-ra4o.3, G1b).
//
// One fixture per loader rejection class: every error must name the node,
// port or param at fault plus the expectation, so an agent can retry from
// the message alone. A fixed-seed property test then throws random and
// mutated graphs at the loader (and ticks whatever loads) to prove random
// input can never crash or throw out of load/tick.
#include <catch2/catch_test_macros.hpp>

#include <cstdint>
#include <memory>
#include <optional>
#include <random>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include <nlohmann/json.hpp>

#include <Aurora/Runtime/Graph/Graph.hpp>
#include <Aurora/Runtime/Graph/GraphLoader.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

using namespace Aurora::Runtime::Graph;
using Aurora::Contracts::Color;

namespace
{
  // Fixed seed: the fuzz run is deterministic so CI reproduces failures.
  constexpr std::uint32_t kFuzzSeed = 20261014u;
  constexpr int kFuzzGraphs = 2000;
  constexpr int kFuzzMutatedStrings = 500;

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

  class PassNode : public INode
  {
  public:
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
    std::vector<PortDecl> m_in{{"in", PortType::Color, true}};
    std::vector<PortDecl> m_out{{"out", PortType::Color, false}};
  };

  class FramePipeNode : public INode
  {
  public:
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
    std::vector<PortDecl> m_in{{"in", PortType::Frame, true}};
    std::vector<PortDecl> m_out{{"out", PortType::Frame, false}};
  };

  // Float/Trigger passthrough with the port type chosen at registration.
  class TypedPipeNode : public INode
  {
  public:
    explicit TypedPipeNode(PortType type):
    m_in{{"in", type, true}},
    m_out{{"out", type, false}}
    {
    }

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
      outputs.emplace("out", Color(1, 2, 3));
    }

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"out", PortType::Color, false}};
  };

  class SendNode : public INode
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
    std::vector<PortDecl> m_in{{"in", PortType::Color, true}};
    std::vector<PortDecl> m_out{};
  };

  class ParamProbeNode : public INode
  {
  public:
    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(
      const EvalContext&,
      float,
      std::unordered_map<std::string, GraphValue>& outputs) override
    {
      outputs.emplace("out", Color(1, 2, 3));
    }

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"out", PortType::Color, false}};
  };

  // Declares an output its instance never provides: the loader must fail
  // the load rather than evaluate blind.
  class LiarNode : public INode
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
    std::vector<PortDecl> m_out{};
  };

  ParamDecl floatParam(const std::string& name, float defaultValue)
  {
    ParamDecl decl;
    decl.name = name;
    decl.kind = ParamKind::Float;
    decl.schema = {name, 0.f, 255.f, 1.f, "", defaultValue, false};
    decl.description = name;
    return decl;
  }

  NodeRegistry makeCorpusRegistry()
  {
    NodeRegistry registry;
    auto meta = [](const std::string& purpose){
      return NodeTypeMeta{purpose, "test-only", "{}", "cheap"};
    };

    NodeTypeInfo info;
    info.meta = meta("constant color source");
    info.outputs = {{"out", PortType::Color, false}};
    info.params = {floatParam("r", 0), floatParam("g", 0), floatParam("b", 0)};
    info.factory = []{ return std::make_unique<ConstNode>(); };
    CHECK(registry.registerType("test.const", std::move(info)));

    info = {};
    info.meta = meta("color passthrough");
    info.inputs = {{"in", PortType::Color, true}};
    info.outputs = {{"out", PortType::Color, false}};
    info.factory = []{ return std::make_unique<PassNode>(); };
    CHECK(registry.registerType("test.passthrough", std::move(info)));

    info = {};
    info.meta = meta("frame passthrough");
    info.inputs = {{"in", PortType::Frame, true}};
    info.outputs = {{"out", PortType::Frame, false}};
    info.factory = []{ return std::make_unique<FramePipeNode>(); };
    CHECK(registry.registerType("test.framepipe", std::move(info)));

    for(PortType type : {PortType::Float, PortType::Trigger}){
      info = {};
      info.meta = meta(std::string(portTypeName(type)) + " passthrough");
      info.inputs = {{"in", type, true}};
      info.outputs = {{"out", type, false}};
      info.factory = [type]{ return std::make_unique<TypedPipeNode>(type); };
      CHECK(registry.registerType(
        type == PortType::Float ? "test.floatpipe" : "test.triggerpipe", std::move(info)));
    }

    info = {};
    info.meta = meta("sourceless color emitter");
    info.outputs = {{"out", PortType::Color, false}};
    info.factory = []{ return std::make_unique<CounterNode>(); };
    CHECK(registry.registerType("test.counter", std::move(info)));

    info = {};
    info.meta = meta("sink bound to one output");
    info.inputs = {{"in", PortType::Color, true}};
    ParamDecl output;
    output.name = "output";
    output.kind = ParamKind::Enum;
    output.description = "output this sink sends to";
    info.params = {output};
    info.factory = []{ return std::make_unique<SendNode>(); };
    info.sinkBindingParam = "output";
    CHECK(registry.registerType("test.send", std::move(info)));

    info = {};
    info.meta = meta("every param kind in one node");
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
    info.outputs = {{"out", PortType::Color, false}};
    info.factory = []{ return std::make_unique<ParamProbeNode>(); };
    CHECK(registry.registerType("test.paramprobe", std::move(info)));

    info = {};
    info.meta = meta("factory that throws");
    info.outputs = {{"out", PortType::Color, false}};
    info.factory = []() -> std::unique_ptr<INode> {
      throw std::runtime_error("test factory boom");
    };
    CHECK(registry.registerType("test.throwfactory", std::move(info)));

    info = {};
    info.meta = meta("instance disagrees with its declaration");
    info.outputs = {{"out", PortType::Color, false}};
    info.factory = []{ return std::make_unique<LiarNode>(); };
    CHECK(registry.registerType("test.liar", std::move(info)));

    return registry;
  }

  struct BadCase
  {
    std::string name;
    std::string doc;
    // Every fragment must appear in the loader error: the first element
    // names the culprit (node/port/param), the rest the expectation.
    std::vector<std::string> mustContain;
    // App-registered outputs for the sink-binding check. Empty skips it.
    std::vector<std::string> knownOutputs{};
  };

  std::string loadFails(const NodeRegistry& registry, const BadCase& bad)
  {
    LoadOptions options;
    for(const std::string& output : bad.knownOutputs){
      options.knownOutputs.insert(output);
    }
    LoadResult result = loadGraphFromString(bad.doc, registry, options);
    INFO("case '" << bad.name << "' loaded but should have failed");
    REQUIRE(!result.ok);
    return result.error;
  }

  // One fixture per rejection class in GraphLoader.hpp.
  std::vector<BadCase> badGraphCorpus()
  {
    return {
      {"invalid-json-not-json-at-all", R"({ this is not json )", {"invalid JSON"}},
      {"invalid-json-empty", "", {"invalid JSON"}},
      {"invalid-json-array-doc", R"([1, 2])", {"must be a JSON object"}},
      {"missing-version", R"({"nodes": []})", {"'version' is required"}},
      {"version-wrong-type", R"({"version": "1", "nodes": []})", {"'version'", "integer 1"}},
      {"version-unsupported", R"({"version": 2, "nodes": []})", {"unsupported graph version 2"}},
      {"tickHz-negative", R"({"version": 1, "tickHz": -5, "nodes": []})", {"'tickHz'", "positive"}},
      {"tickHz-string", R"({"version": 1, "tickHz": "fast", "nodes": []})", {"'tickHz'", "positive"}},
      {"nodes-missing", R"({"version": 1})", {"'nodes'", "array"}},
      {"nodes-not-array", R"({"version": 1, "nodes": {}})", {"'nodes'", "array"}},
      {"node-not-object", R"({"version": 1, "nodes": [7]})", {"nodes[0]", "object"}},
      {"node-empty-id", R"({"version": 1, "nodes": [{"id": "", "type": "test.counter"}]})",
       {"nodes[0]", "'id'"}},
      {"duplicate-id", R"({"version": 1, "nodes": [{"id": "a", "type": "test.counter"}, {"id": "a", "type": "test.counter"}]})",
       {"duplicate node id 'a'"}},
      {"node-missing-type",
       R"({"version": 1, "nodes": [{"id": "a"}]})", {"'a'", "'type'"}},
      {"unknown-type", R"({"version": 1, "nodes": [{"id": "x", "type": "nope.nope"}]})",
       {"'x'", "unknown type 'nope.nope'"}},
      {"params-not-object",
       R"({"version": 1, "nodes": [{"id": "c", "type": "test.const", "params": [1]}]})",
       {"'c'", "'params'", "object"}},
      {"unknown-param",
       R"({"version": 1, "nodes": [{"id": "c", "type": "test.const", "params": {"nope": 1}}]})",
       {"'c'", "unknown param 'nope'"}},
      {"param-float-wrong-type",
       R"({"version": 1, "nodes": [{"id": "c", "type": "test.const", "params": {"r": "red"}}]})",
       {"'c'", "'r'", "number"}},
      {"param-bool-wrong-type",
       R"({"version": 1, "nodes": [{"id": "q", "type": "test.paramprobe", "params": {"flag": "yes"}}]})",
       {"'q'", "'flag'", "true or false"}},
      {"param-enum-unknown-option",
       R"({"version": 1, "nodes": [{"id": "q", "type": "test.paramprobe", "params": {"mode": "c"}}]})",
       {"'q'", "unknown option 'c'"}},
      {"param-enum-wrong-type",
       R"({"version": 1, "nodes": [{"id": "q", "type": "test.paramprobe", "params": {"mode": 7}}]})",
       {"'q'", "'mode'", "string"}},
      {"param-optional-float-wrong-type",
       R"({"version": 1, "nodes": [{"id": "q", "type": "test.paramprobe", "params": {"bias": "lots"}}]})",
       {"'q'", "'bias'", "number or null"}},
      {"unregistered-output",
       R"({"version": 1, "nodes": [{"id": "c", "type": "test.const"}, {"id": "s", "type": "test.send", "params": {"output": "hue"}}], "edges": [["c.out", "s.in"]]})",
       {"'s'", "unregistered output 'hue'"}, {"other"}},
      {"edges-not-array", R"({"version": 1, "nodes": [], "edges": {}})",
       {"'edges'", "array"}},
      {"edge-not-pair",
       R"({"version": 1, "nodes": [], "edges": [["only"]]})", {"edges[0]", "node.port"}},
      {"edge-source-no-dot", R"({"version": 1, "nodes": [{"id": "p", "type": "test.passthrough"}], "edges": [["nodot", "p.in"]]})",
       {"edges[0]", "must be \"node.port\""}},
      {"edge-unknown-source-node",
       R"({"version": 1, "nodes": [{"id": "p", "type": "test.passthrough"}], "edges": [["ghost.out", "p.in"]]})",
       {"edges[0]", "source node 'ghost'"}},
      {"edge-unknown-target-node",
       R"({"version": 1, "nodes": [{"id": "c", "type": "test.const"}], "edges": [["c.out", "ghost.in"]]})",
       {"edges[0]", "target node 'ghost'"}},
      {"edge-unknown-output-port",
       R"({"version": 1, "nodes": [{"id": "c", "type": "test.const"}, {"id": "p", "type": "test.passthrough"}], "edges": [["c.nope", "p.in"]]})",
       {"edges[0]", "'c'", "no output port 'nope'"}},
      {"edge-unknown-input-port",
       R"({"version": 1, "nodes": [{"id": "c", "type": "test.const"}, {"id": "p", "type": "test.passthrough"}], "edges": [["c.out", "p.nope"]]})",
       {"edges[0]", "'p'", "no input port 'nope'"}},
      {"port-type-mismatch",
       R"({"version": 1, "nodes": [{"id": "c", "type": "test.const"}, {"id": "f", "type": "test.framepipe"}], "edges": [["c.out", "f.in"]]})",
       {"port-type mismatch", "c.out", "Color", "f.in", "Frame"}},
      {"float-into-trigger",
       R"({"version": 1, "nodes": [{"id": "a", "type": "test.floatpipe"}, {"id": "b", "type": "test.triggerpipe"}], "edges": [["a.out", "b.in"]]})",
       {"port-type mismatch", "a.out", "Float", "b.in", "Trigger"}},
      {"trigger-into-float",
       R"({"version": 1, "nodes": [{"id": "a", "type": "test.triggerpipe"}, {"id": "b", "type": "test.floatpipe"}], "edges": [["a.out", "b.in"]]})",
       {"port-type mismatch", "a.out", "Trigger", "b.in", "Float"}},
      {"float-into-color",
       R"({"version": 1, "nodes": [{"id": "a", "type": "test.floatpipe"}, {"id": "p", "type": "test.passthrough"}], "edges": [["a.out", "p.in"]]})",
       {"port-type mismatch", "a.out", "Float", "p.in", "Color"}},
      {"missing-required-float-input", R"({"version": 1, "nodes": [{"id": "f", "type": "test.floatpipe"}]})",
       {"'f'", "missing required input 'in'", "Float"}},
      {"two-edges-one-input",
       R"({"version": 1, "nodes": [{"id": "a", "type": "test.const"}, {"id": "b", "type": "test.const"}, {"id": "p", "type": "test.passthrough"}], "edges": [["a.out", "p.in"], ["b.out", "p.in"]]})",
       {"more than one edge into 'p.in'"}},
      {"two-sinks-one-output",
       R"({"version": 1, "nodes": [{"id": "a", "type": "test.const"}, {"id": "b", "type": "test.const"}, {"id": "s1", "type": "test.send", "params": {"output": "hue"}}, {"id": "s2", "type": "test.send", "params": {"output": "hue"}}], "edges": [["a.out", "s1.in"], ["b.out", "s2.in"]]})",
       {"'s1'", "'s2'", "pick-or-mix"}, {"hue"}},
      {"missing-required-input", R"({"version": 1, "nodes": [{"id": "p", "type": "test.passthrough"}]})",
       {"'p'", "missing required input 'in'", "Color"}},
      {"cycle",
       R"({"version": 1, "nodes": [{"id": "a", "type": "test.passthrough"}, {"id": "b", "type": "test.passthrough"}], "edges": [["a.out", "b.in"], ["b.out", "a.in"]]})",
       {"cycle", "'a'", "'b'"}},
      {"self-edge-cycle",
       R"({"version": 1, "nodes": [{"id": "a", "type": "test.passthrough"}], "edges": [["a.out", "a.in"]]})",
       {"cycle", "'a'"}},
      {"controls-not-array",
       R"({"version": 1, "nodes": [{"id": "n", "type": "test.counter"}], "controls": {}})",
       {"'controls'", "array"}},
      {"controls-unknown-node",
       R"({"version": 1, "nodes": [{"id": "n", "type": "test.counter"}], "controls": [{"node": "ghost", "param": "x"}]})",
       {"controls[0]", "unknown node 'ghost'"}},
      {"controls-unknown-param",
       R"({"version": 1, "nodes": [{"id": "c", "type": "test.const"}], "controls": [{"node": "c", "param": "nope"}]})",
       {"controls[0]", "'c'", "no param 'nope'"}},
      {"factory-throws", R"({"version": 1, "nodes": [{"id": "t", "type": "test.throwfactory"}]})",
       {"'t'", "threw"}},
      {"instance-port-mismatch", R"({"version": 1, "nodes": [{"id": "l", "type": "test.liar"}]})",
       {"'l'", "differs from the registry declaration"}},
    };
  }

  bool isReadableText(const std::string& text)
  {
    if(text.empty() || text.size() > 4000){
      return false;
    }
    for(char c : text){
      auto u = static_cast<unsigned char>(c);
      if(u < 0x20 && c != '\n' && c != '\t'){
        return false;
      }
    }
    return true;
  }

  // Random JSON scalar, biased toward wrong-typed and malformed values.
  nlohmann::json randomScalar(std::mt19937& rng)
  {
    switch(std::uniform_int_distribution<int>(0, 9)(rng)){
      case 0: return nullptr;
      case 1: return std::uniform_int_distribution<int>(-5000, 5000)(rng);
      case 2: return std::uniform_real_distribution<double>(-1e6, 1e6)(rng);
      case 3: return std::uniform_int_distribution<int>(0, 1)(rng) == 0;
      case 4: return "";
      case 5: return "red";
      case 6: return "a.out";
      case 7: return std::vector<nlohmann::json>{1, "x"};
      case 8: return nlohmann::json::object({{"k", 1}});
      case 9:
      default: return std::uniform_real_distribution<double>(0, 255)(rng);
    }
  }

  // Random graph doc: usually invalid (exercises rejections), sometimes
  // valid (exercises tick). Never throws: only builds JSON.
  nlohmann::json randomGraphDoc(std::mt19937& rng)
  {
    static const std::vector<std::string> ids = {"a", "b", "c", "a", "", "ghost", "x.y", "s1"};
    static const std::vector<std::string> types = {
      "test.const", "test.passthrough", "test.framepipe", "test.counter",
      "test.send", "test.paramprobe", "test.liar", "nope.nope", ""};
    static const std::vector<std::string> ports = {"in", "out", "nope", "", "out.extra"};
    auto pick = [&](const auto& pool){
      return pool[std::uniform_int_distribution<std::size_t>(0, pool.size() - 1)(rng)];
    };

    nlohmann::json doc = nlohmann::json::object();
    if(std::uniform_int_distribution<int>(0, 19)(rng) != 0){
      doc["version"] = pick(std::vector<nlohmann::json>{1, 2, "1", nullptr, -1});
    }
    if(std::uniform_int_distribution<int>(0, 3)(rng) == 0){
      doc["tickHz"] = pick(std::vector<nlohmann::json>{60, -5, 0, "fast", nullptr, 1e9});
    }

    const int nodeCount = std::uniform_int_distribution<int>(0, 4)(rng);
    doc["nodes"] = nlohmann::json::array();
    for(int i = 0; i < nodeCount; i++){
      nlohmann::json node = nlohmann::json::object();
      node["id"] = pick(ids);
      node["type"] = pick(types);
      if(std::uniform_int_distribution<int>(0, 2)(rng) != 0){
        nlohmann::json params = nlohmann::json::object();
        for(int p = 0; p < std::uniform_int_distribution<int>(0, 3)(rng); p++){
          static const std::vector<std::string> names = {
            "r", "g", "b", "mode", "flag", "bias", "output", "nope"};
          params[pick(names)] = randomScalar(rng);
        }
        node["params"] = std::move(params);
      }
      doc["nodes"].push_back(std::move(node));
    }

    if(std::uniform_int_distribution<int>(0, 2)(rng) != 0){
      doc["edges"] = nlohmann::json::array();
      const int edgeCount = std::uniform_int_distribution<int>(0, 4)(rng);
      for(int i = 0; i < edgeCount; i++){
        doc["edges"].push_back(
          {pick(ids) + "." + pick(ports), pick(ids) + "." + pick(ports)});
      }
      if(std::uniform_int_distribution<int>(0, 9)(rng) == 0 && !doc["edges"].empty()){
        // Occasionally malform one edge outright.
        doc["edges"][0] = pick(std::vector<nlohmann::json>{{"only"}, "nodot", 7, nullptr});
      }
    }

    if(std::uniform_int_distribution<int>(0, 4)(rng) == 0){
      doc["controls"] = nlohmann::json::array(
        {{{"node", pick(ids)}, {"param", pick(std::vector<std::string>{"r", "mode", "nope"})}}});
    }
    return doc;
  }

  std::string mutateString(std::mt19937& rng, const std::string& text)
  {
    if(text.empty()){
      return "{";
    }
    std::string out = text;
    switch(std::uniform_int_distribution<int>(0, 2)(rng)){
      case 0: // truncate
        out.resize(std::uniform_int_distribution<std::size_t>(0, out.size())(rng));
        break;
      case 1: { // flip bytes to random ASCII
        const int flips = std::uniform_int_distribution<int>(1, 8)(rng);
        for(int i = 0; i < flips; i++){
          out[std::uniform_int_distribution<std::size_t>(0, out.size() - 1)(rng)] =
            static_cast<char>(std::uniform_int_distribution<int>(0, 127)(rng));
        }
        break;
      }
      case 2:
      default: // splice garbage
        out.insert(
          std::uniform_int_distribution<std::size_t>(0, out.size())(rng), "\x00\xff\u2603},");
        break;
    }
    return out;
  }
}

TEST_CASE("Graph loader rejects the bad-graph corpus with actionable errors", "[Graph]")
{
  NodeRegistry registry = makeCorpusRegistry();
  for(const BadCase& bad : badGraphCorpus()){
    CAPTURE(bad.name);
    CAPTURE(bad.doc);
    std::string error = loadFails(registry, bad);
    CAPTURE(error);
    CHECK(isReadableText(error));
    for(const std::string& fragment : bad.mustContain){
      CHECK(error.find(fragment) != std::string::npos);
    }
  }
}

TEST_CASE("Graph loader fuzz: random graphs never crash the loader", "[Graph][fuzz]")
{
  INFO("fuzz seed: " << kFuzzSeed);
  NodeRegistry registry = makeCorpusRegistry();
  std::mt19937 rng(kFuzzSeed);

  for(int i = 0; i < kFuzzGraphs; i++){
    CAPTURE(i);
    nlohmann::json doc = randomGraphDoc(rng);
    CAPTURE(doc.dump());
    LoadOptions options;
    if(std::uniform_int_distribution<int>(0, 1)(rng) == 0){
      options.knownOutputs = {"hue"};
    }

    // loadGraph on the JSON value must never throw.
    LoadResult fromJson;
    bool jsonThrew = false;
    try{
      fromJson = loadGraph(doc, registry, options);
    } catch(...){
      jsonThrew = true;
    }
    CHECK(!jsonThrew);
    if(jsonThrew){
      continue;
    }

    // loadGraphFromString on the serialized form must never throw either.
    LoadResult fromText;
    bool textThrew = false;
    try{
      fromText = loadGraphFromString(doc.dump(), registry, options);
    } catch(...){
      textThrew = true;
    }
    CHECK(!textThrew);
    if(textThrew){
      continue;
    }
    CHECK(fromJson.ok == fromText.ok);
    if(!fromText.ok){
      CHECK(isReadableText(fromText.error));
      continue;
    }

    // Whatever loads must also tick without throwing, on odd dts too.
    bool tickThrew = false;
    try{
      fromText.graph.tick(1.f / 60.f);
      fromText.graph.tick(0.f);
      fromText.graph.tick(-1.f);
      fromText.graph.tick(1e6f);
      CHECK(fromText.graph.evalOrder().size() == fromText.graph.nodeCount());
      // Garbage port lookups return null, never crash.
      CHECK(fromText.graph.portValue("nope", "nope") == nullptr);
    } catch(...){
      tickThrew = true;
    }
    CHECK(!tickThrew);
  }

  for(int i = 0; i < kFuzzMutatedStrings; i++){
    CAPTURE(i);
    nlohmann::json doc = randomGraphDoc(rng);
    std::string text = mutateString(rng, doc.dump());
    bool threw = false;
    try{
      LoadResult result = loadGraphFromString(text, registry);
      if(!result.ok){
        CHECK(isReadableText(result.error));
      } else {
        result.graph.tick(1.f / 60.f);
      }
    } catch(...){
      threw = true;
    }
    CHECK(!threw);
  }
}
