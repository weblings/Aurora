#include <Aurora/Runtime/Smoother.hpp>

#include <glm/common.hpp>

namespace Aurora::Runtime
{
  namespace
  {
    Contracts::Color fromNormalized(const glm::vec3& color)
    {
      glm::vec3 scaled = glm::clamp(color, 0.f, 1.f) * Contracts::Color::Max;

      // +0.5 rounds to nearest instead of truncating toward zero.
      return Contracts::Color(
        static_cast<uint8_t>(scaled.r + 0.5f),
        static_cast<uint8_t>(scaled.g + 0.5f),
        static_cast<uint8_t>(scaled.b + 0.5f)
      );
    }
  }


  Contracts::Frame Smoother::smooth(
    const std::string& outputId,
    const Contracts::Frame& frame,
    float smoothing
  )
  {
    Contracts::Frame result;
    result.reserve(frame.size());

    for(const auto& zone : frame){
      Key key{outputId, zone.id};
      auto previous = m_previousColors.find(key);

      Contracts::Color easedColor = zone.color;
      if(smoothing > 0.f && previous != m_previousColors.end()){
        glm::vec3 eased = glm::mix(previous->second.toNormalized(), zone.color.toNormalized(), 1.f - smoothing);
        easedColor = fromNormalized(eased);
      }

      m_previousColors[key] = easedColor;
      result.push_back({zone.id, easedColor});
    }

    return result;
  }
}
