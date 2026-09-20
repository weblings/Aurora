#include <Aurora/Output/Hue/Channel.hpp>

#include <glm/common.hpp>


namespace Aurora::Output::Hue
{
  Channel::Channel(
    bool active,
    const Devices& devices,
    float gammaFactor,
    const Contracts::UVs& uvs
  ):
  state(active ? State::Active : State::Inactive),
  devices(devices),
  gammaFactor(gammaFactor),
  uvs(uvs)
  {}


  void Channel::setActive(bool active)
  {
    state = active ? State::Active : State::PendingShutdown;
  }


  Contracts::UVs& Channel::setUV(
    const Contracts::UV& uv,
    Contracts::UVCorner uvCorner
  )
  {
    float x = glm::clamp(uv.x, 0.f, 1.f);
    float y = glm::clamp(uv.y, 0.f, 1.f);

    switch(uvCorner)
    {
      case Contracts::UVCorner::TopLeft:
        uvs.min = {x, y};
        uvs.max.x = glm::max(x, uvs.max.x);
        uvs.max.y = glm::max(y, uvs.max.y);
        break;

      case Contracts::UVCorner::TopRight:
        uvs.max.x = x;
        uvs.min.y = y;
        uvs.min.x = glm::min(x, uvs.min.x);
        uvs.max.y = glm::max(y, uvs.max.y);
        break;

      case Contracts::UVCorner::BottomLeft:
        uvs.min.x = x;
        uvs.max.y = y;
        uvs.max.x = glm::max(x, uvs.max.x);
        uvs.min.y = glm::min(y, uvs.min.y);
        break;

      case Contracts::UVCorner::BottomRight:
        uvs.max = {x, y};
        uvs.min.x = glm::min(x, uvs.min.x);
        uvs.min.y = glm::min(y, uvs.min.y);
        break;
    }

    return uvs;
  }


  void Channel::acknowledgeShutdown()
  {
    state = State::Inactive;
  }
}
