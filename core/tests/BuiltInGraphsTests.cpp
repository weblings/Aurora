// G2d built-in graphs (Aurora-ra4o.7): doc shape, ConfigData overlay, load.
// The byte-parity gate itself lives in VideoParityTests/AudioParityTests.
#include <catch2/catch_test_macros.hpp>

#include <algorithm>
#include <string>

#include <Aurora/Runtime/Graph/BuiltInGraphs.hpp>
#include <Aurora/Runtime/Graph/FrameNodes.hpp>
#include <Aurora/Runtime/Graph/VideoNodes.hpp>

using namespace Aurora::Runtime;
using namespace Aurora::Runtime::Graph;

namespace
{
  const nlohmann::json& nodeById(const nlohmann::json& doc, const std::string& id)
  {
    for(const auto& node : doc.at("nodes")){
      if(node.at("id") == id){
        return node;
      }
    }
    FAIL("no node '" << id << "'");
    return doc;
  }

  NodeRegistry videoRegistry()
  {
    NodeRegistry registry;
    registerVideoNodes(registry);
    registerFrameNodes(registry);
    return registry;
  }
}

TEST_CASE("per-output node ids avoid characters that break edge syntax", "[BuiltInGraphs]")
{
  CHECK(perOutputNodeId("zones", "hue") == "zones_hue");
  CHECK(perOutputNodeId("send", "home.assistant") == "send_home_assistant");
}

TEST_CASE("built-in Video graph overlays ConfigData and loads", "[BuiltInGraphs]")
{
  ConfigData config;
  config.subsampleWidth = 96;
  config.interpolation = Aurora::Contracts::Interpolation::Type::Cubic;
  config.transitionSmoothing = 0.4f;

  NodeRegistry registry = videoRegistry();
  const std::vector<std::string> outputs{"hue", "ha.light"};
  LoadResult loaded = loadBuiltInVideoGraph(registry, outputs, config);
  INFO(loaded.error);
  REQUIRE(loaded.ok);
  // cap, rescale, opaque + zones/ease/send per output.
  CHECK(loaded.graph.nodeCount() == 3 + 3 * outputs.size());
  CHECK_FALSE(loaded.graph.tickHz().has_value());

  nlohmann::json doc = builtInVideoGraph(outputs, videoOverlayFromConfig(config, outputs));
  CHECK(nodeById(doc, "rescale").at("params").at("width") == 96.f);
  CHECK(nodeById(doc, "rescale").at("params").at("interpolation") == "Cubic");
  CHECK(nodeById(doc, "ease_hue").at("params").at("smoothing") == 0.4f);
  CHECK(nodeById(doc, "ease_ha_light").at("params").at("output") == "ha.light");
}

TEST_CASE("built-in Video graph rejects an unknown output", "[BuiltInGraphs]")
{
  NodeRegistry registry = videoRegistry();
  nlohmann::json doc = builtInVideoGraph({"ghost"});
  LoadOptions options;
  options.knownOutputs = {"hue"};
  LoadResult loaded = loadGraph(doc, registry, options);
  CHECK_FALSE(loaded.ok);
  CHECK(loaded.error.find("ghost") != std::string::npos);
}

TEST_CASE("overlay entries for missing nodes or params are ignored", "[BuiltInGraphs]")
{
  NodeRegistry registry = videoRegistry();
  ParamOverlay overlay;
  overlay["nope"]["width"] = 5.f;
  overlay["rescale"]["nope"] = 5.f;
  nlohmann::json doc = builtInVideoGraph({"hue"}, overlay);
  LoadOptions options;
  options.knownOutputs = {"hue"};
  CHECK(loadGraph(doc, registry, options).ok);
}

TEST_CASE("reloading the Video graph with a new overlay keeps node state", "[BuiltInGraphs]")
{
  // Tuning edit path: rebuild with new ConfigData, load, adoptStateFrom.
  NodeRegistry registry = videoRegistry();
  ConfigData config;
  LoadResult first = loadBuiltInVideoGraph(registry, {"hue"}, config);
  REQUIRE(first.ok);

  config.transitionSmoothing = 0.6f;
  LoadResult second = loadBuiltInVideoGraph(registry, {"hue"}, config);
  REQUIRE(second.ok);
  second.graph.adoptStateFrom(first.graph);
  CHECK(second.graph.evalOrder() == first.graph.evalOrder());
}

TEST_CASE("built-in Audio graph doc declares 60Hz and overlays ConfigData", "[BuiltInGraphs]")
{
  ConfigData config;
  config.audioFixedAnchorHue = 120.f;
  config.audioBounceSmoothTime = 0.5f;
  config.audioCentroidRangeHz = 3000.f;

  nlohmann::json doc = builtInAudioGraph({"hue"}, audioOverlayFromConfig(config));
  CHECK(doc.at("tickHz") == 60);
  CHECK(nodeById(doc, "drift").at("params").at("fixedAnchorHue") == 120.f);
  CHECK(nodeById(doc, "beat").at("params").at("fixedAnchorHue") == 120.f);
  CHECK(nodeById(doc, "beat").at("params").at("bounceSmoothTime") == 0.5f);
  CHECK(nodeById(doc, "drift").at("params").at("centroidRangeHz") == 3000.f);
  CHECK(nodeById(doc, "all_hue").at("params").at("output") == "hue");

  // Config's default (negative) anchor means random, spelled null.
  ConfigData unset;
  nlohmann::json randomDoc = builtInAudioGraph({"hue"}, audioOverlayFromConfig(unset));
  CHECK(nodeById(randomDoc, "drift").at("params").at("fixedAnchorHue").is_null());
}
