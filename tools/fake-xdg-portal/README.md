# Fake xdg-desktop-portal ScreenCast (dev-only test harness)

Reproduces the screencast portal's denial and error paths offline, with no
Wayland session and nobody clicking Deny. Built for upstream findings 5, 9,
10 and 6 in `docs/planning/UpstreamFindings.md` (bead `Aurora-h45`); method
in the `docs/lessons/input.md` entry on testing portal failure paths offline.
The other findings' checks are in `tools/huenicorn-checks`.

- `fake_portal.py`: Python/Gio fake that owns `org.freedesktop.portal.Desktop`
  and serves `org.freedesktop.portal.ScreenCast`. Each `MODE` denies one step
  (`Response` code 1) or fails one call (D-Bus error).
- `driver.cpp`: links huenicorn's real `XdgDesktopPortal.cpp`. It copies
  `PipewireGrabber`'s constructor wait and `_stop()` teardown, with the
  wait bounded by a timeout.
- `shim/`: stand-in `Config.hpp` (restore token only), so no nlohmann/json.
- `run.sh`: builds the driver and runs each mode on its own private
  `dbus-run-session` bus, so the real portal is never touched.

Needs Linux, `g++`, `pkg-config` + gio-unix-2.0 dev headers, `python3-gi`,
`dbus-run-session` and `gdbus`.

## Run

```sh
./run.sh                                  # huenicorn-fork working tree, all modes
./run.sh --ref origin/develop             # portal .cpp from a git ref
./run.sh --asan --ref fix/portal-failure-handling deny-create error-select
```

- `--src DIR`: the huenicorn checkout. Defaults to `$HUENICORN_SRC`, then a
  `huenicorn-fork` folder next to this repo.
- `--ref REF`: take only `XdgDesktopPortal.cpp` from `REF`; headers come from
  the checkout, so no branch switch is needed.
- `--asan`: AddressSanitizer + LeakSanitizer (finding 6 is a leak).
- `--timeout SECS` (default 5): how long the driver waits on the promise.

Builds go to `build/<ref>[-asan]/` (gitignored). The script exits non-zero
on a crash, a sanitizer report, or a fake that never got the bus name.
An unsettled promise exits 0, because on `develop` that's the expected result.

## Modes and expected results

| Mode | `origin/develop` | `fix/portal-failure-handling` |
|---|---|---|
| `ok` | settled true (ASan: 16 B leak, finding 6) | settled true |
| `deny-create` | segfault (finding 5) | settled false |
| `deny-select` | unsettled (finding 9) | settled false |
| `deny-start` | settled false | settled false |
| `error-create` | unsettled (finding 10) | settled false |
| `error-select` | unsettled (finding 10) | settled false |
| `error-start` | settled false | settled false |
| `error-open-remote` | unsettled (finding 10) | settled false |

Both columns were verified on 2026-10-01 (GLib 2.80).

## Gotchas

- The driver is built `-O0` because huenicorn's portal thread spins on a
  plain `bool` (`updateXdgContext`) that the optimizer may hoist out of the loop.
- `driver.cpp`'s `initCapture` is a hand copy of
  `PipewireGrabber::_initCapture`; re-sync it if upstream changes that method.
- Aurora's own port (`input/linux/src/XdgDesktopPortal.cpp`) had the same
  bugs (`Aurora-p91`, fixed), but its API differs from huenicorn's, so this
  driver doesn't link against it. Its regression tests are the failure cases
  in `input/linux/tests/PortalTokenTests.cpp` (in-process fake portal).
