#include <Aurora/Output/Hue/Colorimetry.hpp>

#include <cmath>


namespace Aurora::Output::Hue
{
  glm::vec3 toXYB(
    const Contracts::Color& color
  )
  {
    // Following https://gist.github.com/popcorn245/30afa0f98eea1c2fd34d
    glm::vec3 normalizedRgb = color.toNormalized();

    for(int i = 0; i < normalizedRgb.length(); i++){
      auto& channel = normalizedRgb[i];
      channel = (channel > 0.04045f) ? std::pow((channel + 0.055f) / (1.0f + 0.055f), 2.4f) : (channel / 12.92f);
    }

    float r = normalizedRgb.r;
    float g = normalizedRgb.g;
    float b = normalizedRgb.b;

    float X = r * 0.649926f + g * 0.103455f + b * 0.197109f;
    float Y = r * 0.234327f + g * 0.743075f + b * 0.022598f;
    float Z = r * 0.000000f + g * 0.053077f + b * 1.035763f;

    float sum = X + Y + Z;

    glm::vec3 xyb = XYBBlack;

    if(sum != 0.f){
      xyb[0] = X / sum;
      xyb[1] = Y / sum;
      xyb[2] = color.brightness();
    }

    return xyb;
  }
}
