#include <catch2/catch_test_macros.hpp>

#include <cstddef>
#include <string>

#include <Aurora/Input/Linux/InputControlDescriptors.hpp>

using namespace Aurora::Input::Linux;


TEST_CASE("linuxInputControlDescriptors covers the device UI with unique keys", "[Descriptors]")
{
  const auto descriptors = linuxInputControlDescriptors();

  REQUIRE(descriptors.size() == 2);

  auto has = [&](const std::string& key, const std::string& kind){
    for(const auto& descriptor : descriptors){
      if(descriptor.key == key){
        CHECK(descriptor.kind == kind);
        return true;
      }
    }
    return false;
  };

  // Monitor picker (video) + PipeWire sink field (audio).
  CHECK(has("input.monitor", "dropdown"));
  CHECK(has("input.sink", "text"));

  for(std::size_t i = 0; i < descriptors.size(); i++){
    CHECK(descriptors[i].key.rfind("input.", 0) == 0);
    for(std::size_t j = i + 1; j < descriptors.size(); j++){
      CHECK(descriptors[i].key != descriptors[j].key);
    }
  }
}
