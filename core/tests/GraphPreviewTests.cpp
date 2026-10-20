// Draft previews (Aurora-52oz.6): sinks stand in for outputs, errors show per zone.
#include <catch2/catch_test_macros.hpp>

#include <memory>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include <Aurora/Output/IOutput.hpp>
#include <Aurora/Runtime/Graph/AllNodes.hpp>
#include <Aurora/Runtime/GraphPreview.hpp>

using namespace Aurora::Runtime;
using namespace Aurora::Runtime::Graph;
using Aurora::Contracts::Color;
using Aurora::Contracts::Frame;

namespace
{
  class FrameSourceNode : public INode
  {
  public:
    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(const EvalContext&, float, std::unordered_map<std::string, GraphValue>& outputs) override
    {
      outputs.emplace("frame", Frame{{1, Color(255, 0, 0)}, {2, Color(0, 0, 255)}});
    }

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"frame", PortType::Frame, false}};
  };

  class FrameFailNode : public INode
  {
  public:
    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(const EvalContext& ctx, float, std::unordered_map<std::string, GraphValue>& outputs) override
    {
      outputs.emplace("frame", GraphError{ctx.nodeId, "test failure"});
    }

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"frame", PortType::Frame, false}};
  };

  class FrameAbsentNode : public INode
  {
  public:
    const std::vector<PortDecl>& inputPorts() const override { return m_in; }
    const std::vector<PortDecl>& outputPorts() const override { return m_out; }
    void evaluate(const EvalContext&, float, std::unordered_map<std::string, GraphValue>& outputs) override
    {
      outputs.emplace("frame", Absent{});
    }

  private:
    std::vector<PortDecl> m_in{};
    std::vector<PortDecl> m_out{{"frame", PortType::Frame, false}};
  };

  template<typename Node>
  void addFrameSource(NodeRegistry& registry, const std::string& type)
  {
    NodeTypeInfo info;
    info.meta = NodeTypeMeta{"test frame source", "test-only", "{}", "cheap"};
    info.outputs = {{"frame", PortType::Frame, false}};
    info.factory = []{ return std::make_unique<Node>(); };
    REQUIRE(registry.registerType(type, std::move(info)));
  }

  NodeRegistry makeRegistry()
  {
    NodeRegistry registry;
    registerAllNodes(registry, true);
    addFrameSource<FrameSourceNode>(registry, "test.frame");
    addFrameSource<FrameFailNode>(registry, "test.fail");
    addFrameSource<FrameAbsentNode>(registry, "test.absent");
    return registry;
  }

  nlohmann::json sendGraph(const std::string& sourceType)
  {
    return {
      {"version", 1},
      {"nodes", {
        {{"id", "src"}, {"type", sourceType}, {"params", nlohmann::json::object()}},
        {{"id", "send"}, {"type", "output.send"}, {"params", {{"output", "hue"}}}}}},
      {"edges", nlohmann::json::array({nlohmann::json::array({"src.frame", "send.frame"})})}};
  }

  class LiveOutput : public Aurora::Output::IOutput
  {
  public:
    const std::string& name() const override { return m_name; }
    void init() override {}
    bool isConnected() const override { return true; }
    void shutdown(bool) override {}
    std::vector<std::uint8_t> zoneIds() const override { return {1, 2, 3}; }
    void send(const Frame&) override { ++sends; }

    int sends{0};

  private:
    std::string m_name{"hue"};
  };

  class LiveHost : public IGraphHost
  {
  public:
    Aurora::Output::IOutput* output(std::string_view name) override { return name == "hue" ? &live : nullptr; }

    LiveOutput live;
  };

  const std::unordered_set<std::string> kOutputs{"hue"};
}


TEST_CASE("A preview collects each output's zone colors and never sends to the output (Aurora-52oz.6)", "[GraphPreview]")
{
  NodeRegistry registry = makeRegistry();
  std::string error;
  auto preview = GraphPreview::create(sendGraph("test.frame"), registry, kOutputs, error);
  INFO(error);
  REQUIRE(preview);

  LiveHost host;
  for(int i = 0; i < 5; ++i){
    preview->tick(1.f / 60.f, host);
  }

  CHECK(host.live.sends == 0);
  const auto snapshot = preview->snapshot();
  REQUIRE(snapshot.outputs.size() == 1);
  CHECK(snapshot.outputs[0].output == "hue");
  REQUIRE(snapshot.outputs[0].zones.size() == 2);
  CHECK(snapshot.outputs[0].zones[0].id == 1);
  CHECK(snapshot.outputs[0].zones[0].r == 1.f);
  CHECK(snapshot.outputs[0].zones[1].b == 1.f);
  CHECK_FALSE(snapshot.outputs[0].zones[0].error);
  CHECK(snapshot.errors.empty());
  // Cost of the extra evaluation, for the log.
  INFO("preview tick cost " << snapshot.tickMs << " ms");
  CHECK(snapshot.tickMs >= 0.0);
}


TEST_CASE("A failing node turns the output's zones magenta and flagged (Aurora-52oz.6)", "[GraphPreview]")
{
  NodeRegistry registry = makeRegistry();
  std::string error;
  auto preview = GraphPreview::create(sendGraph("test.fail"), registry, kOutputs, error);
  INFO(error);
  REQUIRE(preview);

  LiveHost host;
  preview->tick(1.f / 60.f, host);

  CHECK(host.live.sends == 0);
  const auto snapshot = preview->snapshot();
  REQUIRE(snapshot.outputs.size() == 1);
  REQUIRE(snapshot.outputs[0].zones.size() == 3); // the live output's zone ids
  for(const auto& zone : snapshot.outputs[0].zones){
    CHECK(zone.error);
    CHECK(zone.r == 1.f);
    CHECK(zone.g == 0.f);
    CHECK(zone.b == 1.f);
  }
  REQUIRE(snapshot.errors.size() == 1);
  CHECK(snapshot.errors[0].output == "hue");
  CHECK(snapshot.errors[0].node == "src");
  CHECK(snapshot.errors[0].message == "test failure");
}


TEST_CASE("An absent value keeps the previous colors and reload swaps the graph (Aurora-52oz.6)", "[GraphPreview]")
{
  NodeRegistry registry = makeRegistry();
  std::string error;
  auto preview = GraphPreview::create(sendGraph("test.frame"), registry, kOutputs, error);
  INFO(error);
  REQUIRE(preview);
  LiveHost host;
  preview->tick(1.f / 60.f, host);

  REQUIRE(preview->reload(sendGraph("test.absent"), registry, kOutputs, error));
  preview->tick(1.f / 60.f, host);
  auto snapshot = preview->snapshot();
  REQUIRE(snapshot.outputs.size() == 1);
  CHECK(snapshot.outputs[0].zones.size() == 2);
  CHECK_FALSE(snapshot.outputs[0].zones[0].error);

  // The error path replaces them, and a bad reload leaves the preview alone.
  REQUIRE(preview->reload(sendGraph("test.fail"), registry, kOutputs, error));
  preview->tick(1.f / 60.f, host);
  CHECK(preview->snapshot().outputs[0].zones[0].error);

  nlohmann::json broken = sendGraph("test.frame");
  broken["edges"] = nlohmann::json::array();
  CHECK_FALSE(preview->reload(broken, registry, kOutputs, error));
  CHECK_FALSE(error.empty());
  preview->tick(1.f / 60.f, host);
  CHECK(preview->snapshot().outputs[0].zones[0].error);
}


TEST_CASE("A graph that fails to load makes no preview (Aurora-52oz.6)", "[GraphPreview]")
{
  NodeRegistry registry = makeRegistry();
  std::string error;
  nlohmann::json doc = sendGraph("test.frame");
  doc["nodes"][1]["params"]["output"] = "nowhere";
  CHECK(GraphPreview::create(doc, registry, kOutputs, error) == nullptr);
  CHECK_FALSE(error.empty());
}
