#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>

#include <glm/vec3.hpp>

// Ported from huenicorn's Huenicorn::Imaging::Color
// (include/Huenicorn/Imaging/Color.hpp) -- generic parts only.
//
// toXYB()/XYBBlack (CIE xyY conversion) and the unused GamutCoordinates/
// _sign()/_xyInGamut() gamut-boundary check were deliberately NOT ported
// here: they're Hue's own colorimetry, not a generic color operation, and
// the gamut check was dead code in the original (written, never called).
// toXYB() becomes a free function in Output/Hue/ instead, taking a
// Contracts::Color -- Color itself no longer needs to know Hue exists at
// all. See docs/ProcessingAnalysis.md.
namespace Aurora::Contracts
{
  /**
   * @brief Color data structure providing conversion and manipulation methods
   *
   */
  class Color
  {
  public:
    using ChannelDepth = uint8_t;
    static constexpr float Max = static_cast<float>(std::numeric_limits<ChannelDepth>().max());

    /**
     * @brief Color constructor
     *
     * @param r Red channel
     * @param g Green channel
     * @param b Blue channel
     */
    Color(
      ChannelDepth r = 0,
      ChannelDepth g = 0,
      ChannelDepth b = 0
    ):
    m_r(r),
    m_g(g),
    m_b(b)
    {}

    /**
     * @brief Equality comparison operator
     */
    bool operator==(const Color& other) const
    {
      return  m_r == other.m_r &&
              m_g == other.m_g &&
              m_b == other.m_b;
    }

    /**
     * @brief Inequality comparison operator
     */
    bool operator!=(const Color& other) const
    {
      return  !(*this == other);
    }


    /**
     * @brief Returns a rgb value in normalized 0-1 floating range
     *
     * @return glm::vec3 normalized color
     */
    glm::vec3 toNormalized() const
    {
      return glm::vec3(
        m_r / Color::Max,
        m_g / Color::Max,
        m_b / Color::Max
      );
    }


    /**
     * @brief Returns the ponderated brightness of RGB color
     *
     * @return float Color brightness
     */
    float brightness() const
    {
      return (m_r * 0.3f + m_g * 0.59f + m_b * 0.11f) / Color::Max;
    }


    /**
     * @brief Constructs a Color from HSV -- added for the audio-reactive
     * color model (docs/AudioAnalysis.md), which reasons in hue-arc
     * terms, not RGB. No HSV representation existed anywhere before this.
     *
     * @param hueDegrees Hue in degrees, wrapped to [0, 360)
     * @param saturation 0-1
     * @param value 0-1
     */
    static Color fromHSV(float hueDegrees, float saturation, float value)
    {
      // Non-finite input (e.g. NaN from a zero-divided drift rate,
      // Aurora-9ca) would fall through every hPrime branch and hit the
      // uint8_t cast below as UB -- return black instead of casting.
      if(!std::isfinite(hueDegrees) || !std::isfinite(saturation) || !std::isfinite(value)){
        return Color{};
      }
      float h = std::fmod(hueDegrees, 360.0f);
      if(h < 0.0f){
        h += 360.0f;
      }

      float c = value * saturation;
      float hPrime = h / 60.0f;
      float x = c * (1.0f - std::abs(std::fmod(hPrime, 2.0f) - 1.0f));
      float m = value - c;

      float r1 = 0.0f, g1 = 0.0f, b1 = 0.0f;
      if(hPrime < 1.0f)      { r1 = c; g1 = x; b1 = 0.0f; }
      else if(hPrime < 2.0f) { r1 = x; g1 = c; b1 = 0.0f; }
      else if(hPrime < 3.0f) { r1 = 0.0f; g1 = c; b1 = x; }
      else if(hPrime < 4.0f) { r1 = 0.0f; g1 = x; b1 = c; }
      else if(hPrime < 5.0f) { r1 = x; g1 = 0.0f; b1 = c; }
      else                   { r1 = c; g1 = 0.0f; b1 = x; }

      return fromNormalized(glm::vec3(r1 + m, g1 + m, b1 + m));
    }


    /**
     * @brief Inverse of toNormalized() -- the one float -> channel cast
     * site. Every float-producing path (fromHSV, Smoother, future graph
     * nodes) goes through here, so the guard lives in one place.
     *
     * Non-finite input returns black; out-of-range input clamps. Both
     * would otherwise be UB in the narrowing cast (Aurora-9ca, Aurora-5y0).
     * Checked before clamping: std::clamp passes NaN straight through.
     *
     * @param color rgb in normalized 0-1 floating range
     */
    static Color fromNormalized(const glm::vec3& color)
    {
      if(!std::isfinite(color.r) || !std::isfinite(color.g) || !std::isfinite(color.b)){
        return Color{};
      }
      auto toChannel = [](float v){
        return static_cast<ChannelDepth>(std::round(std::clamp(v, 0.0f, 1.0f) * Color::Max));
      };
      return Color(toChannel(color.r), toChannel(color.g), toChannel(color.b));
    }


    /**
     * @brief Returns {hueDegrees, saturation, value} -- the inverse of
     * fromHSV(). Hue is 0 (not undefined) for a fully desaturated color.
     *
     * @return glm::vec3 {hue in [0,360), saturation 0-1, value 0-1}
     */
    glm::vec3 toHSV() const
    {
      glm::vec3 rgb = toNormalized();
      float maxC = std::max({rgb.r, rgb.g, rgb.b});
      float minC = std::min({rgb.r, rgb.g, rgb.b});
      float delta = maxC - minC;

      float hue = 0.0f;
      if(delta > 1e-6f){
        if(maxC == rgb.r)      { hue = 60.0f * std::fmod((rgb.g - rgb.b) / delta, 6.0f); }
        else if(maxC == rgb.g) { hue = 60.0f * (((rgb.b - rgb.r) / delta) + 2.0f); }
        else                   { hue = 60.0f * (((rgb.r - rgb.g) / delta) + 4.0f); }
      }
      if(hue < 0.0f){
        hue += 360.0f;
      }

      float saturation = (maxC <= 1e-6f) ? 0.0f : (delta / maxC);

      return glm::vec3(hue, saturation, maxC);
    }

    // Attributes
    ChannelDepth m_r;
    ChannelDepth m_g;
    ChannelDepth m_b;
  };
}
