#include <Aurora/Input/Windows/ScRgbConversion.hpp>

#include <array>
#include <cmath>
#include <cstdint>
#include <limits>
#include <memory>


namespace
{
  using Table = std::array<std::uint8_t, 65536>;

  float halfToFloat(std::uint16_t bits)
  {
    const int exponent = (bits >> 10) & 0x1f;
    const int mantissa = bits & 0x3ff;
    float value;
    if(exponent == 0){
      value = std::ldexp(static_cast<float>(mantissa), -24);
    }
    else if(exponent == 31){
      value = mantissa ? std::numeric_limits<float>::quiet_NaN() : std::numeric_limits<float>::infinity();
    }
    else{
      value = std::ldexp(static_cast<float>(mantissa + 1024), exponent - 25);
    }
    return (bits & 0x8000) ? -value : value;
  }

  std::uint8_t encodeSrgb(float linear)
  {
    // !(linear > 0) also catches NaN.
    if(!(linear > 0.0f)){
      return 0;
    }
    if(linear >= 1.0f){
      return 255;
    }
    const double encoded = linear <= 0.0031308f ? 12.92 * linear : 1.055 * std::pow(linear, 1.0 / 2.4) - 0.055;
    return static_cast<std::uint8_t>(std::lround(encoded * 255.0));
  }

  // Indexed by raw half-float bits, so a channel is one table read. Rebuilt
  // only when the SDR white level changes (the capture thread is the only user).
  const Table& colourTable(float sdrWhiteScale)
  {
    thread_local float builtFor = std::numeric_limits<float>::quiet_NaN();
    thread_local auto table = std::make_unique<Table>();
    if(builtFor != sdrWhiteScale){
      for(std::size_t bits = 0; bits < table->size(); ++bits){
        (*table)[bits] = encodeSrgb(halfToFloat(static_cast<std::uint16_t>(bits)) / sdrWhiteScale);
      }
      builtFor = sdrWhiteScale;
    }
    return *table;
  }

  // Alpha is coverage, not light: no white scale or transfer curve.
  const Table& alphaTable()
  {
    static const auto table = []{
      auto result = std::make_unique<Table>();
      for(std::size_t bits = 0; bits < result->size(); ++bits){
        const float alpha = halfToFloat(static_cast<std::uint16_t>(bits));
        (*result)[bits] = !(alpha > 0.0f) ? 0 : alpha >= 1.0f ? 255 : static_cast<std::uint8_t>(std::lround(alpha * 255.0f));
      }
      return result;
    }();
    return *table;
  }
}


namespace Aurora::Input::Windows
{
  cv::Mat scRgbToSrgb8(const cv::Mat& scRgb, float sdrWhiteScale)
  {
    CV_Assert(scRgb.type() == CV_16FC4);
    const auto& colour = colourTable(sdrWhiteScale);
    const auto& alpha = alphaTable();

    cv::Mat result(scRgb.rows, scRgb.cols, CV_8UC4);
    for(int y = 0; y < scRgb.rows; ++y){
      const auto* in = scRgb.ptr<std::uint16_t>(y);
      auto* out = result.ptr<std::uint8_t>(y);
      for(int i = 0; i < scRgb.cols * 4; i += 4){
        out[i] = colour[in[i]];
        out[i + 1] = colour[in[i + 1]];
        out[i + 2] = colour[in[i + 2]];
        out[i + 3] = alpha[in[i + 3]];
      }
    }
    return result;
  }
}
