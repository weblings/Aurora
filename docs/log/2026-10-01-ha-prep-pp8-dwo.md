# Aurora-pp8, Aurora-dwo: first two HA prep items implemented

Id: ha-prep-pp8-dwo

Items 1 and 2 of [[home-assistant-output]]'s prep work. dwo closed after the
Mac configure; pp8 closed after the Mac checks (the acceptance premise that the
prompt shows our string was wrong; see the Mac verification section).

## Change

- `Aurora-pp8`: `NSLocalNetworkUsageDescription` added to
  `app/mac/Info.plist.in` ("light bridge and Home Assistant", not Hue by
  name, so one string covers both outputs). Already missing for Hue.
- `Aurora-dwo`: `find_package(httplib 0.46 QUIET)` in `core/CMakeLists.txt`.
  0.46 is the first release with `httplib::ws::WebSocketClient`; an older
  system copy is now ignored and the fetched 0.46.0 is used.

## Verification

- pp8: plist still well-formed (`xmllint`, version placeholders
  substituted). Built bundle and prompt: see the Mac section below.
- dwo: scratchpad project with fake httplib config packages: none and 0.18.0
  not found (fetch path); 0.46.0 and 0.50.1 found. Real `core` configure
  with the fake 0.18.0 on the prefix path printed the fetch message and
  configured and generated cleanly. Not checked: Windows and Mac configures,
  and the real httplib `ConfigVersion` file (fakes copy its
  `VERSION_GREATER` rule).

## Findings

- Branch `feat/HAPrep` appeared mid-session without a checkout from the
  agent; pp8 landed on it on top of the h45.10 note commit.
- Lesson: an unversioned `find_package` accepts any system copy
  (`build-toolchain`).

## dwo: Windows and real-ConfigVersion check

- Windows (MSVC, VS 2022): `cmake .` in `build/core-test` with no system
  httplib printed the fetch message and configured; `AuroraNetworkTests`
  built against the fetched 0.46.0 (see `ha-prep-d9v`).
- Real `httplibConfigVersion.cmake` (httplib 0.46.0 built with
  `HTTPLIB_INSTALL=ON`, installed to a scratch prefix, on `CMAKE_PREFIX_PATH`):
  `find_package(httplib 0.46)` found 0.46.0; `find_package(httplib 0.47)`
  rejected it. This confirms the version rule on the real file, not the
  fakes. Only the 0.46.0 install was tried; no genuinely older release.
- Not checked: Mac configure; a real `core` configure against the installed
  copy (standalone configure failed at an unrelated `find_package`, line 14).
- Lesson: a scratch CMake tree under the long session temp path breaks MSBuild
  (MSB6003 tlog path); use a short path for scratch configures on Windows.

## Mac verification (2026-10-01)

- dwo: `cmake -S core -B build/core-tests -DBUILD_TESTS=ON` printed the fetch
  message (no system httplib; Homebrew has none), configured, and
  `_deps/httplib-src/httplib.h` is 0.46.0. The older-copy-ignored case was
  not re-run on Mac; the version rule is the same file checked on Windows.
- pp8: `build/mac-app` rebuilt; `plutil -p bin/Aurora.app/Contents/Info.plist`
  shows `NSLocalNetworkUsageDescription` with the new string. A copy of the
  app with a unique bundle ID and a unique executable UUID, ad-hoc signed,
  got a Local Network prompt on macOS 27.0.1 when its `/api/hue/validate`
  endpoint was pointed at a non-gateway LAN host. The dialog read "Allow
  "Aurora" to find devices on local networks? This will allow the app to
  discover, connect to, and collect data from devices on your networks."
  That is system text; our string was not shown. The acceptance criterion
  "the prompt shows the string" assumed iOS behaviour and is replaced by
  "key present in the built bundle, and Aurora gets the prompt".

### Findings (Mac Local Network prompt)

- The prompt did not fire for: a terminal-launched binary, `curl` from a
  shell (Terminal-run tools are exempt, per Apple/Eclectic Light), or traffic
  to the default gateway (`192.168.0.1` answered with no prompt).
- Copies made with `cp -R` and a new `CFBundleIdentifier` share the original's
  executable UUID; Apple's TN3179 says local network privacy uses that UUID.
  Those copies were denied with no visible prompt (instant `unreachable`
  from the app, Settings entries off). A copy with a patched `LC_UUID` and
  fresh bundle ID prompted normally.
- There is no reset: `tccutil` does not cover Local Network (Apple DTS:
  "no good way to reset local network privacy on the Mac"); use a new bundle
  ID, a new user account or a VM. An earlier line here claiming `tccutil`
  could reset it was wrong and has been removed.
- A macOS 27.0b4 bug (rdar 181140179) is reported to cause local network
  privacy problems; not checked whether 27.0.1 still has it.
