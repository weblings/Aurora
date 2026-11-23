#pragma once

#include <cstddef>
#include <cstdint>
#include <cstring>

// Bookkeeping for PipewireGrabber's DMA-BUF capture and stall detection
// (Aurora-1t1). No Pipewire types, so it is testable without libpipewire.
// Single-threaded: every call comes from the Pipewire loop thread.
namespace Aurora::Input::Linux
{
  // AURORA_PW_DMABUF kill switch: DMA-BUF stays on unless set to "0".
  inline bool dmabufEnabledFrom(const char* value)
  {
    return value == nullptr || std::strcmp(value, "0") != 0;
  }


  // True when a frame of height rows (stride bytes apart, width * 4 bytes
  // each) starting at offset lies inside a buffer of bufferSize bytes.
  inline bool frameFitsBuffer(
    size_t offset, size_t stride, int width, int height, size_t bufferSize
  )
  {
    if(width <= 0 || height <= 0){
      return false;
    }
    const size_t rowBytes = static_cast<size_t>(width) * 4;
    if(stride < rowBytes || offset > bufferSize){
      return false;
    }
    const size_t needed = stride * static_cast<size_t>(height - 1) + rowBytes;
    return needed <= bufferSize - offset;
  }


  // Decides when DMA-BUF reads have failed often enough to give up on them
  // and renegotiate shared memory. A success resets the count.
  class DmabufReadFallback
  {
  public:
    static constexpr int kMaxConsecutiveFailures = 3;

    // True exactly once: on the failure that crosses the threshold.
    bool onReadFailed()
    {
      if(m_disabled){
        return false;
      }
      if(++m_consecutiveFailures >= kMaxConsecutiveFailures){
        m_disabled = true;
        return true;
      }
      return false;
    }

    void onReadOk()
    {
      m_consecutiveFailures = 0;
    }

    bool disabled() const
    {
      return m_disabled;
    }

  private:
    int m_consecutiveFailures{0};
    bool m_disabled{false};
  };


  // Decides when DMA-BUF reads are too slow to be useful (Aurora-vijc: a
  // mmapped LINEAR buffer on the Steam Deck APU copies out at ~680 ms a
  // frame vs ~3 ms from shared memory) and a renegotiation to shared memory
  // is worth it. Unlike DmabufReadFallback the frames are valid; only the
  // time they take counts. A read at or under budget resets the count.
  class SlowReadWatch
  {
  public:
    static constexpr double kDefaultBudgetMs = 100.0;
    static constexpr int kMaxConsecutiveSlow = 3;

    explicit SlowReadWatch(double budgetMs = kDefaultBudgetMs)
      : m_budgetMs(budgetMs)
    {
    }

    // True exactly once: on the slow read that crosses the threshold.
    bool onReadTimed(double ms)
    {
      if(m_disabled){
        return false;
      }
      if(ms <= m_budgetMs){
        m_consecutiveSlow = 0;
        return false;
      }
      if(++m_consecutiveSlow >= kMaxConsecutiveSlow){
        m_disabled = true;
        return true;
      }
      return false;
    }

    bool disabled() const
    {
      return m_disabled;
    }

    double budgetMs() const
    {
      return m_budgetMs;
    }

  private:
    double m_budgetMs;
    int m_consecutiveSlow{0};
    bool m_disabled{false};
  };


  // Spots the 1t1 freeze: callbacks keep arriving but none carry pixels
  // (empty or CORRUPTED chunks), so the grabber serves its last good frame.
  // Silence (no callbacks) is not a stall: an idle screen sends nothing.
  class StaleFrameWatch
  {
  public:
    explicit StaleFrameWatch(double thresholdSeconds = 3.0)
      : m_thresholdSeconds(thresholdSeconds)
    {
    }

    // A usable frame arrived. True if it ends a stall that was reported.
    bool onFrame()
    {
      const bool recovered = m_reported;
      m_inEpisode = false;
      m_reported = false;
      return recovered;
    }

    // A callback without usable pixels. True exactly once per stall, when
    // only such callbacks have arrived for thresholdSeconds.
    bool onUnusable(double nowSeconds)
    {
      if(!m_inEpisode){
        m_inEpisode = true;
        m_episodeStart = nowSeconds;
      }
      if(!m_reported && nowSeconds - m_episodeStart >= m_thresholdSeconds){
        m_reported = true;
        return true;
      }
      return false;
    }

    double stalledFor(double nowSeconds) const
    {
      return m_inEpisode ? nowSeconds - m_episodeStart : 0.0;
    }

  private:
    double m_thresholdSeconds;
    bool m_inEpisode{false};
    bool m_reported{false};
    double m_episodeStart{0};
  };
}
