#pragma once

#include <opencv2/core.hpp>

// HDR desktop capture (Aurora-wqzp.12): DXGI hands back linear scRGB half
// floats, where 1.0 is 80 nits and SDR white sits at the user's SDR level.
namespace Aurora::Input::Windows
{
  // CV_16FC4 linear scRGB (R,G,B,A) -> CV_8UC4 sRGB (R,G,B,A). Colour is
  // divided by sdrWhiteScale (SDR white nits / 80), clamped, then sRGB-encoded.
  cv::Mat scRgbToSrgb8(const cv::Mat& scRgb, float sdrWhiteScale);
}
