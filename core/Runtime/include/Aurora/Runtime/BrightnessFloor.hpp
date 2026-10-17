#pragma once

#include <cstdint>
#include <unordered_map>

#include <glm/vec3.hpp>

#include <Aurora/Contracts/Frame.hpp>

// Output-neutral brightness floor (Aurora-6v36, policy decided in Aurora-pngj).
// For outputs where brightness 0 means off, so black and gain 0 follow one rule.
namespace Aurora::Runtime
{
  class BrightnessFloor
  {
  public:
    enum class Policy
    {
      Off,       // frames pass through untouched
      HoldFloor, // dim colors rise to the floor, hue kept; exact black holds the last hue
      SwitchOff  // as HoldFloor, but exact black for holdSeconds goes to real black
    };

    struct Settings
    {
      Policy policy{Policy::Off};
      float floor{0.f};       // minimum largest-channel value, 0-1
      float holdSeconds{0.f}; // SwitchOff only: black this long before switching off
    };

    // dt advances the black timers, so tests drive it with a fake clock.
    Contracts::Frame apply(const Contracts::Frame& frame, const Settings& settings, float dt);

    void reset() { m_zones.clear(); }

  private:
    struct ZoneState
    {
      glm::vec3 lastHue{0.f}; // last non-black color scaled so its largest channel is 1
      float blackSeconds{0.f};
    };

    std::unordered_map<uint8_t, ZoneState> m_zones;
  };
}
