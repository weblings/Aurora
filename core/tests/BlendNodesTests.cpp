// Tier 2 frame and image blend nodes (Aurora-id8j.6): per-node cases through the Graph.
#include <catch2/catch_test_macros.hpp>

#include <memory>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <Aurora/Runtime/Graph/BlendNodes.hpp>
#include <Aurora/Runtime/Graph/Graph.hpp>
#include <Aurora/Runtime/Graph/GraphLoader.hpp>

using Aurora::Contracts::Color;
using Aurora::Contracts::Frame;
using Aurora::Contracts::ImageData;
using Aurora::Contracts::PixelFormat;
using namespace Aurora::Runtime::Graph;

namespace
{
  GraphValue g_frameA = Frame{};
  GraphValue g_frameB = Frame{};
  GraphValue g_imageA = ImagePtr{};
  GraphValue g_imageB = ImagePtr{};
  GraphValue g_color = Color{};
  GraphValue g_float = 0.f;

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
    registerBlendNodes(registry);
    addSource(registry, "test.frameA", &g_frameA, PortType::Frame);
    addSource(registry, "test.frameB", &g_frameB, PortType::Frame);
    addSource(registry, "test.imageA", &g_imageA, PortType::Image);
    addSource(registry, "test.imageB", &g_imageB, PortType::Image);
    addSource(registry, "test.color", &g_color, PortType::Color);
    addSource(registry, "test.float", &g_float, PortType::Float);
    return registry;
  }

  struct Feed
  {
    std::string sourceType;
    std::string id;
    std::string inPort;
  };

  Graph load(const std::string& type, const std::string& params, const std::vector<Feed>& feeds)
  {
    NodeRegistry registry = makeRegistry();
    std::string nodes;
    std::string edges;
    for(const auto& feed : feeds){
      nodes += R"({"id": ")" + feed.id + R"(", "type": ")" + feed.sourceType + R"(", "params": {}},)";
      edges += std::string(edges.empty() ? "" : ", ") + R"([")" + feed.id + R"(.value", "m.)" +
        feed.inPort + R"("])";
    }
    LoadResult loaded = loadGraphFromString(
      R"({"version": 1, "nodes": [)" + nodes + R"({"id": "m", "type": ")" + type + R"(", "params": )" +
        params + R"(}], "edges": [)" + edges + "]}",
      registry);
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

  Frame outFrame(Graph& graph)
  {
    const Frame* frame = std::get_if<Frame>(&out(graph, "frame"));
    REQUIRE(frame != nullptr);
    return *frame;
  }

  ImagePtr makeImage(int w, int h, PixelFormat format, cv::Scalar fill)
  {
    int type = (format == PixelFormat::RGBA || format == PixelFormat::BGRA) ? CV_8UC4 : CV_8UC3;
    auto image = std::make_shared<ImageData>();
    image->format = format;
    image->imageMatrix = cv::Mat(h, w, type, fill);
    return image;
  }

  const Feed kA{"test.frameA", "a", "a"};
  const Feed kB{"test.frameB", "b", "b"};
  const Feed kFrame{"test.frameA", "f", "frame"};
  const Feed kImgA{"test.imageA", "ia", "a"};
  const Feed kImgB{"test.imageB", "ib", "b"};

  // Colors chosen so every mode gives a distinct, hand-checkable result.
  // a = (200, 100, 0), b = (100, 200, 255)
  Frame mixSetup()
  {
    g_frameA = Frame{{1, Color(200, 100, 0), 0.5f}};
    g_frameB = Frame{{1, Color(100, 200, 255), 0.f}};
    return {};
  }

  Color mixResult(const std::string& mode, float t)
  {
    mixSetup();
    Graph graph = load("frame.mix", R"({"mode": ")" + mode + R"(", "t": )" + std::to_string(t) + "}", {kA, kB});
    graph.tick(1.f / 60.f);
    Frame frame = outFrame(graph);
    REQUIRE(frame.size() == 1);
    return frame[0].color;
  }

  void checkColor(const Color& got, int r, int g, int b)
  {
    CHECK(static_cast<int>(got.m_r) == r);
    CHECK(static_cast<int>(got.m_g) == g);
    CHECK(static_cast<int>(got.m_b) == b);
  }
}

TEST_CASE("frame.mix normal replaces a with b at t=1 and returns a at t=0", "[BlendNodes]")
{
  checkColor(mixResult("normal", 1.f), 100, 200, 255);
  checkColor(mixResult("normal", 0.f), 200, 100, 0);
  checkColor(mixResult("normal", 0.5f), 150, 150, 128);
}

TEST_CASE("frame.mix add clamps at white", "[BlendNodes]")
{
  checkColor(mixResult("add", 1.f), 255, 255, 255);
  checkColor(mixResult("add", 0.f), 200, 100, 0);
}

TEST_CASE("frame.mix multiply scales channels together", "[BlendNodes]")
{
  // 200*100/255 = 78.4, 100*200/255 = 78.4, 0
  checkColor(mixResult("multiply", 1.f), 78, 78, 0);
}

TEST_CASE("frame.mix screen lightens", "[BlendNodes]")
{
  // 255 - (55*155)/255 = 221.6, 255 - (155*55)/255 = 221.6, 255 - 255*0 = 255
  checkColor(mixResult("screen", 1.f), 222, 222, 255);
}

TEST_CASE("frame.mix difference is the absolute channel gap", "[BlendNodes]")
{
  checkColor(mixResult("difference", 1.f), 100, 100, 255);
  checkColor(mixResult("difference", 0.5f), 150, 100, 128);
}

TEST_CASE("frame.mix keeps a's gamma", "[BlendNodes]")
{
  mixSetup();
  Graph graph = load("frame.mix", R"({"mode": "normal", "t": 1})", {kA, kB});
  graph.tick(1.f / 60.f);
  CHECK(outFrame(graph)[0].gamma == 0.5f);
}

TEST_CASE("frame.mix with mismatched zone sets keeps a's zones and drops b-only zones", "[BlendNodes]")
{
  g_frameA = Frame{{1, Color(200, 0, 0), 0.f}, {2, Color(0, 200, 0), 0.f}};
  g_frameB = Frame{{2, Color(0, 0, 200), 0.f}, {9, Color(255, 255, 255), 0.f}};
  Graph graph = load("frame.mix", R"({"mode": "normal", "t": 1})", {kA, kB});
  graph.tick(1.f / 60.f);
  Frame frame = outFrame(graph);
  REQUIRE(frame.size() == 2);
  CHECK(frame[0].id == 1);
  checkColor(frame[0].color, 200, 0, 0); // missing from b: unchanged
  CHECK(frame[1].id == 2);
  checkColor(frame[1].color, 0, 0, 200);
}

TEST_CASE("frame.mix takes t from the input and clamps it", "[BlendNodes]")
{
  mixSetup();
  g_float = 9.f;
  Graph graph = load("frame.mix", R"({"mode": "normal"})", {kA, kB, {"test.float", "t", "t"}});
  graph.tick(1.f / 60.f);
  checkColor(outFrame(graph)[0].color, 100, 200, 255);
}

TEST_CASE("frame.brightnessScale scales and clamps, keeping id and gamma", "[BlendNodes]")
{
  g_frameA = Frame{{4, Color(100, 200, 50), 0.3f}};
  Graph half = load("frame.brightnessScale", R"({"factor": 0.5})", {kFrame});
  half.tick(1.f / 60.f);
  Frame frame = outFrame(half);
  CHECK(frame[0].id == 4);
  CHECK(frame[0].gamma == 0.3f);
  checkColor(frame[0].color, 50, 100, 25);

  Graph boost = load("frame.brightnessScale", R"({"factor": 4})", {kFrame});
  boost.tick(1.f / 60.f);
  checkColor(outFrame(boost)[0].color, 255, 255, 200);
}

TEST_CASE("frame.saturation 0 gives grey and 1 is identity", "[BlendNodes]")
{
  g_frameA = Frame{{1, Color(255, 0, 0), 0.f}};
  Graph grey = load("frame.saturation", R"({"amount": 0})", {kFrame});
  grey.tick(1.f / 60.f);
  Color c = outFrame(grey)[0].color;
  CHECK(c.m_r == c.m_g);
  CHECK(c.m_g == c.m_b);
  CHECK(static_cast<int>(c.m_r) == 77); // 0.3 * 255 = 76.5, rounds up

  Graph same = load("frame.saturation", R"({"amount": 1})", {kFrame});
  same.tick(1.f / 60.f);
  checkColor(outFrame(same)[0].color, 255, 0, 0);
}

TEST_CASE("frame.hueShift rotates each zone", "[BlendNodes]")
{
  g_frameA = Frame{{1, Color(255, 0, 0), 0.f}, {2, Color(0, 255, 0), 0.f}};
  Graph graph = load("frame.hueShift", R"({"degrees": 120})", {kFrame});
  graph.tick(1.f / 60.f);
  Frame frame = outFrame(graph);
  checkColor(frame[0].color, 0, 255, 0);
  checkColor(frame[1].color, 0, 0, 255);
}

TEST_CASE("frame.tint multiplies by the tint color scaled by amount", "[BlendNodes]")
{
  g_frameA = Frame{{1, Color(200, 200, 200), 0.f}};
  g_color = Color(255, 0, 0);
  Feed tint{"test.color", "c", "color"};

  Graph full = load("frame.tint", R"({"amount": 1})", {kFrame, tint});
  full.tick(1.f / 60.f);
  checkColor(outFrame(full)[0].color, 200, 0, 0);

  Graph none = load("frame.tint", R"({"amount": 0})", {kFrame, tint});
  none.tick(1.f / 60.f);
  checkColor(outFrame(none)[0].color, 200, 200, 200);

  Graph half = load("frame.tint", R"({"amount": 0.5})", {kFrame, tint});
  half.tick(1.f / 60.f);
  checkColor(outFrame(half)[0].color, 200, 100, 100);
}

TEST_CASE("frame ops pass an empty frame through", "[BlendNodes]")
{
  g_frameA = Frame{};
  Graph graph = load("frame.hueShift", R"({"degrees": 90})", {kFrame});
  graph.tick(1.f / 60.f);
  CHECK(outFrame(graph).empty());
}

namespace
{
  const ImageData& outImage(Graph& graph)
  {
    const ImagePtr* image = std::get_if<ImagePtr>(&out(graph, "image"));
    REQUIRE(image != nullptr);
    REQUIRE(*image != nullptr);
    return **image;
  }

  cv::Vec3b pixel(const ImageData& image, int row = 0, int col = 0)
  {
    return image.imageMatrix.at<cv::Vec3b>(row, col);
  }
}

TEST_CASE("image.mix applies each blend mode per pixel", "[BlendNodes]")
{
  g_imageA = makeImage(2, 2, PixelFormat::RGB, cv::Scalar(200, 100, 0));
  g_imageB = makeImage(2, 2, PixelFormat::RGB, cv::Scalar(100, 200, 255));
  for(auto [mode, r, g, b] : std::vector<std::tuple<std::string, int, int, int>>{
        {"normal", 100, 200, 255},
        {"add", 255, 255, 255},
        {"multiply", 78, 78, 0},
        {"screen", 222, 222, 255},
        {"difference", 100, 100, 255}}){
    INFO(mode);
    Graph graph = load("image.mix", R"({"mode": ")" + mode + R"(", "t": 1})", {kImgA, kImgB});
    graph.tick(1.f / 60.f);
    const ImageData& image = outImage(graph);
    CHECK(image.format == PixelFormat::RGB);
    CHECK(pixel(image, 1, 1) == cv::Vec3b(r, g, b));
  }
}

TEST_CASE("image.mix t=0 returns a and does not modify the inputs", "[BlendNodes]")
{
  ImagePtr a = makeImage(2, 2, PixelFormat::RGB, cv::Scalar(10, 20, 30));
  g_imageA = a;
  g_imageB = makeImage(2, 2, PixelFormat::RGB, cv::Scalar(200, 200, 200));
  Graph graph = load("image.mix", R"({"mode": "add", "t": 0})", {kImgA, kImgB});
  graph.tick(1.f / 60.f);
  CHECK(pixel(outImage(graph)) == cv::Vec3b(10, 20, 30));

  Graph full = load("image.mix", R"({"mode": "add", "t": 1})", {kImgA, kImgB});
  full.tick(1.f / 60.f);
  CHECK(pixel(outImage(full)) == cv::Vec3b(210, 220, 230));
  CHECK(pixel(*a) == cv::Vec3b(10, 20, 30));
}

TEST_CASE("image.mix converts b to a's pixel format", "[BlendNodes]")
{
  g_imageA = makeImage(1, 1, PixelFormat::RGB, cv::Scalar(0, 0, 0));
  g_imageB = makeImage(1, 1, PixelFormat::BGR, cv::Scalar(255, 0, 0)); // blue in BGR
  Graph graph = load("image.mix", R"({"mode": "normal", "t": 1})", {kImgA, kImgB});
  graph.tick(1.f / 60.f);
  CHECK(pixel(outImage(graph)) == cv::Vec3b(0, 0, 255)); // blue in RGB
}

TEST_CASE("image.mix leaves a's alpha alone", "[BlendNodes]")
{
  g_imageA = makeImage(1, 1, PixelFormat::RGBA, cv::Scalar(0, 0, 0, 77));
  g_imageB = makeImage(1, 1, PixelFormat::RGB, cv::Scalar(255, 255, 255));
  Graph graph = load("image.mix", R"({"mode": "normal", "t": 1})", {kImgA, kImgB});
  graph.tick(1.f / 60.f);
  const ImageData& image = outImage(graph);
  CHECK(image.format == PixelFormat::RGBA);
  CHECK(image.imageMatrix.at<cv::Vec4b>(0, 0) == cv::Vec4b(255, 255, 255, 77));
}

TEST_CASE("image.mix fails the node when sizes differ", "[BlendNodes]")
{
  g_imageA = makeImage(2, 2, PixelFormat::RGB, cv::Scalar(0, 0, 0));
  g_imageB = makeImage(3, 2, PixelFormat::RGB, cv::Scalar(0, 0, 0));
  Graph graph = load("image.mix", "{}", {kImgA, kImgB});
  graph.tick(1.f / 60.f);
  CHECK(asError(out(graph, "image")) != nullptr);
}
