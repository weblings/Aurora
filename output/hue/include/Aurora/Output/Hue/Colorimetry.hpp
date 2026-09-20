#pragma once

#include <glm/vec3.hpp>

#include <Aurora/Contracts/Color.hpp>

// Hue's CIE xyY conversion. NOT on HueOutput::send()'s live path (that
// streams RGB mode, matching huenicorn's actual wire behavior -- see
// Analysis/lessons/output.md) -- huenicorn has this same conversion too and
// never calls it either. Kept for tested, correct math a future XY-mode
// option could use; don't wire it back into toChannelStream() without
// re-checking that lesson entry first.
namespace Aurora::Output::Hue
{
  inline constexpr glm::vec3 XYBBlack{0.315f, 0.3312f, 0.f};

  glm::vec3 toXYB(
    const Contracts::Color& color
  );
}
