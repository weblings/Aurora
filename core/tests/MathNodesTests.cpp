// Tier 2 scalar math nodes (Aurora-id8j.3): per-node cases through the Graph.
#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <cmath>
#include <limits>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <Aurora/Runtime/Graph/Graph.hpp>
#include <Aurora/Runtime/Graph/GraphLoader.hpp>
#include <Aurora/Runtime/Graph/MathNodes.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>

using Catch::Approx;
using namespace Aurora::Runtime::Graph;

namespace
{
  // Test-only Float sources, set per case.
  float g_a = 0.f;
  float g_b = 0.f;

  class TestFloatSource : public INode
  {
  public:
    explicit TestFloatSource(const float* source)
    : m_source(source)
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
    const float* m_source;
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"value", PortType::Float, false}};
  };

  NodeRegistry makeRegistry()
  {
    NodeRegistry registry;
    registerMathNodes(registry);
    for(const auto& [type, source] : {std::pair{"test.a", &g_a}, std::pair{"test.b", &g_b}}){
      const float* ptr = source;
      registry.registerType(
        type,
        NodeTypeInfo{
          .meta = {.purpose = "test", .useWhen = "test", .example = "{}", .cost = "cheap"},
          .inputs = {},
          .outputs = {{"value", PortType::Float, false}},
          .params = {},
          .factory = [ptr] { return std::make_unique<TestFloatSource>(ptr); },
        });
    }
    return registry;
  }

  // Wires test.a (and test.b when `twoInputs`) into one math node "m" and
  // ticks once. Returns the node's value, or nullopt when it errored.
  struct Result
  {
    bool errored = false;
    std::string message;
    float value = 0.f;
  };

  Result run(
    const std::string& type,
    const std::string& params,
    float a,
    float b = 0.f,
    const std::string& inPorts = "value")
  {
    NodeRegistry registry = makeRegistry();
    std::string edges = R"(["a.value", "m.)" + inPorts.substr(0, inPorts.find(',')) + R"("])";
    std::string nodes = R"({"id": "a", "type": "test.a", "params": {}},)";
    if(inPorts.find(',') != std::string::npos){
      nodes += R"({"id": "b", "type": "test.b", "params": {}},)";
      edges += R"(, ["b.value", "m.)" + inPorts.substr(inPorts.find(',') + 1) + R"("])";
    }
    LoadResult loaded = loadGraphFromString(
      R"({"version": 1, "nodes": [)" + nodes + R"({"id": "m", "type": ")" + type +
        R"(", "params": )" + params + R"(}], "edges": [)" + edges + "]}",
      registry);
    INFO(loaded.error);
    REQUIRE(loaded.ok);
    g_a = a;
    g_b = b;
    loaded.graph.tick(1.f / 60.f);
    const GraphValue* value = loaded.graph.portValue("m", "value");
    REQUIRE(value != nullptr);
    Result result;
    if(const GraphError* err = asError(*value)){
      result.errored = true;
      result.message = err->message;
      return result;
    }
    const float* number = std::get_if<float>(value);
    REQUIRE(number != nullptr);
    result.value = *number;
    return result;
  }
} // namespace

TEST_CASE("math.scale multiplies by the factor", "[MathNodes]")
{
  CHECK(run("math.scale", R"({"factor": 180})", 0.5f).value == Approx(90.f));
  CHECK(run("math.scale", "{}", 0.5f).value == Approx(0.5f)); // default factor 1
}

TEST_CASE("math.divide divides and rejects a zero divisor", "[MathNodes]")
{
  CHECK(run("math.divide", R"({"divisor": 4})", 1.f).value == Approx(0.25f));
  Result zero = run("math.divide", R"({"divisor": 0})", 1.f);
  CHECK(zero.errored);
  CHECK(zero.message.find("divisor") != std::string::npos);
}

TEST_CASE("math.clamp limits to min..max", "[MathNodes]")
{
  const char* params = R"({"min": -1, "max": 1})";
  CHECK(run("math.clamp", params, 3.f).value == Approx(1.f));
  CHECK(run("math.clamp", params, -3.f).value == Approx(-1.f));
  CHECK(run("math.clamp", params, 0.25f).value == Approx(0.25f));
  CHECK(run("math.clamp", R"({"min": 2, "max": 1})", 0.f).errored);
}

TEST_CASE("math.mapRange remaps and optionally clamps", "[MathNodes]")
{
  const char* clamped = R"({"inMin": 0, "inMax": 10, "outMin": 1, "outMax": 3, "clamp": true})";
  CHECK(run("math.mapRange", clamped, 5.f).value == Approx(2.f));
  CHECK(run("math.mapRange", clamped, 20.f).value == Approx(3.f));
  CHECK(run("math.mapRange", clamped, -5.f).value == Approx(1.f));

  const char* open = R"({"inMin": 0, "inMax": 10, "outMin": 1, "outMax": 3, "clamp": false})";
  CHECK(run("math.mapRange", open, 20.f).value == Approx(5.f));

  const char* reversed = R"({"inMin": 0, "inMax": 1, "outMin": 1, "outMax": 0})";
  CHECK(run("math.mapRange", reversed, 0.25f).value == Approx(0.75f));

  CHECK(run("math.mapRange", R"({"inMin": 1, "inMax": 1})", 0.f).errored);
}

TEST_CASE("math.lerp blends from..to by t without clamping", "[MathNodes]")
{
  const char* params = R"({"from": 0.5, "to": 1.5})";
  CHECK(run("math.lerp", params, 0.f, 0.f, "t").value == Approx(0.5f));
  CHECK(run("math.lerp", params, 1.f, 0.f, "t").value == Approx(1.5f));
  CHECK(run("math.lerp", params, 0.25f, 0.f, "t").value == Approx(0.75f));
  CHECK(run("math.lerp", params, 2.f, 0.f, "t").value == Approx(2.5f));
}

TEST_CASE("math.add, multiply and max combine two inputs", "[MathNodes]")
{
  CHECK(run("math.add", "{}", 1.5f, 2.f, "a,b").value == Approx(3.5f));
  CHECK(run("math.multiply", "{}", 1.5f, 2.f, "a,b").value == Approx(3.f));
  CHECK(run("math.max", "{}", -1.f, -2.f, "a,b").value == Approx(-1.f));
  CHECK(run("math.max", "{}", 1.f, 2.f, "a,b").value == Approx(2.f));
}

TEST_CASE("math.invert flips 0..1", "[MathNodes]")
{
  CHECK(run("math.invert", "{}", 0.25f).value == Approx(0.75f));
  CHECK(run("math.invert", "{}", 1.f).value == Approx(0.f));
}

TEST_CASE("math nodes turn a non-finite result into a node error", "[MathNodes]")
{
  const float inf = std::numeric_limits<float>::infinity();
  const float nan = std::numeric_limits<float>::quiet_NaN();
  CHECK(run("math.scale", R"({"factor": 2})", inf).errored);
  CHECK(run("math.add", "{}", nan, 1.f, "a,b").errored);
  CHECK(run("math.multiply", "{}", inf, 0.f, "a,b").errored); // inf * 0 is NaN
}

TEST_CASE("math node params clamp to the declared range at load", "[MathNodes]")
{
  CHECK(run("math.scale", R"({"factor": 1e12})", 1.f).value == Approx(1.0e6f));
}

TEST_CASE("math node descriptors carry full agent metadata", "[MathNodes]")
{
  NodeRegistry registry;
  registerMathNodes(registry);
  REQUIRE(registry.types().size() == 9);
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

TEST_CASE("math node examples parse as graph nodes of their own type", "[MathNodes]")
{
  NodeRegistry registry;
  registerMathNodes(registry);
  for(const std::string& type : registry.types()){
    INFO(type);
    nlohmann::json example = nlohmann::json::parse(registry.find(type)->meta.example);
    CHECK(example.at("type") == type);
  }
}
