// G2a Tier 1 video nodes (Aurora-ra4o.4): per-node tests through the Graph.
// Wraps existing functions unchanged: grabFrameSubsample, rescale,
// dropAlpha, composeFrame.
#include <catch2/catch_test_macros.hpp>

#include <cstdint>
#include <memory>
#include <string>

#include <Aurora/Runtime/Graph/Graph.hpp>
#include <Aurora/Runtime/Graph/GraphLoader.hpp>
#include <Aurora/Runtime/Graph/NodeRegistry.hpp>
#include <Aurora/Runtime/Graph/VideoNodes.hpp>

using namespace Aurora::Contracts;
using namespace Aurora::Input;
using namespace Aurora::Runtime;
using namespace Aurora::Runtime::Graph;

namespace
{
  ImageData solidImage(int w, int h, PixelFormat format, const cv::Scalar& fill)
  {
    ImageData image;
    image.format = format;
    int type = (format == PixelFormat::RGBA || format == PixelFormat::BGRA) ? CV_8UC4 : CV_8UC3;
    image.imageMatrix = cv::Mat(h, w, type, fill);
    return image;
  }

  class FakeVideoInput : public IVideoInput
  {
  public:
    const std::string& name() const override
    {
      static const std::string s_name = "FakeVideo";
      return s_name;
    }

    Resolution displayResolution() const override { return {4, 2}; }
    RefreshRate displayRefreshRate() const override { return 60; }
    bool isHealthy() const override { return healthy; }
    std::uint64_t frameSerial() const override { return serial; }

    void grabFrameSubsample(ImageData& out) override
    {
      grabs++;
      out = frame;
    }

    ImageData frame = solidImage(4, 2, PixelFormat::RGB, cv::Scalar(255, 0, 0));
    bool healthy{true};
    std::uint64_t serial{1};
    int grabs{0};
  };

  class FakeHost : public IGraphHost
  {
  public:
    IVideoInput* videoInput() override { return video; }
    const ZoneMap* zoneMap(std::string_view name) override
    {
      auto it = maps.find(std::string(name));
      return it != maps.end() ? &it->second : nullptr;
    }

    IVideoInput* video{nullptr};
    std::unordered_map<std::string, ZoneMap> maps{};
  };

  ZoneMap singleZoneMap()
  {
    ZoneConfig zone;
    zone.zoneId = 1;
    zone.uvs = {{0.f, 0.f}, {1.f, 1.f}};
    zone.active = true;
    zone.everConfigured = true;
    return {zone};
  }

  NodeRegistry makeVideoRegistry()
  {
    NodeRegistry registry;
    registerVideoNodes(registry);
    return registry;
  }

  Aurora::Runtime::Graph::Graph requireGraph(const std::string& json, NodeRegistry& registry, FakeHost* host = nullptr)
  {
    (void)host;
    LoadResult result = loadGraphFromString(json, registry);
    REQUIRE(result.ok);
    return std::move(result.graph);
  }

  const ImagePtr& requireImage(const GraphValue* value)
  {
    REQUIRE(value != nullptr);
    const ImagePtr* ptr = std::get_if<ImagePtr>(value);
    REQUIRE(ptr != nullptr);
    REQUIRE(*ptr != nullptr);
    return *ptr;
  }
} // namespace

TEST_CASE("video.capture reuses the ImagePtr while the serial is unchanged", "[VideoNodes]")
{
  NodeRegistry registry = makeVideoRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(
    R"({"version": 1, "nodes": [{"id": "cap", "type": "video.capture", "params": {}}], "edges": []})",
    registry);

  FakeVideoInput input;
  FakeHost host;
  host.video = &input;

  graph.tick(1.f / 60.f, &host);
  const ImagePtr first = requireImage(graph.portValue("cap", "image"));
  CHECK(input.grabs == 1);

  graph.tick(1.f / 60.f, &host);
  const ImagePtr second = requireImage(graph.portValue("cap", "image"));
  CHECK(input.grabs == 2); // grab runs every tick (lazy rebuild lives there)
  CHECK(first.get() == second.get());

  input.serial = 2;
  graph.tick(1.f / 60.f, &host);
  const ImagePtr third = requireImage(graph.portValue("cap", "image"));
  CHECK(third.get() != first.get());
}

TEST_CASE("video.capture is Absent when unhealthy or empty, error without host", "[VideoNodes]")
{
  NodeRegistry registry = makeVideoRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(
    R"({"version": 1, "nodes": [{"id": "cap", "type": "video.capture", "params": {}}], "edges": []})",
    registry);

  FakeVideoInput input;
  FakeHost host;
  host.video = &input;

  input.healthy = false;
  graph.tick(1.f / 60.f, &host);
  REQUIRE(graph.portValue("cap", "image") != nullptr);
  CHECK(isAbsent(*graph.portValue("cap", "image")));

  input.healthy = true;
  input.frame = ImageData{};
  graph.tick(1.f / 60.f, &host);
  CHECK(isAbsent(*graph.portValue("cap", "image")));

  // No host at all: evaluator turns the throw into a GraphError naming cap.
  Aurora::Runtime::Graph::Graph noHost = requireGraph(
    R"({"version": 1, "nodes": [{"id": "cap", "type": "video.capture", "params": {}}], "edges": []})",
    registry);
  noHost.tick(1.f / 60.f, nullptr);
  const GraphValue* value = noHost.portValue("cap", "image");
  REQUIRE(value != nullptr);
  const GraphError* err = asError(*value);
  REQUIRE(err != nullptr);
  CHECK(err->nodeId == "cap");
}

TEST_CASE("image.rescale downscales, caches by identity, passthrough on 0/upscale", "[VideoNodes]")
{
  NodeRegistry registry = makeVideoRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(
    R"({"version": 1, "nodes": [
      {"id": "cap", "type": "video.capture", "params": {}},
      {"id": "small", "type": "image.rescale", "params": {"width": 2, "interpolation": "Area"}}
    ], "edges": [["cap.image", "small.image"]]})",
    registry);

  FakeVideoInput input;
  FakeHost host;
  host.video = &input;

  graph.tick(1.f / 60.f, &host);
  const ImagePtr first = requireImage(graph.portValue("small", "image"));
  CHECK(first->width() == 2);
  CHECK(first->height() == 1);

  // Same capture pointer (serial unchanged) -> same rescaled pointer.
  graph.tick(1.f / 60.f, &host);
  const ImagePtr second = requireImage(graph.portValue("small", "image"));
  CHECK(first.get() == second.get());

  // New frame -> rebuild.
  input.serial = 7;
  graph.tick(1.f / 60.f, &host);
  const ImagePtr third = requireImage(graph.portValue("small", "image"));
  CHECK(third->width() == 2);

  // Width 0 passes through: same pointer as capture.
  Aurora::Runtime::Graph::Graph pass = requireGraph(
    R"({"version": 1, "nodes": [
      {"id": "cap", "type": "video.capture", "params": {}},
      {"id": "small", "type": "image.rescale", "params": {}}
    ], "edges": [["cap.image", "small.image"]]})",
    registry);
  pass.tick(1.f / 60.f, &host);
  const ImagePtr capPtr = requireImage(pass.portValue("cap", "image"));
  const ImagePtr passPtr = requireImage(pass.portValue("small", "image"));
  CHECK(capPtr.get() == passPtr.get());
}

TEST_CASE("image.dropAlpha passes opaque images through, converts RGBA", "[VideoNodes]")
{
  NodeRegistry registry = makeVideoRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(
    R"({"version": 1, "nodes": [
      {"id": "cap", "type": "video.capture", "params": {}},
      {"id": "opaque", "type": "image.dropAlpha", "params": {}}
    ], "edges": [["cap.image", "opaque.image"]]})",
    registry);

  FakeVideoInput input;
  FakeHost host;
  host.video = &input;

  // RGB has no alpha: zero-copy passthrough preserves identity.
  graph.tick(1.f / 60.f, &host);
  CHECK(requireImage(graph.portValue("cap", "image")).get() == requireImage(graph.portValue("opaque", "image")).get());

  input.frame = solidImage(4, 2, PixelFormat::RGBA, cv::Scalar(1, 2, 3, 255));
  input.serial = 9;
  graph.tick(1.f / 60.f, &host);
  const ImagePtr converted = requireImage(graph.portValue("opaque", "image"));
  CHECK(converted->format == PixelFormat::RGB);
  CHECK(converted->width() == 4);
}

TEST_CASE("zones.sample reads the live zone map every tick", "[VideoNodes]")
{
  NodeRegistry registry = makeVideoRegistry();
  Aurora::Runtime::Graph::Graph graph = requireGraph(
    R"({"version": 1, "nodes": [
      {"id": "cap", "type": "video.capture", "params": {}},
      {"id": "zones", "type": "zones.sample", "params": {"output": "hue"}}
    ], "edges": [["cap.image", "zones.image"]]})",
    registry);

  FakeVideoInput input;
  FakeHost host;
  host.video = &input;
  host.maps["hue"] = singleZoneMap();

  graph.tick(1.f / 60.f, &host);
  const GraphValue* value = graph.portValue("zones", "frame");
  REQUIRE(value != nullptr);
  const Frame* frame = std::get_if<Frame>(value);
  REQUIRE(frame != nullptr);
  REQUIRE(frame->size() == 1);
  // RGB bytes (255,0,0) read as red by the format-aware mean.
  CHECK(frame->at(0).color == Color(255, 0, 0));

  // Live edit without reload: deactivating the zone empties the frame.
  host.maps["hue"][0].active = false;
  graph.tick(1.f / 60.f, &host);
  const Frame* after = std::get_if<Frame>(graph.portValue("zones", "frame"));
  REQUIRE(after != nullptr);
  CHECK(after->empty());
}

TEST_CASE("video chain capture -> rescale -> dropAlpha -> zones.sample", "[VideoNodes]")
{
  NodeRegistry registry = makeVideoRegistry();
  CHECK(registry.find("video.capture") != nullptr);
  CHECK(registry.find("image.rescale") != nullptr);
  CHECK(registry.find("image.dropAlpha") != nullptr);
  CHECK(registry.find("zones.sample") != nullptr);

  Aurora::Runtime::Graph::Graph graph = requireGraph(
    R"({"version": 1, "nodes": [
      {"id": "cap", "type": "video.capture", "params": {}},
      {"id": "small", "type": "image.rescale", "params": {"width": 2, "interpolation": "Area"}},
      {"id": "opaque", "type": "image.dropAlpha", "params": {}},
      {"id": "zones", "type": "zones.sample", "params": {"output": "hue"}}
    ], "edges": [
      ["cap.image", "small.image"],
      ["small.image", "opaque.image"],
      ["opaque.image", "zones.image"]
    ]})",
    registry);

  FakeVideoInput input;
  FakeHost host;
  host.video = &input;
  host.maps["hue"] = singleZoneMap();

  graph.tick(1.f / 60.f, &host);
  const Frame* frame = std::get_if<Frame>(graph.portValue("zones", "frame"));
  REQUIRE(frame != nullptr);
  REQUIRE(frame->size() == 1);
  CHECK(frame->at(0).color == Color(255, 0, 0));
}
