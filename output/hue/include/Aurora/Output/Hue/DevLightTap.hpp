#pragma once

#include <cstdint>
#include <string>

#include <Aurora/Output/Hue/Channel.hpp>

// Dev-only, fire-and-forget UDP broadcast of computed per-zone colors --
// feeds the standalone three.js visualization tool's local relay (tools/),
// so capture/input work can be visually checked without a physical Hue
// bridge. No-op unless AURORA_DEV_LIGHT_TAP is set: one env lookup at
// construction, nothing else touched when disabled. See
// docs/lessons/output.md's isConnected()-swallowed-failure entries --
// this tap must never let delivery depend on observability, so it sits
// downstream of nothing: HueOutput::send() computes channelStreams and
// calls this unconditionally, the same way it unconditionally calls
// Streamer::streamChannels() regardless of DTLS connection state.
namespace Aurora::Output::Hue
{
  struct DevLightTapAddress
  {
    std::string host;
    uint16_t port;
  };

  // Default matches the fake-hue-bridge dev-tooling port range (18231-18236,
  // 18443) without colliding with any of it.
  inline constexpr uint16_t DefaultDevLightTapPort = 18244;

  // envValue is AURORA_DEV_LIGHT_TAP_ADDRESS's value (a separate var from
  // the AURORA_DEV_LIGHT_TAP presence flag itself -- see DevLightTap's
  // constructor): empty uses the default address (127.0.0.1:18244);
  // "host:port" overrides either or both parts ("host" alone overrides
  // just the host, ":port" just the port).
  DevLightTapAddress parseDevLightTapAddress(const std::string& envValue);

  // JSON: {"zones":[{"id":1,"r":1.0,"g":0.5,"b":0.0}, ...]} -- field names
  // match ChannelStream's own, so the wire shape needs no translation layer
  // on either end.
  std::string buildDevLightTapPayload(const ChannelStreams& channelStreams);

  class DevLightTap
  {
  public:
    DevLightTap();
    ~DevLightTap();

    DevLightTap(const DevLightTap&) = delete;
    DevLightTap& operator=(const DevLightTap&) = delete;

    // Best-effort: never blocks, never throws, silently drops on a slow or
    // absent relay (non-blocking UDP send -- there is no connection to fail).
    void publish(const ChannelStreams& channelStreams) const;

  private:
    bool m_enabled{false};
    int m_socketFd{-1};
  };
}
