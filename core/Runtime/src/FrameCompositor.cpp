#include <Aurora/Runtime/FrameCompositor.hpp>

#include <Aurora/Processing/ImageProcessing.hpp>

namespace Aurora::Runtime
{
  Contracts::Frame composeFrame(
    const Contracts::ImageData& source,
    const ZoneMap& zoneMap
  )
  {
    Contracts::Frame frame;

    for(const auto& zone : zoneMap){
      if(!zone.active){
        continue;
      }

      Contracts::ImageData crop;
      Processing::ImageProcessing::getSubImage(source, crop, zone.uvs);
      Contracts::Color color = Processing::ImageProcessing::getDominantColor(crop);

      frame.push_back({zone.zoneId, color});
    }

    return frame;
  }
}
