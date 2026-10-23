#pragma once

// Pure XDamage-region helpers for X11Grabber, decoupled from <X11/...> so
// they're testable without X11 dev packages -- the same split as
// SessionDispatch vs. the grabbers, and PipewireFrameBuffer vs.
// PipewireGrabber.
namespace Aurora::Input::Linux
{
  // Whether a damage rectangle in root-window coordinates (as carried by
  // XDamageNotifyEvent::area) touches a monitor rectangle. Empty rects
  // (w/h <= 0) never intersect; merely touching edges share no area.
  inline bool damageRectIntersectsMonitor(
    int damageX, int damageY, int damageW, int damageH,
    int monitorX, int monitorY, int monitorW, int monitorH
  )
  {
    if(damageW <= 0 || damageH <= 0 || monitorW <= 0 || monitorH <= 0){
      return false;
    }
    return damageX < monitorX + monitorW && monitorX < damageX + damageW &&
      damageY < monitorY + monitorH && monitorY < damageY + damageH;
  }


  // Grab-vs-reuse decision for X11Grabber, in monotonic-clock milliseconds
  // so it stays testable without <chrono> types: grab when there is no
  // frame yet; on a busy screen grab at most every minIntervalMs (the 11 ms
  // full-buffer decimate at 4K would otherwise eat the whole tick budget);
  // on a quiet one still grab every maxStaleMs, since some drivers
  // under-report root damage (NVIDIA fullscreen flipping without a
  // compositor). `damaged` must be the pending (latched) state, not just
  // this tick's events -- see X11GrabGate.
  inline bool shouldGrabFrame(
    bool hasFrame, bool damaged,
    long long nowMs, long long lastGrabMs,
    long long minIntervalMs, long long maxStaleMs
  )
  {
    if(!hasFrame){
      return true;
    }
    const long long elapsedMs = nowMs - lastGrabMs;
    return elapsedMs >= (damaged ? minIntervalMs : maxStaleMs);
  }


  // Holds the damage latch around shouldGrabFrame (Aurora-es51): damage is
  // drained from the X server every tick, so damage seen on a tick the rate
  // cap blocks must stay pending until a grab consumes it -- otherwise the
  // last change of a burst inside the cap window is lost and a static
  // screen re-serves a stale frame.
  class X11GrabGate
  {
  public:
    X11GrabGate(long long minIntervalMs, long long maxStaleMs):
    m_minIntervalMs(minIntervalMs),
    m_maxStaleMs(maxStaleMs)
    {}

    // Folds this tick's damage into the latch and decides; a true result
    // must be followed by markGrabbed() once the grab succeeds.
    bool shouldGrab(bool damagedThisTick, long long nowMs)
    {
      m_pendingDamage = m_pendingDamage || damagedThisTick;
      return shouldGrabFrame(m_hasFrame, m_pendingDamage, nowMs, m_lastGrabMs,
        m_minIntervalMs, m_maxStaleMs);
    }

    void markGrabbed(long long nowMs)
    {
      m_hasFrame = true;
      m_pendingDamage = false;
      m_lastGrabMs = nowMs;
    }

    // The cached frame is no longer valid (monitor switch): next tick grabs.
    void reset()
    {
      m_hasFrame = false;
      m_pendingDamage = false;
    }

    bool hasFrame() const
    {
      return m_hasFrame;
    }

  private:
    long long m_minIntervalMs;
    long long m_maxStaleMs;
    bool m_hasFrame{false};
    bool m_pendingDamage{false};
    long long m_lastGrabMs{0};
  };
}
