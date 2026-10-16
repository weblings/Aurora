// Tier 2 spatial Image generators (Aurora-id8j.7): per-node cases through the Graph,
// plus generator -> zones.sample against a known ZoneMap.
#include <catch2/catch_test_macros.hpp>

#include <chrono>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <Aurora/Runtime/Graph/GraphHost.hpp>
#include <Aurora/Runtime/Graph/Graph.hpp>
#include <Aurora/Runtime/Graph/GraphLoader.hpp>
#include <Aurora/Runtime/Graph/SpatialNodes.hpp>
#include <Aurora/Runtime/Graph/VideoNodes.hpp>

using Aurora::Contracts::Color;
using Aurora::Contracts::Frame;
using Aurora::Contracts::ImageData;
using Aurora::Runtime::ZoneConfig;
using Aurora::Runtime::ZoneMap;
using namespace Aurora::Runtime::Graph;

namespace
{
  GraphValue g_float = 0.f;
  GraphValue g_color = Color{};

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
    registerSpatialNodes(registry);
    registerVideoNodes(registry);
    addSource(registry, "test.float", &g_float, PortType::Float);
    addSource(registry, "test.color", &g_color, PortType::Color);
    return registry;
  }

  class FakeHost : public IGraphHost
  {
  public:
    const ZoneMap* zoneMap(std::string_view name) override
    {
      auto it = maps.find(std::string(name));
      return it != maps.end() ? &it->second : nullptr;
    }

    std::unordered_map<std::string, ZoneMap> maps{};
  };

  // `nodes` is the JSON node list body, `edges` the edge list body.
  Graph load(const std::string& nodes, const std::string& edges = "")
  {
    NodeRegistry registry = makeRegistry();
    LoadResult loaded = loadGraphFromString(
      R"({"version": 1, "nodes": [)" + nodes + R"(], "edges": [)" + edges + "]}", registry);
    INFO(loaded.error);
    REQUIRE(loaded.ok);
    return std::move(loaded.graph);
  }

  Graph loadGen(const std::string& type, const std::string& params)
  {
    return load(R"({"id": "g", "type": ")" + type + R"(", "params": )" + params + "}");
  }

  ImagePtr genImage(Graph& graph, const char* id = "g")
  {
    const GraphValue* value = graph.portValue(id, "image");
    REQUIRE(value != nullptr);
    const ImagePtr* image = std::get_if<ImagePtr>(value);
    REQUIRE(image != nullptr);
    REQUIRE(*image != nullptr);
    return *image;
  }

  cv::Vec3b pixel(const ImagePtr& image, int row, int col)
  {
    return image->imageMatrix.at<cv::Vec3b>(row, col);
  }

  void checkPixel(const ImagePtr& image, int row, int col, int r, int g, int b)
  {
    cv::Vec3b px = pixel(image, row, col);
    INFO("row " << row << " col " << col);
    CHECK(std::abs(px[0] - r) <= 1);
    CHECK(std::abs(px[1] - g) <= 1);
    CHECK(std::abs(px[2] - b) <= 1);
  }

  void checkZone(const Frame& frame, size_t index, int r, int g, int b)
  {
    REQUIRE(frame.size() > index);
    glm::vec3 rgb = frame[index].color.toNormalized() * 255.f;
    INFO("zone " << index);
    CHECK(std::abs(rgb.r - r) <= 2.f);
    CHECK(std::abs(rgb.g - g) <= 2.f);
    CHECK(std::abs(rgb.b - b) <= 2.f);
  }

  // Four zones, each covering one quarter of the image width.
  ZoneMap quarterZones()
  {
    ZoneMap zones;
    for(int i = 0; i < 4; ++i){
      ZoneConfig zone;
      zone.zoneId = static_cast<uint8_t>(i + 1);
      zone.uvs = {{i * 0.25f, 0.f}, {(i + 1) * 0.25f, 1.f}};
      zone.active = true;
      zone.everConfigured = true;
      zones.push_back(zone);
    }
    return zones;
  }

  Frame sampleFrame(const std::string& genType, const std::string& genParams)
  {
    Graph graph = load(
      R"({"id": "g", "type": ")" + genType + R"(", "params": )" + genParams +
        R"(}, {"id": "z", "type": "zones.sample", "params": {"output": "room"}})",
      R"(["g.image", "z.image"])");
    FakeHost host;
    host.maps["room"] = quarterZones();
    graph.tick(1.f / 60.f, &host);
    const GraphValue* value = graph.portValue("z", "frame");
    REQUIRE(value != nullptr);
    const Frame* frame = std::get_if<Frame>(value);
    REQUIRE(frame != nullptr);
    return *frame;
  }

  const char* kRedToBlue =
    R"([{"pos": 0, "color": "#ff0000"}, {"pos": 1, "color": "#0000ff"}])";
}

TEST_CASE("image.gradient into zones.sample gives each zone its quarter of the ramp", "[SpatialNodes]")
{
  Frame frame = sampleFrame("image.gradient",
    std::string(R"({"width": 40, "height": 4, "gradient": )") + kRedToBlue + "}");
  REQUIRE(frame.size() == 4);
  // Zone centers sit at 0.125, 0.375, 0.625, 0.875 along the ramp.
  checkZone(frame, 0, 223, 0, 32);
  checkZone(frame, 1, 159, 0, 96);
  checkZone(frame, 2, 96, 0, 159);
  checkZone(frame, 3, 32, 0, 223);
}

TEST_CASE("image.gradient angle 90 runs top to bottom", "[SpatialNodes]")
{
  Graph graph = loadGen("image.gradient",
    std::string(R"({"width": 2, "height": 4, "angle": 90, "gradient": )") + kRedToBlue + "}");
  graph.tick(1.f / 60.f);
  ImagePtr image = genImage(graph);
  REQUIRE(image->width() == 2);
  REQUIRE(image->height() == 4);
  checkPixel(image, 0, 0, 223, 0, 32);
  checkPixel(image, 3, 1, 32, 0, 223);
  CHECK(pixel(image, 1, 0) == pixel(image, 1, 1)); // constant along the other axis
}

TEST_CASE("image.gradient angle 180 mirrors the ramp", "[SpatialNodes]")
{
  Graph graph = loadGen("image.gradient",
    std::string(R"({"width": 4, "height": 1, "angle": 180, "gradient": )") + kRedToBlue + "}");
  graph.tick(1.f / 60.f);
  ImagePtr image = genImage(graph);
  checkPixel(image, 0, 0, 32, 0, 223);
  checkPixel(image, 0, 3, 223, 0, 32);
}

TEST_CASE("image.gradient phase input scrolls and wraps", "[SpatialNodes]")
{
  g_float = 0.5f;
  Graph graph = load(
    std::string(R"({"id": "g", "type": "image.gradient", "params": {"width": 4, "height": 1, "gradient": )") +
      kRedToBlue + R"(}}, {"id": "p", "type": "test.float", "params": {}})",
    R"(["p.value", "g.phase"])");
  graph.tick(1.f / 60.f);
  ImagePtr image = genImage(graph);
  // p + 0.5 wraps: 0.625, 0.875, 0.125 (wrapped from 1.125), 0.375
  checkPixel(image, 0, 0, 96, 0, 159);
  checkPixel(image, 0, 1, 32, 0, 223);
  checkPixel(image, 0, 2, 223, 0, 32);
  checkPixel(image, 0, 3, 159, 0, 96);
}

TEST_CASE("image.bar into zones.sample lights only the zone under the bar", "[SpatialNodes]")
{
  Frame frame = sampleFrame("image.bar",
    R"({"width": 40, "height": 4, "position": 0.125, "size": 0.25})");
  REQUIRE(frame.size() == 4);
  checkZone(frame, 0, 255, 255, 255);
  checkZone(frame, 1, 0, 0, 0);
  checkZone(frame, 2, 0, 0, 0);
  checkZone(frame, 3, 0, 0, 0);

  Frame moved = sampleFrame("image.bar",
    R"({"width": 40, "height": 4, "position": 0.875, "size": 0.25})");
  checkZone(moved, 0, 0, 0, 0);
  checkZone(moved, 3, 255, 255, 255);
}

TEST_CASE("image.bar uses color and background inputs", "[SpatialNodes]")
{
  g_color = Color(255, 0, 0);
  Graph graph = load(
    R"({"id": "g", "type": "image.bar", "params": {"width": 4, "height": 1, "position": 0.125, "size": 0.25}},
        {"id": "c", "type": "test.color", "params": {}})",
    R"(["c.value", "g.color"])");
  graph.tick(1.f / 60.f);
  ImagePtr image = genImage(graph);
  checkPixel(image, 0, 0, 255, 0, 0);
  checkPixel(image, 0, 1, 0, 0, 0);
}

TEST_CASE("image.bar softness fades past the edge and wrap re-enters", "[SpatialNodes]")
{
  // Bar at 0.5 with half-width 0.125 and a 0.25 fade beyond it.
  Graph soft = loadGen("image.bar",
    R"({"width": 8, "height": 1, "position": 0.5, "size": 0.25, "softness": 0.25})");
  soft.tick(1.f / 60.f);
  ImagePtr image = genImage(soft);
  // px 3 (p 0.4375) is inside the bar.
  checkPixel(image, 0, 3, 255, 255, 255);
  // px 5 (p 0.6875) is 0.0625 past the edge: coverage 0.75.
  checkPixel(image, 0, 5, 191, 191, 191);
  checkPixel(image, 0, 7, 0, 0, 0);

  Graph hard = loadGen("image.bar",
    R"({"width": 8, "height": 1, "position": 0.99, "size": 0.2, "wrap": false})");
  hard.tick(1.f / 60.f);
  checkPixel(genImage(hard), 0, 0, 0, 0, 0);

  Graph wrapped = loadGen("image.bar",
    R"({"width": 8, "height": 1, "position": 0.99, "size": 0.2, "wrap": true})");
  wrapped.tick(1.f / 60.f);
  checkPixel(genImage(wrapped), 0, 0, 255, 255, 255); // p 0.0625 is 0.0725 from 0.99 around the loop
}

TEST_CASE("image.hueRamp runs hue across the image", "[SpatialNodes]")
{
  Graph graph = loadGen("image.hueRamp", R"({"width": 4, "height": 1})");
  graph.tick(1.f / 60.f);
  ImagePtr image = genImage(graph);
  // Hues 45, 135, 225, 315 at full saturation and value.
  checkPixel(image, 0, 0, 255, 191, 0);
  checkPixel(image, 0, 1, 0, 255, 64);
  checkPixel(image, 0, 2, 0, 64, 255);
  checkPixel(image, 0, 3, 255, 0, 191);
}

TEST_CASE("image.hueRamp phase input rotates the ramp", "[SpatialNodes]")
{
  g_float = 90.f;
  Graph graph = load(
    R"({"id": "g", "type": "image.hueRamp", "params": {"width": 4, "height": 1}},
        {"id": "p", "type": "test.float", "params": {}})",
    R"(["p.value", "g.phase"])");
  graph.tick(1.f / 60.f);
  checkPixel(genImage(graph), 0, 0, 0, 255, 64); // hue 135
}

TEST_CASE("generators keep the same ImagePtr until an input changes", "[SpatialNodes]")
{
  g_float = 0.1f;
  Graph graph = load(
    std::string(R"({"id": "g", "type": "image.gradient", "params": {"width": 8, "height": 2, "gradient": )") +
      kRedToBlue + R"(}}, {"id": "p", "type": "test.float", "params": {}})",
    R"(["p.value", "g.phase"])");
  graph.tick(1.f / 60.f);
  ImagePtr first = genImage(graph);
  graph.tick(1.f / 60.f);
  CHECK(genImage(graph) == first);

  g_float = 0.2f;
  graph.tick(1.f / 60.f);
  CHECK(genImage(graph) != first);
}

TEST_CASE("generator size params clamp to the schema range", "[SpatialNodes]")
{
  Graph graph = loadGen("image.hueRamp", R"({"width": 0, "height": 5000})");
  graph.tick(1.f / 60.f);
  ImagePtr image = genImage(graph);
  CHECK(image->width() == 1);
  CHECK(image->height() == 1024);
}

TEST_CASE("Spatial node descriptors carry full agent metadata", "[SpatialNodes]")
{
  NodeRegistry registry;
  registerSpatialNodes(registry);
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

// Run with `AuroraRuntimeTests "[.perf]"`. Prints microseconds per cold render.
TEST_CASE("spatial generator render cost", "[.perf]")
{
  struct Size { int w; int h; };
  for(const char* type : {"image.gradient", "image.bar", "image.hueRamp"}){
    for(Size size : {Size{64, 36}, Size{96, 54}, Size{192, 108}, Size{480, 270}}){
      // A drifting phase or position forces a re-render every tick.
      const char* drive = std::string(type) == "image.bar" ? "position" : "phase";
      Graph graph = load(
        std::string(R"({"id": "g", "type": ")") + type + R"(", "params": {"width": )" +
          std::to_string(size.w) + R"(, "height": )" + std::to_string(size.h) +
          R"(, "angle": 30}}, {"id": "p", "type": "test.float", "params": {}})",
        std::string(R"(["p.value", "g.)") + drive + R"("])");
      constexpr int kTicks = 200;
      auto start = std::chrono::steady_clock::now();
      for(int i = 0; i < kTicks; ++i){
        g_float = 0.001f * static_cast<float>(i + 1);
        graph.tick(1.f / 60.f);
      }
      auto elapsed = std::chrono::steady_clock::now() - start;
      double micros = std::chrono::duration<double, std::micro>(elapsed).count() / kTicks;
      std::cout << "PERF " << type << " " << size.w << "x" << size.h << " " << micros << " us/tick\n";
    }
  }
}
