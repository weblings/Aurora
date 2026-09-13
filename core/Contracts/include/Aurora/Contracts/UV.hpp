#pragma once

#include <glm/vec2.hpp>

// Ported as-is from huenicorn's Huenicorn::Imaging::UV/UVs/UVCorner
// (include/Huenicorn/Imaging/UV.hpp). Already the right shape for a
// normalized bounding box -- doubles as the type for a hand-authored zone
// today and a detection bbox later (see OpenFormatsResearch.md).
namespace Aurora::Contracts
{
  using UV = glm::vec2;

  /**
   * @brief Normalized screen coordinates
   *
   */
  struct UVs
  {
    UV min;
    UV max;
  };


  /**
   * @brief Flag to identify corner
   *
   */
  enum UVCorner
  {
    TopLeft = 0,
    TopRight = 1,
    BottomLeft = 2,
    BottomRight = 3
  };
}
