#pragma once

#include <functional>
#include <memory>
#include <string>

// Mac menu-bar presence (Aurora-qps.2): NSStatusItem + NSMenu (Launch UI /
// Pause or Resume / Stop), matching app/linux's TrayIcon and app/windows' Shell_NotifyIcon
// shape. PIMPL: every AppKit type stays inside TrayIcon.mm (Objective-C++)
// so this header -- and every C++ TU that includes it -- stays plain C++,
// the same boundary ScreenCaptureKitGrabber.hpp already established for
// input/mac.
//
// Unlike app/linux's TrayIcon, this owns no worker thread: NSStatusItem
// must live on the main thread, which app/mac's tick loop already owns, so
// there's no promise/future handoff to get wrong -- the class of bug
// Aurora-nzd hit on Linux (a std::promise moved into a worker thread, then
// the dtor calling get_future() on the moved-from object) doesn't apply
// here at all. Instead, pump() must be called in a loop on the main
// thread (main() runs it after handing the tick loop to a worker thread,
// Aurora-zlw: NSMenu tracking blocks inside pump(), so the two can't share
// a thread). pump() drains AppKit's event
// queue via -nextEventMatchingMask:/-sendEvent: in NSDefaultRunLoopMode
// (never common modes -- registering anything in kCFRunLoopCommonModes
// breaks NSEventTrackingRunLoopMode/menu tracking, the tao-apps/tao#1324
// failure mode). A bare CFRunLoopRunInMode call was tried first
// (Aurora-qps.2) and was enough for status-item clicks (Aurora-qps.1's
// probe verified that shape), but never delivered Apple Events -- Aurora-
// qps.7 needed the reopen event LaunchServices sends on a second launch,
// found -sendEvent: is the actual dependency (a throwaway probe confirmed
// this empirically, isolating pump mechanism from accessory status and
// handler style) and switched to this shape instead.
namespace Aurora::App
{

class TrayIcon
{
public:
  // onLaunch/onStop/onTogglePause run synchronously on whichever thread
  // calls pump() -- always the main thread, since AppKit requires it. Keep
  // them trivial (openWebBrowser / setting a flag), same precedent as
  // app/linux and app/windows. Pause/Resume takes seconds, so
  // onTogglePause must only post the request (Aurora-5ipy.14). isPaused is
  // read on the main thread each time the menu opens (NSMenuDelegate), so
  // the label is always current: lock-free only.
  TrayIcon(std::string url, bool webUiBound,
           std::function<void()> onLaunch, std::function<void()> onStop,
           std::function<void()> onTogglePause, std::function<bool()> isPaused);
  ~TrayIcon();

  TrayIcon(const TrayIcon&) = delete;
  TrayIcon& operator=(const TrayIcon&) = delete;

  // Services AppKit events (status item clicks, menu tracking, Apple
  // Events): waits up to timeoutSeconds for the first one, then drains
  // whatever else is queued. Main thread only. While a menu is open this
  // call does not return (NSMenu tracking is nested inside -sendEvent:),
  // which is why the pipeline tick loop lives on its own thread
  // (Aurora-zlw) rather than sharing this one.
  void pump(double timeoutSeconds);

  // Dismisses an open status-item menu, if any, so a blocked pump() call
  // returns. Safe to call from any thread (hops to the main queue) -- the
  // stop paths that don't originate in the menu (/api/stop, SIGINT) need it,
  // or shutdown would wait on a menu the user hasn't closed. The Mac analog
  // of app/windows' WM_CANCELMODE in TrayIcon's destructor.
  void cancelMenuTracking();

  // Public only so TrayIcon.mm's Objective-C menu-action target (a real
  // NSObject, can't live behind this PIMPL boundary itself) can be typed
  // against it -- never named outside that TU. Same reasoning as
  // ScreenCaptureKitGrabber.hpp's Impl.
  struct Impl;

private:
  std::unique_ptr<Impl> m_impl;
};

} // namespace Aurora::App
