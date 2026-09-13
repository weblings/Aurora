#pragma once

#include <unordered_map>
#include <string>

// Ported as-is from huenicorn's Huenicorn::Imaging::Interpolation
// (include/Huenicorn/Imaging/Interpolation.hpp). Lives in Contracts, not
// Processing: it's shared vocabulary consumed by config/UI (a dropdown of
// available interpolation kinds) as well as by Processing's own rescale(),
// not internal Processing logic.
namespace Aurora::Contracts
{
  namespace Interpolation
  {
    enum class Type
    {
      Nearest = 0,
      Cubic = 1,
      Area = 2
    };


    using Interpolations = std::unordered_map<std::string, Type>;

    extern Interpolations availableInterpolations;
  }
}
