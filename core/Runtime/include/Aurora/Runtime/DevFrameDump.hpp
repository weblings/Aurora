#pragma once

#include <cstdint>
#include <string>

#include <Aurora/Contracts/ImageData.hpp>

// Dev-only, fire-and-forget UDP broadcast of the subsampled source frame
// Orchestrator::update() composes zone colors from -- lets a dev tool
// (tools/light-viz-relay/validate.py) independently recompute each zone's
// mean over its own uvs and cross-check against DevLightTap's reported
// values, for arbitrary (not just solid-color) on-screen content. No-op
// unless AURORA_DEV_FRAME_DUMP is set, same convention as
// output/hue/include/Aurora/Output/Hue/DevLightTap.hpp -- deliberately not
// shared code with it despite the near-identical env-var/socket shape:
// core/Runtime can't depend on output/hue (wrong layering direction), and
// two small dev-only files duplicating ~15 lines of address parsing is a
// smaller cost than introducing a cross-cutting "dev address" utility for it.
namespace Aurora::Runtime
{
  struct DevFrameDumpAddress
  {
    std::string host;
    uint16_t port;
  };

  // Distinct from DevLightTap's 18244 and light-viz-relay's own 18244/18245
  // -- this is a separate channel straight to a dev tool, never through
  // relay.py (raw pixel data doesn't fit relay.py's JSON-line/SSE shape
  // the way per-zone colors do).
  inline constexpr uint16_t DefaultDevFrameDumpPort = 18247;

  // envValue is AURORA_DEV_FRAME_DUMP_ADDRESS's value (separate from the
  // AURORA_DEV_FRAME_DUMP presence flag -- see DevFrameDump's constructor):
  // empty uses the default address; "host:port" overrides either or both
  // parts.
  DevFrameDumpAddress parseDevFrameDumpAddress(const std::string& envValue);

  // JSON: {"width":W,"height":H,"format":"BGR"|"RGB"|"BGRA"|"RGBA","data":"<base64>"}.
  // "data" is the raw, row-major pixel bytes (width*height*channels),
  // base64-encoded so the payload stays plain JSON text like every other
  // dev-tool datagram in this family -- readable/parseable the same way,
  // at the cost of ~33% size over raw binary. Empty string if the image
  // has no data (caller should skip sending).
  std::string buildDevFrameDumpPayload(const Contracts::ImageData& image);

  class DevFrameDump
  {
  public:
    DevFrameDump();
    ~DevFrameDump();

    DevFrameDump(const DevFrameDump&) = delete;
    DevFrameDump& operator=(const DevFrameDump&) = delete;

    // Best-effort: never blocks, never throws. Drops (skips sending)
    // datagrams over the single-packet cap rather than fragment -- see the
    // .cpp for the exact size and why fragmentation isn't worth building
    // for a localhost dev tool.
    void publish(const Contracts::ImageData& image) const;

  private:
    bool m_enabled{false};
    int m_socketFd{-1};
  };
}
