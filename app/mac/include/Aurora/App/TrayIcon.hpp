#pragma once

#include <functional>
#include <memory>
#include <string>

// Mac menu-bar presence (Aurora-qps.2): NSStatusItem + NSMenu (Launch UI /
// Stop), matching app/linux's TrayIcon and app/windows' Shell_NotifyIcon
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
// here at all. Instead, pump() must be called once per tick-loop
// iteration -- the AppKit analog of Windows' PeekMessage/DispatchMessage
// pump (app/windows/src/main.cpp:1176-1181). The .mm scopes its run-loop
// call to kCFRunLoopDefaultMode only, never kCFRunLoopCommonModes --
// registering observers there breaks NSEventTrackingRunLoopMode (menu
// tracking), the tao-apps/tao#1324 failure mode -- and this shape was
// verified against a throwaway probe before being wired in here
// (Aurora-qps.1: NSStatusItem/menu construct with no NSApplicationMain, no
// bundle, no signing; a manual click test confirmed both menu items
// dispatch and the menu doesn't auto-dismiss).
namespace Aurora::App
{

class TrayIcon
{
public:
  // onLaunch/onStop run synchronously on whichever thread calls pump() --
  // in practice always the main thread, since AppKit requires it. Keep
  // them trivial (openWebBrowser / setting the stop flag), same precedent
  // as app/linux and app/windows.
  TrayIcon(std::string url, bool webUiBound,
           std::function<void()> onLaunch, std::function<void()> onStop);
  ~TrayIcon();

  TrayIcon(const TrayIcon&) = delete;
  TrayIcon& operator=(const TrayIcon&) = delete;

  // Services any pending AppKit events (status item clicks, menu tracking)
  // without blocking the caller for more than the given slice. Call once
  // per tick-loop iteration.
  void pump();

  // Public only so TrayIcon.mm's Objective-C menu-action target (a real
  // NSObject, can't live behind this PIMPL boundary itself) can be typed
  // against it -- never named outside that TU. Same reasoning as
  // ScreenCaptureKitGrabber.hpp's Impl.
  struct Impl;

private:
  std::unique_ptr<Impl> m_impl;
};

} // namespace Aurora::App
