#pragma once

#include <cstdint>
#include <functional>
#include <map>
#include <string>
#include <vector>

#include <Aurora/Contracts/Frame.hpp>

// Stable interface a plugin repo (e.g. Aurora-Output-Hue) implements.
// Push model: send() is called once per tick, mirroring Streamer::streamChannels() today.
namespace Aurora::Output
{
  // Whether the device behind an output answers and still streams (Aurora-lt66).
  // Stopped means reachable but not streaming, so a reconnect makes sense. Busy
  // means another app holds the device, so it must not. Ordered least to most urgent.
  enum class LinkState { Ok, Busy, Unreachable, Stopped };

  // Self-contained and thread-safe: owns copies of what it needs, so a monitor
  // thread can call it (blocking) after the output itself is gone. Empty when
  // the output has nothing to probe.
  using LinkProbe = std::function<LinkState()>;

  class IOutput
  {
  public:
    virtual ~IOutput() = default;

    virtual LinkProbe linkProbe() const { return {}; }

    virtual const std::string& name() const = 0;

    // Target addressing/credentials are passed to the concrete subclass's own constructor.
    virtual void init() = 0;
    virtual bool isConnected() const = 0;

    // isReplacement: true when a reload built a newer instance (possibly
    // for the same physical target) before tearing this one down; false on
    // a real app exit. A plugin with external session state (e.g. Hue's
    // bridge-side streaming) needs this to avoid undoing a same-target
    // replacement that already started -- see WebUI/WebUI_Fixes.md's
    // video<->audio live-switch bug. Plugins with no such state can ignore it.
    virtual void shutdown(bool isReplacement) = 0;

    // Live zone IDs this output currently exposes (e.g. Hue: bridge channels
    // in the active entertainment configuration) -- reconciled by Runtime
    // against a saved Runtime::ZoneMap. May be empty before init().
    virtual std::vector<uint8_t> zoneIds() const = 0;

    // Human-readable names per live zone ID (Hue: the light names behind each
    // channel; HA later: friendly_name) -- for WebUI labels only, never
    // addressing. Defaults to none; an ID missing here shows a bare "Zone N".
    virtual std::map<uint8_t, std::vector<std::string>> zoneLabels() const { return {}; }

    // True when brightness 0 switches the light off (HA's turn_on), so the
    // brightness floor stage (Aurora-6v36) applies. Hue's stream does not.
    virtual bool zeroBrightnessMeansOff() const { return false; }

    virtual void send(const Contracts::Frame& frame) = 0;
  };
}
