#pragma once

#include <cstdint>
#include <string>
#include <unordered_map>

#include <Aurora/Contracts/Frame.hpp>

// RGB-space temporal easing, keyed per (outputId, zoneId) so unrelated
// outputs' zone IDs never share state. Replaces the XYB-space smoothing
// that used to live inside Output-Hue's Channel -- see RuntimeAnalysis.md.
namespace Aurora::Runtime
{
  class Smoother
  {
  public:
    // smoothing in [0, 1): 0 reproduces instant (unsmoothed) behavior
    // exactly. A zone's first-ever tick for a given outputId is never
    // smoothed -- there's no previous color to ease from yet.
    Contracts::Frame smooth(
      const std::string& outputId,
      const Contracts::Frame& frame,
      float smoothing
    );

  private:
    struct Key
    {
      std::string outputId;
      uint8_t zoneId;

      bool operator==(const Key& other) const
      {
        return outputId == other.outputId && zoneId == other.zoneId;
      }
    };

    struct KeyHash
    {
      size_t operator()(const Key& key) const
      {
        return std::hash<std::string>()(key.outputId) ^ (std::hash<int>()(key.zoneId) << 1);
      }
    };

    std::unordered_map<Key, Contracts::Color, KeyHash> m_previousColors;
  };
}
