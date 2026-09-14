#include <catch2/catch_test_macros.hpp>

#include <cstring>
#include <vector>

#include <Aurora/Input/Linux/GamescopeNodeMatch.hpp>
#include <Aurora/Input/Linux/IRestoreTokenStore.hpp>
#include <Aurora/Input/Linux/PipewireFrameBuffer.hpp>

using namespace Aurora::Input::Linux;
using namespace Aurora::Contracts;


// Both helpers below have no Pipewire/GLib types in their signatures, so
// these tests build and run regardless of AURORA_INPUT_LINUX_ENABLE_PIPEWIRE.


TEST_CASE("matchesGamescopeNode requires both a Node interface and the exact name", "[PipewireGrabber][gamescope]")
{
  CHECK(matchesGamescopeNode(true, "gamescope"));
  CHECK_FALSE(matchesGamescopeNode(true, "not-gamescope"));
  CHECK_FALSE(matchesGamescopeNode(false, "gamescope"));
  CHECK_FALSE(matchesGamescopeNode(true, nullptr));
}


TEST_CASE("toOwnedImage tags dimensions and format correctly", "[PipewireGrabber][frame]")
{
  std::vector<uint8_t> buffer(4 * 4 * 4, 0x7F);
  ImageData image = toOwnedImage(buffer.data(), 4, 4, 0);

  REQUIRE(image.hasData());
  CHECK(image.width() == 4);
  CHECK(image.height() == 4);
  CHECK(image.format == PixelFormat::RGBA);
}


TEST_CASE("toOwnedImage clones rather than aliasing the source buffer", "[PipewireGrabber][frame]")
{
  // Mirrors real usage: Pipewire's buffer becomes invalid right after this
  // call returns, so the result must own independent memory.
  std::vector<uint8_t> buffer(2 * 2 * 4, 0x11);
  ImageData image = toOwnedImage(buffer.data(), 2, 2, 0);

  std::memset(buffer.data(), 0xFF, buffer.size());

  CHECK(image.imageMatrix.data[0] == 0x11);
}


TEST_CASE("toOwnedImage honors a padded stride wider than the tightly-packed row", "[PipewireGrabber][frame]")
{
  const int width = 2, height = 2;
  const size_t paddedStride = static_cast<size_t>(width) * 4 + 16;
  std::vector<uint8_t> buffer(paddedStride * height, 0);

  // Mark just the first pixel of row 1 so a wrong stride would read padding.
  buffer[paddedStride] = 0xAB;

  ImageData image = toOwnedImage(buffer.data(), width, height, paddedStride);

  REQUIRE(image.hasData());
  CHECK(image.imageMatrix.at<cv::Vec4b>(1, 0)[0] == 0xAB);
}


TEST_CASE("toOwnedImage tags whatever format was actually negotiated, not always RGBA", "[PipewireGrabber][frame]")
{
  std::vector<uint8_t> buffer(4 * 4 * 4, 0x7F);
  ImageData image = toOwnedImage(buffer.data(), 4, 4, 0, PixelFormat::BGRA);

  CHECK(image.format == PixelFormat::BGRA);
}


TEST_CASE("toOwnedImage returns an empty ImageData for degenerate input", "[PipewireGrabber][frame]")
{
  CHECK_FALSE(toOwnedImage(nullptr, 4, 4, 0).hasData());
  std::vector<uint8_t> buffer(16, 0);
  CHECK_FALSE(toOwnedImage(buffer.data(), 0, 4, 0).hasData());
  CHECK_FALSE(toOwnedImage(buffer.data(), 4, -1, 0).hasData());
}


TEST_CASE("NullRestoreTokenStore never persists", "[XdgDesktopPortal][restore-token]")
{
  NullRestoreTokenStore store;
  CHECK_FALSE(store.restoreToken().has_value());

  store.setRestoreToken("some-token");
  CHECK_FALSE(store.restoreToken().has_value());
}
