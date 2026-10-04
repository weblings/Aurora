#pragma once

#include <filesystem>
#include <functional>
#include <string>

#include <gio/gio.h>

// Linux notification-area presence via StatusNotifierItem (Aurora-lx4.2):
// registers org.kde.StatusNotifierItem on the session bus with IconName
// "aurora" (resolved through the installed hicolor theme -- no pixmap
// encoding) and serves a com.canonical.dbusmenu menu (Launch UI / Pause or
// Resume / Stop).
// Best-effort by design: no session bus or no watcher (stock GNOME) means
// silently no icon, and the app still serves the WebUI. Owns a worker
// thread running the GMainLoop (HttpServerThread precedent); destruction
// quits, joins, and unregisters. Non-copyable.
namespace Aurora::App
{

// gio is linked PUBLIC on AuroraApp, so dependents get its flags; the tray
// API is inherently glib-typed and does not pretend otherwise.

class TrayIcon
{
public:
  // onLaunch/onStop/onTogglePause run on the D-Bus worker thread; keep them
  // trivial (openWebBrowser / setting a flag, per existing precedents).
  // Pause/Resume takes seconds, so onTogglePause must only post the request
  // (Aurora-5ipy.16). isPaused is read on that thread too: lock-free only.
  TrayIcon(std::string url, bool webUiBound,
           std::function<void()> onLaunch, std::function<void()> onStop,
           std::function<void()> onTogglePause, std::function<bool()> isPaused);
  ~TrayIcon();

  TrayIcon(const TrayIcon&) = delete;
  TrayIcon& operator=(const TrayIcon&) = delete;

  // Best-effort: true once the worker is engaged, whether or not a tray
  // host actually shows the icon (stock GNOME has none -- see lx4).
  bool active() const { return m_worker != nullptr; }

  // Tells the host to re-fetch the menu (label flip after a state change
  // made elsewhere: Dashboard, API). Thread-safe; no-op without a bus.
  void refresh();

  // Test seam: the dbusmenu layout (root id 0, children Launch UI id 1 /
  // Pause-or-Resume id 3 / Stop id 2). Caller owns the returned reference.
  static GVariant* menuLayoutForTest(bool webUiBound, bool paused);

private:
  std::string m_url;
  bool m_webUiBound{false};
  std::function<void()> m_onLaunch;
  std::function<void()> m_onStop;
  std::function<void()> m_onTogglePause;
  std::function<bool()> m_isPaused;
  struct Worker;
  Worker* m_worker{nullptr};
};

} // namespace Aurora::App
