#pragma once

#include <string>

#include <Aurora/Contracts/Frame.hpp>

// Stable interface a plugin repo (e.g. Aurora-Output-Hue) implements.
// Push model: send() is called once per tick, mirroring Streamer::streamChannels() today.
namespace Aurora::Output
{
  class IOutput
  {
  public:
    virtual ~IOutput() = default;

    virtual const std::string& name() const = 0;

    // Target addressing/credentials are passed to the concrete subclass's own constructor.
    virtual void init() = 0;
    virtual bool isConnected() const = 0;
    virtual void shutdown() = 0;

    virtual void send(const Contracts::Frame& frame) = 0;
  };
}
