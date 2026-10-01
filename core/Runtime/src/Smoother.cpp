#include <Aurora/Runtime/Smoother.hpp>

#include <glm/common.hpp>

// Hand-ported to JS in ../../../web-processing/smoother.js -- see
// ../../../CLAUDE.md before changing the easing formula, the JS mirror likely needs it too.

namespace Aurora::Runtime
{
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
        easedColor = Contracts::Color::fromNormalized(eased); // guarded cast, rounds to nearest
      }

      m_previousColors[key] = easedColor;
      result.push_back({zone.id, easedColor, zone.gamma});
    }

    return result;
  }
}
