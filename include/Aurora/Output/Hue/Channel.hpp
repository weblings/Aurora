#pragma once

#include <cstdint>
#include <unordered_map>
#include <vector>

#include <glm/exponential.hpp>

#include <Aurora/Contracts/UV.hpp>
#include <Aurora/Output/Hue/Device.hpp>


namespace Aurora::Output::Hue
{
  struct Channel;
  using Channels = std::unordered_map<uint8_t, Channel>;

  // One channel's color entry for Streamer::streamChannels() -- r/g/b are
  // XYB components (x, y, brightness) by the time they reach here, not RGB.
  struct ChannelStream
  {
    uint8_t id;
    float r{0.f};
    float g{0.f};
    float b{0.f};
  };
  using ChannelStreams = std::vector<ChannelStream>;

  // Wrapper around a Hue entertainment channel, extended with UV zone + gamma control.
  struct Channel
  {
  public:
    enum class State
    {
      Inactive,
      Active,
      PendingShutdown
    };

    Channel(
      bool active,
      const Devices& devices,
      float gammaFactor,
      const Contracts::UVs& uvs = {{0, 0}, {1, 1}}
    );

    // 2^(-gammaFactor * 2) -- see huenicorn's original Channel::gammaExponent().
    inline float gammaExponent() const
    {
      float factor = 2.f;
      return glm::pow(2.f, -gammaFactor * factor);
    }

    void setActive(bool active);

    Contracts::UVs& setUV(
      const Contracts::UV& uv,
      Contracts::UVCorner uvCorner
    );

    void acknowledgeShutdown();

    State state{State::Inactive};
    Devices devices;
    float gammaFactor{0.0};
    Contracts::UVs uvs{};
  };
}
