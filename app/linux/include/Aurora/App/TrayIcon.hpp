#pragma once

#include <filesystem>
#include <functional>
#include <string>

#include <gio/gio.h>

// Linux notification-area presence via StatusNotifierItem (Aurora-lx4.2):
// registers org.kde.StatusNotifierItem on the session bus with IconName
// "aurora" (resolved through the installed hicolor theme -- no pixmap
// encoding) and serves a com.canonical.dbusmenu menu (Launch UI / Stop).
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
  // onLaunch/onStop run on the D-Bus worker thread; keep them trivial
  // (openWebBrowser / setting the stop flag, per existing precedents).
  TrayIcon(std::string url, bool webUiBound,
           std::function<void()> onLaunch, std::function<void()> onStop);
  ~TrayIcon();

  TrayIcon(const TrayIcon&) = delete;
  TrayIcon& operator=(const TrayIcon&) = delete;

  // Best-effort: true once the worker is engaged, whether or not a tray
  // host actually shows the icon (stock GNOME has none -- see lx4).
  bool active() const { return m_worker != nullptr; }

  // Test seam: the static dbusmenu layout (root id 0, children Launch UI
  // id 1 / Stop id 2). Caller owns the returned reference.
  static GVariant* menuLayoutForTest(bool webUiBound);

private:
  std::string m_url;
  bool m_webUiBound{false};
  std::function<void()> m_onLaunch;
  std::function<void()> m_onStop;
  struct Worker;
  Worker* m_worker{nullptr};
};

} // namespace Aurora::App
