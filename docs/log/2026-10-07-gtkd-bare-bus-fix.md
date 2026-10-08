# Aurora-gtkd closed: fake bare bus no longer activates the real xdg-desktop-portal

Id: gtkd-bare-bus-fix

2026-10-07. `PortalTokenTests`' `FakePortal(false)` started `dbus-daemon
--session` to mean "no ScreenCast portal", but the default session config
carries `<standard_session_servicedirs />`, so `ensureScreencastPortalProxy`
(`G_DBUS_PROXY_FLAGS_NONE`) activated the real `/usr/libexec/xdg-desktop-portal`
onto the fake bus. Test #55 hung to the 25s method timeout instead of settling
false in the 3s bound (25.08s, 0% CPU). Green on bare CI boxes, red only where
the portal is installed.

## Done

- Test-side fix (no production behavior change): the bare bus writes a temp
  config (session listen/auth/policy, empty servicedir) and launches with
  `--config-file=`; the serving fake keeps `--session`. Temp file is unlinked
  in `_stopBus`. `DO_NOT_AUTO_START` left as an owner decision, not taken.
- Verified on this portal-installed box: #55 alone settles false in ~0.03s,
  #54 alone passes, remaining 53 non-isolated cases pass (195 assertions).
  The 2 failures seen running all 55 in one binary are the known
  per-process-statics artifact — ctest runs one case per process.
- Lessons: resolved the open fix in "A fake bare D-Bus bus is not bare..."
  ([[lesson-input]]) to the landed config approach. New `mkstemp` footnote:
  the template must end in `XXXXXX` — a `.conf` suffix makes it fail.
