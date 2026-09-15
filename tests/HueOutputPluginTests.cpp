#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>

#include <Aurora/Output/Hue/HueOutput.hpp>

using namespace Aurora::Contracts;
using namespace Aurora::Output::Hue;


TEST_CASE("toChannelStream converts RGB to normalized, gamma-corrected RGB", "[HueOutput]")
{
  Zone zone{5, Color(255, 255, 255), 0.f};
  ChannelStream stream = toChannelStream(zone);

  CHECK(stream.id == 5);
  // White, gamma 0 (exponent 2^0 == 1, a no-op): full-scale RGB straight through.
  CHECK(stream.r == Catch::Approx(1.f));
  CHECK(stream.g == Catch::Approx(1.f));
  CHECK(stream.b == Catch::Approx(1.f));
}


TEST_CASE("toChannelStream applies gamma to all three RGB channels equally", "[HueOutput]")
{
  Zone flat{1, Color(128, 128, 128), 0.f};
  Zone gammaCorrected{1, Color(128, 128, 128), 1.f};

  ChannelStream flatStream = toChannelStream(flat);
  ChannelStream correctedStream = toChannelStream(gammaCorrected);

  // A gray input stays gray out -- gamma moves r/g/b together (huenicorn's
  // RGB-mode behavior), not just one component (the old XYB-mode bug).
  CHECK(flatStream.r == Catch::Approx(flatStream.g));
  CHECK(flatStream.g == Catch::Approx(flatStream.b));
  CHECK(correctedStream.r == Catch::Approx(correctedStream.g));
  CHECK(correctedStream.g == Catch::Approx(correctedStream.b));
  CHECK(flatStream.r != Catch::Approx(correctedStream.r));
}


TEST_CASE("justDeactivatedZoneIds finds ids that dropped out of the current set", "[HueOutput]")
{
  std::vector<uint8_t> current{1, 3};
  std::unordered_set<uint8_t> previous{1, 2, 3};

  auto dropped = justDeactivatedZoneIds(current, previous);

  REQUIRE(dropped.size() == 1);
  CHECK(dropped[0] == 2);
}


TEST_CASE("justDeactivatedZoneIds returns nothing when nothing dropped out", "[HueOutput]")
{
  std::vector<uint8_t> current{1, 2};
  std::unordered_set<uint8_t> previous{1, 2};

  CHECK(justDeactivatedZoneIds(current, previous).empty());
}


TEST_CASE("HueOutput reports its name and starts unconnected", "[HueOutput]")
{
  HueOutput output(Credentials("user", "0a1b2c3d"), "192.0.2.1");

  CHECK(output.name() == "hue");
  CHECK_FALSE(output.isConnected());
  CHECK(output.zoneIds().empty()); // not init()'d -- no live bridge in this test
}
