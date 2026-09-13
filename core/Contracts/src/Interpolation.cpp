#include <Aurora/Contracts/Interpolation.hpp>


namespace Aurora::Contracts
{
  namespace Interpolation
  {
    Interpolations availableInterpolations = {
      {"Nearest", Type::Nearest},
      {"Cubic", Type::Cubic},
      {"Area", Type::Area},
    };
  }
}
