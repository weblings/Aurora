#include <catch2/catch_test_macros.hpp>

#include <Aurora/Runtime/ControlDescriptors.hpp>
#include <Aurora/Runtime/ControlDescriptorTables.hpp>

#include <vector>

using namespace Aurora::Runtime;


TEST_CASE("DescriptorRegistry merges contributors in first-seen key order", "[Descriptors]")
{
  DescriptorRegistry registry;
  registry.add("video", {
    {"video.refreshRate", "dropdown", "Test"},
    {"video.interpolation", "dropdown", "Test"},
  });
  registry.add("audio", {
    {"audio.bounceSmoothTime", "slider", "Test"},
  });

  const auto& merged = registry.descriptors();
  REQUIRE(merged.size() == 3);
  CHECK(merged[0].key == "video.refreshRate");
  CHECK(merged[1].key == "video.interpolation");
  CHECK(merged[2].key == "audio.bounceSmoothTime");
  CHECK(registry.collisions().empty());
}


TEST_CASE("DescriptorRegistry last contribution wins and records the collision", "[Descriptors]")
{
  DescriptorRegistry registry;
  registry.add("video", {{"video.shared", "slider", "from-video"}});
  registry.add("app", {{"video.shared", "slider", "from-app"}});

  const auto& merged = registry.descriptors();
  REQUIRE(merged.size() == 1);
  CHECK(merged[0].description == "from-app"); // app shell aggregated last wins

  const auto& collisions = registry.collisions();
  REQUIRE(collisions.size() == 1);
  CHECK(collisions[0].key == "video.shared");
  CHECK(collisions[0].keptOwner == "video");
  CHECK(collisions[0].droppedOwner == "app");
}


TEST_CASE("DescriptorRegistry find returns null for undescribed keys", "[Descriptors]")
{
  DescriptorRegistry registry;
  registry.add("zones", {{"zones.active", "bool", "Test"}});

  const auto* found = registry.find("zones.active");
  REQUIRE(found != nullptr);
  CHECK(found->kind == "bool");

  // Absent keys (module compiled out, typo, old binary) must degrade to
  // no tooltip, never an error -- the frontend renders the control as-is.
  CHECK(registry.find("output.hue.missing") == nullptr);
  CHECK(registry.find("") == nullptr);
}


TEST_CASE("DescriptorRegistry toJson matches the frontend payload shape", "[Descriptors]")
{
  DescriptorRegistry registry;
  registry.add("zones", {
    {"zones.active", "bool", "Test"},
    {"zones.gamma", "slider", "Test"},
  });

  const auto json = registry.toJson();
  REQUIRE(json.contains("descriptors"));
  REQUIRE(json["descriptors"].size() == 2);
  CHECK(json["descriptors"][0]["key"] == "zones.active");
  CHECK(json["descriptors"][0]["kind"] == "bool");
  CHECK(json["descriptors"][0]["description"] == "Test");
  CHECK(json["descriptors"][1]["key"] == "zones.gamma");
}


TEST_CASE("Layer descriptor tables cover the inventoried controls with unique keys", "[Descriptors]")
{
  DescriptorRegistry registry;
  registry.add("video", videoControlDescriptors());
  registry.add("audio", audioControlDescriptors());
  registry.add("zones", zoneControlDescriptors());
  registry.add("app", appControlDescriptors());

  // 4 video + 12 audio + 4 zones + 1 app -- bump alongside the tables.
  REQUIRE(registry.descriptors().size() == 21);
  CHECK(registry.collisions().empty()); // no two layers claim one key

  // Spot-check every control family from TooltipsAnalysis.md's inventory.
  CHECK(registry.find("video.refreshRate") != nullptr);
  CHECK(registry.find("video.transitionSmoothing") != nullptr);
  CHECK(registry.find("audio.bounceSmoothTime") != nullptr);
  CHECK(registry.find("audio.fixedHueEnabled") != nullptr);
  CHECK(registry.find("audio.centroidRangeHz") != nullptr);
  CHECK(registry.find("zones.gamma") != nullptr);
  CHECK(registry.find("zones.select") != nullptr);
  CHECK(registry.find("zones.active") != nullptr);
  CHECK(registry.find("zones.autoArrange") != nullptr);
  CHECK(registry.find("app.mode") != nullptr);
}


TEST_CASE("Layer descriptor tables carry authored copy, never placeholders", "[Descriptors]")
{
  const std::vector<std::vector<ControlDescriptor>> tables = {
    videoControlDescriptors(),
    audioControlDescriptors(),
    zoneControlDescriptors(),
    appControlDescriptors(),
  };
  for(const auto& table : tables){
    for(const auto& descriptor : table){
      CHECK_FALSE(descriptor.description.empty());
      CHECK(descriptor.description != "Test"); // placeholder must not ship
    }
  }
}
