#include <Aurora/Runtime/AudioFrameCompositor.hpp>

namespace Aurora::Runtime
{
  Contracts::Frame composeAudioFrame(
    const Contracts::Color& color,
    const ZoneMap& zoneMap
  )
  {
    Contracts::Frame frame;

    for(const auto& zone : zoneMap){
      if(!zone.active){
        continue;
      }

      frame.push_back({zone.zoneId, color, zone.gamma});
    }

    return frame;
  }
}
