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
  // frame yet, reuse when nothing damaged the monitor, and on a busy
  // screen grab at most every minIntervalMs (the 11 ms full-buffer
  // decimate at 4K would otherwise eat the whole tick budget).
  inline bool shouldGrabFrame(
    bool hasFrame, bool damaged,
    long long nowMs, long long lastGrabMs, long long minIntervalMs
  )
  {
    if(!hasFrame){
      return true;
    }
    if(!damaged){
      return false;
    }
    return (nowMs - lastGrabMs) >= minIntervalMs;
  }
}
