#pragma once

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
// all. See Analysis/ProcessingAnalysis.md.
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

    // Attributes
    ChannelDepth m_r;
    ChannelDepth m_g;
    ChannelDepth m_b;
  };
}
