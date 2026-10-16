// Tier 2 color and palette nodes (Aurora-id8j.5): per-node cases through the Graph.
#include <catch2/catch_approx.hpp>
#include <catch2/catch_test_macros.hpp>

#include <cmath>
#include <limits>
#include <memory>
#include <set>
#include <string>
#include <tuple>
#include <unordered_map>
#include <utility>
#include <vector>

#include <Aurora/Runtime/Graph/ColorNodes.hpp>
#include <Aurora/Runtime/Graph/Graph.hpp>
#include <Aurora/Runtime/Graph/GraphLoader.hpp>

using Aurora::Contracts::Color;
using Catch::Approx;
using namespace Aurora::Runtime::Graph;

namespace
{
  // Test-only sources: each emits whatever value the test last set.
  GraphValue g_float = 0.f;
  GraphValue g_float2 = 0.f;
  GraphValue g_angle = Angle{};
  GraphValue g_angle2 = Angle{};
  GraphValue g_colorA = Color{};
  GraphValue g_colorB = Color{};

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
    registerColorNodes(registry);
    addSource(registry, "test.float", &g_float, PortType::Float);
    addSource(registry, "test.float2", &g_float2, PortType::Float);
    addSource(registry, "test.angle", &g_angle, PortType::Angle);
    addSource(registry, "test.angle2", &g_angle2, PortType::Angle);
    addSource(registry, "test.colorA", &g_colorA, PortType::Color);
    addSource(registry, "test.colorB", &g_colorB, PortType::Color);
    return registry;
  }

  struct Feed
  {
    std::string sourceType;
    std::string id;       // source node id
    std::string inPort;   // port on "m"
  };

  LoadResult tryLoad(const std::string& type, const std::string& params, const std::vector<Feed>& feeds)
  {
    NodeRegistry registry = makeRegistry();
    std::string nodes;
    std::string edges;
    for(const auto& feed : feeds){
      nodes += R"({"id": ")" + feed.id + R"(", "type": ")" + feed.sourceType + R"(", "params": {}},)";
      edges += std::string(edges.empty() ? "" : ", ") + R"([")" + feed.id + R"(.value", "m.)" +
        feed.inPort + R"("])";
    }
    return loadGraphFromString(
      R"({"version": 1, "nodes": [)" + nodes + R"({"id": "m", "type": ")" + type + R"(", "params": )" +
        params + R"(}], "edges": [)" + edges + "]}",
      registry);
  }

  Graph load(const std::string& type, const std::string& params, const std::vector<Feed>& feeds)
  {
    LoadResult loaded = tryLoad(type, params, feeds);
    INFO(loaded.error);
    REQUIRE(loaded.ok);
    return std::move(loaded.graph);
  }

  const GraphValue& out(Graph& graph, const char* port)
  {
    const GraphValue* value = graph.portValue("m", port);
    REQUIRE(value != nullptr);
    return *value;
  }

  Color outColor(Graph& graph)
  {
    const Color* color = std::get_if<Color>(&out(graph, "color"));
    REQUIRE(color != nullptr);
    return *color;
  }

  float outFloat(Graph& graph, const char* port)
  {
    const float* number = std::get_if<float>(&out(graph, port));
    REQUIRE(number != nullptr);
    return *number;
  }

  float outAngle(Graph& graph, const char* port)
  {
    const Angle* angle = std::get_if<Angle>(&out(graph, port));
    REQUIRE(angle != nullptr);
    return angle->degrees;
  }

  const Feed kHue{"test.angle", "h", "hue"};
  const Feed kColorA{"test.colorA", "a", "color"};
  const Feed kMixA{"test.colorA", "a", "a"};
  const Feed kMixB{"test.colorB", "b", "b"};
}

TEST_CASE("color.fromHSV builds from a hue and uses params when s and v are unconnected", "[ColorNodes]")
{
  g_angle = Angle{120.f};
  Graph graph = load("color.fromHSV", R"({"saturation": 1, "value": 0.5})", {kHue});
  graph.tick(1.f / 60.f);
  CHECK(outColor(graph) == Color::fromHSV(120.f, 1.f, 0.5f));
}

TEST_CASE("color.fromHSV prefers connected saturation and value and clamps them", "[ColorNodes]")
{
  g_angle = Angle{0.f};
  g_float = 0.25f;
  g_float2 = 7.f; // clamps to 1
  Graph graph = load("color.fromHSV", "{}",
    {kHue, {"test.float", "s", "saturation"}, {"test.float2", "v", "value"}});
  graph.tick(1.f / 60.f);
  CHECK(outColor(graph) == Color::fromHSV(0.f, 0.25f, 1.f));
}

TEST_CASE("color.fromHSV fails the node on a non-finite hue", "[ColorNodes]")
{
  g_angle = Angle{std::numeric_limits<float>::quiet_NaN()};
  Graph graph = load("color.fromHSV", "{}", {kHue});
  graph.tick(1.f / 60.f);
  CHECK(asError(out(graph, "color")) != nullptr);
}

TEST_CASE("color.toHSV splits a color into hue, saturation and value", "[ColorNodes]")
{
  g_colorA = Color::fromHSV(210.f, 0.6f, 0.8f);
  Graph graph = load("color.toHSV", "{}", {kColorA});
  graph.tick(1.f / 60.f);
  CHECK(outAngle(graph, "hue") == Approx(210.f).margin(1.f));
  CHECK(outFloat(graph, "saturation") == Approx(0.6f).margin(0.01f));
  CHECK(outFloat(graph, "value") == Approx(0.8f).margin(0.01f));
}

TEST_CASE("color.brightness is the weighted luma", "[ColorNodes]")
{
  g_colorA = Color(255, 255, 255);
  Graph graph = load("color.brightness", "{}", {kColorA});
  graph.tick(1.f / 60.f);
  CHECK(outFloat(graph, "value") == Approx(1.f));

  g_colorA = Color(0, 255, 0);
  graph.tick(1.f / 60.f);
  CHECK(outFloat(graph, "value") == Approx(0.59f));
}

TEST_CASE("color.mix blends endpoints and midpoint in RGB", "[ColorNodes]")
{
  g_colorA = Color(255, 0, 0);
  g_colorB = Color(0, 0, 255);
  for(auto [t, red, blue] : std::vector<std::tuple<float, int, int>>{{0.f, 255, 0}, {1.f, 0, 255}, {0.5f, 128, 128}}){
    INFO(t);
    Graph graph = load("color.mix", "{\"t\": " + std::to_string(t) + "}", {kMixA, kMixB});
    graph.tick(1.f / 60.f);
    Color mixed = outColor(graph);
    CHECK(static_cast<int>(mixed.m_r) == red);
    CHECK(static_cast<int>(mixed.m_g) == 0);
    CHECK(static_cast<int>(mixed.m_b) == blue);
  }
}

TEST_CASE("color.mix takes t from the input and clamps it", "[ColorNodes]")
{
  g_colorA = Color(255, 0, 0);
  g_colorB = Color(0, 0, 255);
  g_float = 5.f;
  Graph graph = load("color.mix", "{}", {kMixA, kMixB, {"test.float", "t", "t"}});
  graph.tick(1.f / 60.f);
  CHECK(outColor(graph) == Color(0, 0, 255));
}

TEST_CASE("color.hueShift rotates the hue by the param or the input", "[ColorNodes]")
{
  g_colorA = Color(255, 0, 0);
  Graph byParam = load("color.hueShift", R"({"degrees": 120})", {kColorA});
  byParam.tick(1.f / 60.f);
  CHECK(outColor(byParam) == Color(0, 255, 0));

  g_float = -120.f;
  Graph byInput = load("color.hueShift", "{}", {kColorA, {"test.float", "d", "degrees"}});
  byInput.tick(1.f / 60.f);
  CHECK(outColor(byInput) == Color(0, 0, 255));
}

TEST_CASE("color.complement flips to the opposite hue", "[ColorNodes]")
{
  g_colorA = Color(255, 0, 0);
  Graph graph = load("color.complement", "{}", {kColorA});
  graph.tick(1.f / 60.f);
  CHECK(outColor(graph) == Color(0, 255, 255));
}

TEST_CASE("angle.add sums two Angles and wraps at 360", "[ColorNodes]")
{
  Graph graph = load("angle.add", "{}", {{"test.angle", "x", "a"}, {"test.angle2", "y", "b"}});
  g_angle = Angle{100.f};
  g_angle2 = Angle{50.f};
  graph.tick(1.f / 60.f);
  CHECK(outAngle(graph, "angle") == Approx(150.f));
  g_angle = Angle{300.f};
  g_angle2 = Angle{100.f};
  graph.tick(1.f / 60.f);
  CHECK(outAngle(graph, "angle") == Approx(40.f));
}

TEST_CASE("color.fromGradient samples stops, holds past the ends and clamps t", "[ColorNodes]")
{
  const std::string gradient =
    R"({"gradient": [{"pos": 0, "color": "#0000ff"}, {"pos": 0.5, "color": "#00ff00"}, {"pos": 1, "color": "#FF0000"}]})";
  Graph graph = load("color.fromGradient", gradient, {{"test.float", "t", "t"}});
  for(auto [t, expected] : std::vector<std::pair<float, Color>>{
        {0.f, Color(0, 0, 255)},
        {0.25f, Color(0, 128, 128)},
        {0.5f, Color(0, 255, 0)},
        {0.75f, Color(128, 128, 0)},
        {1.f, Color(255, 0, 0)},
        {-3.f, Color(0, 0, 255)},
        {9.f, Color(255, 0, 0)}}){
    INFO(t);
    g_float = t;
    graph.tick(1.f / 60.f);
    Color got = outColor(graph);
    CHECK(static_cast<int>(got.m_r) == Approx(expected.m_r).margin(1));
    CHECK(static_cast<int>(got.m_g) == Approx(expected.m_g).margin(1));
    CHECK(static_cast<int>(got.m_b) == Approx(expected.m_b).margin(1));
  }
}

TEST_CASE("color.fromGradient holds the first and last stop outside their positions", "[ColorNodes]")
{
  Graph graph = load("color.fromGradient",
    R"({"gradient": [{"pos": 0.4, "color": "#102030"}, {"pos": 0.6, "color": "#ffffff"}]})",
    {{"test.float", "t", "t"}});
  g_float = 0.1f;
  graph.tick(1.f / 60.f);
  CHECK(outColor(graph) == Color(0x10, 0x20, 0x30));
  g_float = 0.9f;
  graph.tick(1.f / 60.f);
  CHECK(outColor(graph) == Color(255, 255, 255));
}

TEST_CASE("color.fromGradient defaults to black-to-white", "[ColorNodes]")
{
  Graph graph = load("color.fromGradient", "{}", {{"test.float", "t", "t"}});
  g_float = 1.f;
  graph.tick(1.f / 60.f);
  CHECK(outColor(graph) == Color(255, 255, 255));
}

TEST_CASE("gradient param rejects malformed values at load", "[ColorNodes]")
{
  const std::vector<std::pair<std::string, std::string>> bad{
    {"not-array", R"({"gradient": "#ff0000"})"},
    {"one-stop", R"({"gradient": [{"pos": 0, "color": "#ff0000"}]})"},
    {"descending", R"({"gradient": [{"pos": 0.8, "color": "#ff0000"}, {"pos": 0.2, "color": "#00ff00"}]})"},
    {"pos-out-of-range", R"({"gradient": [{"pos": 0, "color": "#ff0000"}, {"pos": 1.5, "color": "#00ff00"}]})"},
    {"bad-hex", R"({"gradient": [{"pos": 0, "color": "red"}, {"pos": 1, "color": "#00ff00"}]})"},
    {"short-hex", R"({"gradient": [{"pos": 0, "color": "#f00"}, {"pos": 1, "color": "#00ff00"}]})"},
    {"missing-pos", R"({"gradient": [{"color": "#ff0000"}, {"pos": 1, "color": "#00ff00"}]})"},
    {"stop-not-object", R"({"gradient": [[0, "#ff0000"], [1, "#00ff00"]]})"},
  };
  for(const auto& [name, params] : bad){
    INFO(name);
    LoadResult loaded = tryLoad("color.fromGradient", params, {{"test.float", "t", "t"}});
    CHECK_FALSE(loaded.ok);
    CHECK(loaded.error.find("'gradient'") != std::string::npos);
  }

  std::string many = "[";
  for(int i = 0; i < 17; ++i){
    many += std::string(i ? "," : "") + R"({"pos": 0.5, "color": "#000000"})";
  }
  LoadResult tooMany = tryLoad("color.fromGradient", "{\"gradient\": " + many + "]}", {{"test.float", "t", "t"}});
  CHECK_FALSE(tooMany.ok);
}

TEST_CASE("hex helpers round-trip and reject bad text", "[ColorNodes]")
{
  CHECK(colorToHex(Color(1, 171, 255)) == "#01abff");
  CHECK(parseHexColor("#01ABff") == Color(1, 171, 255));
  CHECK_FALSE(parseHexColor("01abff").has_value());
  CHECK_FALSE(parseHexColor("#01abfg").has_value());
  CHECK_FALSE(parseHexColor("#01ab").has_value());
}

TEST_CASE("palette.randomAnchor with a seed is deterministic and lands on a pair anchor", "[ColorNodes]")
{
  const std::set<float> anchors{0.f, 30.f, 60.f, 90.f, 120.f, 150.f};
  std::set<float> seen;
  for(int seed = 0; seed < 40; ++seed){
    INFO(seed);
    Graph first = load("palette.randomAnchor", "{\"seed\": " + std::to_string(seed) + "}", {});
    Graph second = load("palette.randomAnchor", "{\"seed\": " + std::to_string(seed) + "}", {});
    first.tick(1.f / 60.f);
    second.tick(1.f / 60.f);
    float value = outAngle(first, "anchor");
    CHECK(value == outAngle(second, "anchor"));
    CHECK(anchors.count(value) == 1);
    seen.insert(value);
  }
  CHECK(seen.size() > 1);
}

TEST_CASE("palette.randomAnchor holds its pick across ticks", "[ColorNodes]")
{
  Graph graph = load("palette.randomAnchor", R"({"seed": 3})", {});
  graph.tick(1.f / 60.f);
  float first = outAngle(graph, "anchor");
  for(int i = 0; i < 100; ++i){
    graph.tick(1.f / 60.f);
    REQUIRE(outAngle(graph, "anchor") == first);
  }
}

TEST_CASE("palette.randomAnchor unseeded still picks a pair anchor", "[ColorNodes]")
{
  const std::set<float> anchors{0.f, 30.f, 60.f, 90.f, 120.f, 150.f};
  Graph graph = load("palette.randomAnchor", R"({"seed": null})", {});
  graph.tick(1.f / 60.f);
  CHECK(anchors.count(outAngle(graph, "anchor")) == 1);
}

TEST_CASE("palette.pick returns the anchor or its complement", "[ColorNodes]")
{
  g_angle = Angle{150.f};
  Graph anchor = load("palette.pick", "{}", {{"test.angle", "n", "anchor"}});
  anchor.tick(1.f / 60.f);
  CHECK(outAngle(anchor, "hue") == Approx(150.f));

  Graph complement = load("palette.pick", R"({"side": "complement"})", {{"test.angle", "n", "anchor"}});
  complement.tick(1.f / 60.f);
  CHECK(outAngle(complement, "hue") == Approx(330.f));

  g_angle = Angle{210.f};
  complement.tick(1.f / 60.f);
  CHECK(outAngle(complement, "hue") == Approx(30.f)); // wraps
}

TEST_CASE("palette.randomAnchor into pick and fromHSV builds a complementary pair", "[ColorNodes]")
{
  NodeRegistry registry = makeRegistry();
  LoadResult loaded = loadGraphFromString(
    R"({"version": 1, "nodes": [
      {"id": "r", "type": "palette.randomAnchor", "params": {"seed": 5}},
      {"id": "p", "type": "palette.pick", "params": {"side": "complement"}},
      {"id": "m", "type": "color.fromHSV", "params": {}}],
     "edges": [["r.anchor", "p.anchor"], ["p.hue", "m.hue"]]})",
    registry);
  INFO(loaded.error);
  REQUIRE(loaded.ok);
  loaded.graph.tick(1.f / 60.f);
  const GraphValue* hue = loaded.graph.portValue("p", "hue");
  const GraphValue* base = loaded.graph.portValue("r", "anchor");
  REQUIRE(hue != nullptr);
  REQUIRE(base != nullptr);
  float expected = std::fmod(std::get<Angle>(*base).degrees + 180.f, 360.f);
  CHECK(std::get<Angle>(*hue).degrees == Approx(expected));
  CHECK(outColor(loaded.graph) == Color::fromHSV(expected, 1.f, 1.f));
}
