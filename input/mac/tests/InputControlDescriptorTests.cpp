#include <catch2/catch_test_macros.hpp>

#include <cstddef>
#include <string>

#include <Aurora/Input/Mac/InputControlDescriptors.hpp>

using namespace Aurora::Input::Mac;


TEST_CASE("macInputControlDescriptors covers the device UI with unique keys", "[Descriptors]")
{
  const auto descriptors = macInputControlDescriptors();

  // Video-only, unlike Linux's two entries -- no audio input on Mac tier 1.
  REQUIRE(descriptors.size() == 1);

  auto has = [&](const std::string& key, const std::string& kind){
    for(const auto& descriptor : descriptors){
      if(descriptor.key == key){
        CHECK(descriptor.kind == kind);
        return true;
      }
    }
    return false;
  };

  CHECK(has("input.monitor", "dropdown"));

  // Authored copy everywhere -- placeholders must not ship.
  for(const auto& descriptor : descriptors){
    CHECK_FALSE(descriptor.description.empty());
    CHECK(descriptor.description != "Test");
  }

  for(std::size_t i = 0; i < descriptors.size(); i++){
    CHECK(descriptors[i].key.rfind("input.", 0) == 0);
    for(std::size_t j = i + 1; j < descriptors.size(); j++){
      CHECK(descriptors[i].key != descriptors[j].key);
    }
  }
}
