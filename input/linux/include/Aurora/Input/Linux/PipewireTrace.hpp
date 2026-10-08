#pragma once

#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>

// Dev-only diagnostics for PipewireGrabber (Aurora-1t1): when
// AURORA_DEV_PW_TRACE is set, log once a second how many process callbacks
// arrived, how many carried new pixel content, and what buffer/meta they had.
// Splits "PipeWire stopped calling back" from "callbacks with identical
// content". No Pipewire types here, so it is testable without libpipewire.
// Single-threaded: every call comes from the Pipewire loop thread.
namespace Aurora::Input::Linux
{
  // Unset, empty, or "0" = off. Anything else = on.
  inline bool pipewireTraceEnabledFrom(const char* value)
  {
    return value != nullptr && value[0] != '\0' && std::strcmp(value, "0") != 0;
  }


  // FNV-1a over a strided sample of the frame (plus the last byte): cheap
  // enough for every callback, enough to see a whole-screen color change.
  inline uint64_t sampleContentHash(const uint8_t* data, size_t size)
  {
    constexpr size_t kStride = 251;  // prime, so it doesn't alias row pitch
    uint64_t hash = 1469598103934665603ull;
    for(size_t i = 0; i < size; i += kStride){
      hash = (hash ^ data[i]) * 1099511628211ull;
    }
    if(size > 0){
      hash = (hash ^ data[size - 1]) * 1099511628211ull;
    }
    return hash;
  }


  class PipewireTrace
  {
  public:
    bool enabled{false};

    // nowSeconds: any monotonic clock, in seconds.
    void onFrame(
      double nowSeconds,
      uint64_t contentHash,
      int64_t seq,
      int64_t pts,
      uint32_t dataType,
      int32_t chunkFlags,
      int damageRegions
    )
    {
      ++m_callbacks;
      if(!m_haveHash || contentHash != m_lastHash){
        ++m_contentChanges;
        m_lastChangeAt = nowSeconds;
        m_haveChange = true;
      }
      m_haveHash = true;
      m_lastHash = contentHash;
      m_lastCallbackAt = nowSeconds;
      m_haveCallback = true;
      if(!m_haveSeq){
        m_firstSeq = seq;
        m_haveSeq = true;
      }
      m_lastSeq = seq;
      m_lastPts = pts;
      m_dataType = dataType;
      m_chunkFlags |= chunkFlags;
      m_damageRegions = damageRegions;
    }

    enum class SkipReason { NoData, NoChunk, EmptyChunk };

    // A callback that had no usable pixels. chunkFlags/chunkSize are what the
    // producer put on the chunk (-1 / 0 when there is no chunk).
    void onSkipped(
      double nowSeconds,
      uint32_t dataType,
      SkipReason reason,
      int32_t chunkFlags,
      uint32_t chunkSize
    )
    {
      ++m_skipped;
      ++m_skipReasons[static_cast<int>(reason)];
      m_skipChunkFlags |= chunkFlags;
      m_skipChunkSize = chunkSize;
      m_dataType = dataType;
      m_lastCallbackAt = nowSeconds;
      m_haveCallback = true;
    }

    // One summary line for the window since the previous call, then resets
    // the window counters. Ages are against nowSeconds.
    std::string takeSummary(double nowSeconds)
    {
      char line[400];
      std::snprintf(
        line, sizeof(line),
        "[pw-trace] cb=%u skipped=%u(noData=%u noChunk=%u emptyChunk=%u skipFlags=0x%x skipSize=%u) "
        "changed=%u seq=%lld..%lld pts=%lld "
        "dataType=%u chunkFlags=0x%x damage=%d lastCb=%s lastChange=%s",
        m_callbacks, m_skipped, m_skipReasons[0], m_skipReasons[1], m_skipReasons[2],
        static_cast<unsigned>(m_skipChunkFlags), m_skipChunkSize, m_contentChanges,
        static_cast<long long>(m_firstSeq), static_cast<long long>(m_lastSeq),
        static_cast<long long>(m_lastPts), m_dataType,
        static_cast<unsigned>(m_chunkFlags), m_damageRegions,
        ageText(m_haveCallback, nowSeconds - m_lastCallbackAt).c_str(),
        ageText(m_haveChange, nowSeconds - m_lastChangeAt).c_str()
      );
      m_callbacks = 0;
      m_skipped = 0;
      m_skipReasons[0] = m_skipReasons[1] = m_skipReasons[2] = 0;
      m_skipChunkFlags = 0;
      m_skipChunkSize = 0;
      m_contentChanges = 0;
      m_chunkFlags = 0;
      m_haveSeq = false;
      return line;
    }

  private:
    static std::string ageText(bool have, double age)
    {
      if(!have){
        return "never";
      }
      char text[32];
      std::snprintf(text, sizeof(text), "%.1fs", age);
      return text;
    }

    // Window counters (reset by takeSummary).
    uint32_t m_callbacks{0};
    uint32_t m_skipped{0};
    uint32_t m_skipReasons[3]{0, 0, 0};
    int32_t m_skipChunkFlags{0};
    uint32_t m_skipChunkSize{0};
    uint32_t m_contentChanges{0};
    int32_t m_chunkFlags{0};
    bool m_haveSeq{false};
    int64_t m_firstSeq{0};

    // Carried across windows.
    uint64_t m_lastHash{0};
    bool m_haveHash{false};
    int64_t m_lastSeq{0};
    int64_t m_lastPts{0};
    uint32_t m_dataType{0};
    int m_damageRegions{-1};
    double m_lastCallbackAt{0};
    bool m_haveCallback{false};
    double m_lastChangeAt{0};
    bool m_haveChange{false};
  };
}
