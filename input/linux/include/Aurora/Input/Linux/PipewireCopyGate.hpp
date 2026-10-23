#pragma once

// Aurora-8ydf: rate cap for the PipeWire frame copy, the Wayland counterpart
// of X11GrabGate's minimum interval. Mutter delivers every composited frame
// (~58/s on moving content) and each one costs a sync + full-size read +
// decimate, so the callback copies at most one per interval.
//
// PipeWire only sends a buffer when the screen changes, so a frame dropped
// for being too early may be the LAST one before the screen goes quiet. The
// caller therefore holds the newest early buffer and copies it when waitMs()
// reaches zero, instead of discarding it. Pure (times are passed in) so it's
// testable without libpipewire.
namespace Aurora::Input::Linux
{
  // Min time between frame copies: 20 fps, matching X11's kMinGrabIntervalMs
  // (X11Grabber.cpp). Lower costs CPU back toward the uncapped ~58 copies/s,
  // higher coarsens motion for the lights (Aurora-gjcj is the smoothness call).
  inline constexpr long long kPipewireMinCopyIntervalMs = 50;

  class PipewireCopyGate
  {
  public:
    explicit PipewireCopyGate(long long minIntervalMs):
    m_minIntervalMs(minIntervalMs)
    {
    }

    // 0 = a copy is due now; otherwise how long until one is.
    long long waitMs(long long nowMs) const
    {
      if(!m_hasCopied){
        return 0;
      }
      const long long elapsed = nowMs - m_lastCopyMs;
      if(elapsed < 0){
        return m_minIntervalMs;  // clock went backwards: wait one full interval
      }
      return elapsed >= m_minIntervalMs ? 0 : m_minIntervalMs - elapsed;
    }

    void onCopied(long long nowMs)
    {
      m_hasCopied = true;
      m_lastCopyMs = nowMs;
    }

  private:
    long long m_minIntervalMs;
    long long m_lastCopyMs{0};
    bool m_hasCopied{false};
  };
}
