#include <Aurora/Runtime/BrightnessFloor.hpp>

#include <algorithm>

namespace Aurora::Runtime
{
  Contracts::Frame BrightnessFloor::apply(
    const Contracts::Frame& frame,
    const Settings& settings,
    float dt)
  {
    if(settings.policy == Policy::Off || settings.floor <= 0.f){
      m_zones.clear();
      return frame;
    }

    std::unordered_map<uint8_t, ZoneState> next;
    Contracts::Frame result;
    result.reserve(frame.size());
    for(const auto& zone : frame){
      ZoneState state;
      if(auto it = m_zones.find(zone.id); it != m_zones.end()){
        state = it->second;
      }

      glm::vec3 rgb = zone.color.toNormalized();
      float peak = std::max({rgb.r, rgb.g, rgb.b});
      Contracts::Color out = zone.color;
      if(peak > 0.f){
        state.lastHue = rgb / peak;
        state.blackSeconds = 0.f;
        if(peak < settings.floor){
          out = Contracts::Color::fromNormalized(state.lastHue * settings.floor);
        }
      } else {
        state.blackSeconds += dt;
        bool switchedOff = settings.policy == Policy::SwitchOff && state.blackSeconds >= settings.holdSeconds;
        // No hue seen yet: a gray floor beats holding nothing.
        glm::vec3 hue = state.lastHue == glm::vec3(0.f) ? glm::vec3(1.f) : state.lastHue;
        if(!switchedOff){
          out = Contracts::Color::fromNormalized(hue * settings.floor);
        }
      }
      next[zone.id] = state;
      result.push_back({zone.id, out, zone.gamma});
    }
    m_zones = std::move(next);
    return result;
  }
}
