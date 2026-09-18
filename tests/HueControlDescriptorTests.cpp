#include <catch2/catch_test_macros.hpp>

#include <cstddef>
#include <string>

#include <Aurora/Output/Hue/HueControlDescriptors.hpp>

using namespace Aurora::Output::Hue;


TEST_CASE("hueControlDescriptors covers the pairing UI with unique keys", "[Descriptors]")
{
  const auto descriptors = hueControlDescriptors();

  REQUIRE(descriptors.size() == 4);

  auto has = [&](const std::string& key, const std::string& kind){
    for(const auto& descriptor : descriptors){
      if(descriptor.key == key){
        CHECK(descriptor.kind == kind);
        return true;
      }
    }
    return false;
  };

  // Every control from TooltipsAnalysis.md's Hue inventory.
  CHECK(has("output.hue.bridgeAddress", "text"));
  CHECK(has("output.hue.autodetect", "button"));
  CHECK(has("output.hue.changeBridge", "button"));
  CHECK(has("output.hue.entertainmentConfig", "dropdown"));

  // Unique keys, all under this plugin's namespace, with authored copy.
  for(std::size_t i = 0; i < descriptors.size(); i++){
    CHECK(descriptors[i].key.rfind("output.hue.", 0) == 0);
    CHECK_FALSE(descriptors[i].description.empty());
    CHECK(descriptors[i].description != "Test"); // placeholder must not ship
    for(std::size_t j = i + 1; j < descriptors.size(); j++){
      CHECK(descriptors[i].key != descriptors[j].key);
    }
  }
}
