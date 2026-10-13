#include <catch2/catch_test_macros.hpp>

#include <cmath>
#include <limits>

#include <Aurora/Input/Windows/ScRgbConversion.hpp>

using Aurora::Input::Windows::scRgbToSrgb8;


namespace
{
  double srgbToLinear(int value)
  {
    const double v = value / 255.0;
    return v <= 0.04045 ? v / 12.92 : std::pow((v + 0.055) / 1.055, 2.4);
  }

  cv::Vec4b convertOne(cv::Vec4f pixel, float sdrWhiteScale)
  {
    cv::Mat single(1, 1, CV_32FC4, pixel);
    cv::Mat half;
    single.convertTo(half, CV_16FC4);
    return scRgbToSrgb8(half, sdrWhiteScale).at<cv::Vec4b>(0, 0);
  }
}


TEST_CASE("scRgbToSrgb8 round-trips sRGB greys at 80-nit white", "[ScRgbConversion]")
{
  for(int grey : {0, 1, 10, 64, 128, 192, 254, 255}){
    const float linear = static_cast<float>(srgbToLinear(grey));
    auto out = convertOne({linear, linear, linear, 1.0f}, 1.0f);
    CAPTURE(grey);
    CHECK(out[0] == grey);
    CHECK(out[1] == grey);
    CHECK(out[2] == grey);
  }
}


TEST_CASE("scRgbToSrgb8 divides by the SDR white level", "[ScRgbConversion]")
{
  // 240-nit SDR white = scRGB 3.0, as on this project's HDR test monitors.
  constexpr float scale = 3.0f;
  for(int grey : {64, 128, 192, 255}){
    const float linear = static_cast<float>(srgbToLinear(grey)) * scale;
    auto out = convertOne({linear, linear, linear, 1.0f}, scale);
    CAPTURE(grey);
    CHECK(out[0] == grey);
  }
}


TEST_CASE("scRgbToSrgb8 clamps out-of-range and non-finite values", "[ScRgbConversion]")
{
  auto bright = convertOne({10.0f, -0.5f, 1.0f, 1.0f}, 1.0f);
  CHECK(bright[0] == 255);
  CHECK(bright[1] == 0);
  CHECK(bright[2] == 255);

  const float nan = std::numeric_limits<float>::quiet_NaN();
  auto invalid = convertOne({nan, 0.0f, 0.0f, 1.0f}, 1.0f);
  CHECK(invalid[0] == 0);
}


TEST_CASE("scRgbToSrgb8 keeps channel order and passes alpha through linearly", "[ScRgbConversion]")
{
  auto red = convertOne({1.0f, 0.0f, 0.0f, 1.0f}, 1.0f);
  CHECK(red == cv::Vec4b(255, 0, 0, 255));

  // The all-zero placeholder frame keeps alpha 0, which the manual tests skip on.
  auto placeholder = convertOne({0.0f, 0.0f, 0.0f, 0.0f}, 3.0f);
  CHECK(placeholder == cv::Vec4b(0, 0, 0, 0));

  auto halfAlpha = convertOne({0.0f, 0.0f, 0.0f, 0.5f}, 1.0f);
  CHECK(halfAlpha[3] == 128);
}
