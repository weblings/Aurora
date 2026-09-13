#pragma once

#include <glm/vec3.hpp>

#include <Aurora/Contracts/Color.hpp>

// Hue's CIE xyY conversion -- ported from Contracts::Color::toXYB(), moved
// here since it's Hue-specific colorimetry, not a generic color operation.
namespace Aurora::Output::Hue
{
  inline constexpr glm::vec3 XYBBlack{0.315f, 0.3312f, 0.f};

  glm::vec3 toXYB(
    const Contracts::Color& color
  );
}
