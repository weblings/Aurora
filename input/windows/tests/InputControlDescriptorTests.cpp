#include <catch2/catch_test_macros.hpp>

#include <cstddef>
#include <string>

#include <Aurora/Input/Windows/InputControlDescriptors.hpp>

using namespace Aurora::Input::Windows;


TEST_CASE("windowsInputControlDescriptors covers the device UI with unique keys", "[Descriptors]")
{
  const auto descriptors = windowsInputControlDescriptors();

  // Monitor picker only -- Windows audio has no sink field to describe.
  REQUIRE(descriptors.size() == 1);
  CHECK(descriptors[0].key == "input.monitor");
  CHECK(descriptors[0].kind == "dropdown");
  CHECK_FALSE(descriptors[0].description.empty());
  CHECK(descriptors[0].description != "Test"); // placeholder must not ship
}
