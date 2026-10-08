# macOS GUI (AppKit, tray, run loop)

Id: lesson-macos-gui

Menu-bar/status-item, run-loop-pumping, and Objective-C++ interop gotchas hit while building Mac tray-parity (`Aurora-qps`). See [README.md](README.md) for filing rules.

---

## An app that pumps its own run loop instead of calling `-run` must call `-finishLaunching` explicitly, or the first UI event goes unserviced
Tags: macos, appkit, runloop, nsstatusitem
Applies-when: adding NSStatusItem/other AppKit UI to a binary whose main loop isn't `NSApplicationMain`/`[NSApp run]`

`-[NSApplication run]` normally calls `-finishLaunching` as part of its own
startup sequence, completing AppKit's handshake with the WindowServer.
Aurora's tick loop drives its own loop instead (`pipelineHost.tick()` +
`sleep_until`, `CFRunLoopRunInMode` pumped alongside it, not `-run`), so
that handshake never happens implicitly. A first throwaway probe
(`NSStatusItem` + menu, no `-finishLaunching` call) built and ran with no
crash and no error, but a manual click test left it unclear whether the
first click would actually be serviced. Re-ran with an explicit
`[NSApp finishLaunching]` call added right after
`[NSApplication sharedApplication]`/`setActivationPolicy:`, before
constructing the status item — confirmed via manual click that both menu
items dispatch and the menu doesn't auto-dismiss.

**Fix:** any code path that builds AppKit UI (status items, menus, windows)
without ever calling `-run` needs an explicit `[NSApp finishLaunching]`
once, before the first UI object is created. Cheap to add, easy to miss
since nothing errors or crashes without it — the failure mode is silent
non-responsiveness, not a hard failure.

---

## `CFRunLoopRunInMode` observers/timers registered in `kCFRunLoopCommonModes` break `NSStatusItem` menu tracking
Tags: macos, appkit, runloop, nsstatusitem, nsmenu
Applies-when: manually pumping a run loop (a `PeekMessage`-style non-blocking drain) alongside AppKit UI

Not hit directly in this repo, but load-bearing for the design and worth
recording since it shaped `TrayIcon::pump()`'s scoping deliberately: when a
menu is open, AppKit runs a nested loop in `NSEventTrackingRunLoopMode`.
`kCFRunLoopCommonModes` includes that mode, so any custom run-loop
observer/timer registered there (a real bug hit by a third-party project,
tauri-apps/tao#1324) fires *during* menu tracking and can prematurely end
it — the menu closes right after opening. Aurora's `pump()` (first a bare
`CFRunLoopRunInMode`, later a `-nextEventMatchingMask:`/`-sendEvent:`
drain — see the Apple Event entry below for why it changed) only ever
touches `kCFRunLoopDefaultMode`/`NSDefaultRunLoopMode` — the same mode,
Foundation's name for it — never common modes, so this doesn't apply as
written in either version, but the scoping was deliberate, not
incidental, and worth preserving if this code ever grows a custom
observer/timer.

**Fix:** if a future change needs to register a run-loop observer or timer
alongside `NSStatusItem`/`NSMenu` UI, scope it to `kCFRunLoopDefaultMode`
(+ `NSModalPanelRunLoopMode` if modal dialogs need the same treatment) —
never `kCFRunLoopCommonModes` — or menu tracking silently breaks.

---

## Apple Events (including LaunchServices' reopen event) need `-sendEvent:` — bare `CFRunLoopRunInMode` never delivers them
Tags: macos, appkit, runloop, appleevent, reopen, nsapplicationdelegate
Applies-when: a manually-pumped app (no `-run`/`NSApplicationMain`) needs to catch `applicationShouldHandleReopen:` or any other Apple Event

`TrayIcon::pump()` shipped first as a bare
`CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0, true)` call, which was
enough to service `NSStatusItem` clicks (a throwaway probe confirmed
this). It never delivered Apple Events, though — specifically, the
`kAEReopenApplication` event LaunchServices sends to an already-running
app on a second launch (relevant here because macOS's own
single-instance-per-bundle behavior means that's the *only* signal an
already-running Mac app gets about a second launch attempt; unlike
Windows/Linux, no second process ever spawns to notice the same thing
itself). First suspected this might be an `LSUIElement`/accessory-app
quirk (no Dock icon to reactivate), but isolated with two throwaway probe
bundles testing both `applicationShouldHandleReopen:` (delegate) and a
raw `NSAppleEventManager` registration, as both accessory and regular
(Dock-visible) apps: **neither handler style fired under the
`CFRunLoopRunInMode` pump, regardless of accessory status** — ruling out
an LSUIElement-specific cause and pointing at the pump mechanism itself.
Apple Events route through `-[NSApplication sendEvent:]`, which bare
`CFRunLoopRunInMode` never calls; switching the probe's pump to a
`-nextEventMatchingMask:untilDate:inMode:dequeue:`/`-sendEvent:` drain
(same `NSDefaultRunLoopMode` scoping, so the common-modes/menu-tracking
constraint above still holds) made the standard delegate method fire
reliably — no need for the lower-level raw `NSAppleEventManager`
registration after all, once the pump itself was fixed.

**Fix:** a manually-pumped AppKit app needs `-nextEventMatchingMask:`/
`-sendEvent:` in its pump loop, not just `CFRunLoopRunInMode`, if it needs
to receive Apple Events (reopen, quit, URL-open, or any other). Worth
defaulting to the `-sendEvent:` shape from the start for any such app
rather than the narrower `CFRunLoopRunInMode` call, which only happens to
work for a subset of AppKit UI (menu/status-item interaction, verified
separately) and silently drops everything else with no error.

---

## `NSMenu` tracking is a nested, blocking loop inside `-sendEvent:` — if your main work loop shares a thread with the AppKit pump, opening a menu freezes it
Tags: macos, appkit, runloop, nsmenu, threading, windows
Applies-when: a single-threaded app drives both its own work loop and AppKit event pumping on the same thread, and has a menu (status-item or otherwise)

Asked whether a live visualization pausing while Aurora's tray menu was
open was real or just how it looked (see the debugging-method.md entry
on tapping the stream to check) — confirmed real via a timestamped log
of the relay's SSE stream: a clean multi-second gap in frame arrival,
exactly matching how long the menu was held open, resuming the instant
it closed. Root cause: `-[NSMenu popUpMenuPositioningItem:...]` (invoked
internally when the status item's click is delivered via `-sendEvent:`)
runs its own nested tracking loop in `NSEventTrackingRunLoopMode` and
does not return until the menu is dismissed. `TrayIcon::pump()` calls
`-sendEvent:` from inside Aurora's tick loop, on the same thread that
also runs `pipelineHost.tick()` — so the whole pipeline (capture,
process, output) is blocked for as long as the menu stays open, not just
AppKit event handling.

Checked whether this was Mac-specific before assuming so: it isn't.
`app/windows`'s tray menu (`TrackPopupMenuEx`, called from `trayWndProc`
via the same single-threaded `PeekMessage`/`DispatchMessage` pump the
tick loop uses) is documented Win32 behavior with the identical
shape — its own nested modal loop, blocking the calling thread until
dismissed. `app/linux`'s `TrayIcon` is structurally immune: it already
runs its `GMainLoop` on a dedicated worker thread, separate from the
main thread's tick loop, for an unrelated reason (`Aurora-nzd`'s
promise/future bug class). That separation happens to also isolate menu
tracking from the tick loop as a side effect Mac/Windows's simpler
single-thread design doesn't get.

**Fix:** there isn't a cheap one — this is a real architectural tradeoff,
not a bug in the usual sense. A single thread driving both a UI event
pump and a real-time work loop will always block the work loop for as
long as any native, OS-provided modal UI (menu tracking, `NSOpenPanel`,
`NSAlert`, `TrackPopupMenuEx`, common dialogs, etc.) is on screen. If
that's unacceptable, the work loop needs its own thread, separate from
whichever thread owns AppKit/the Win32 message loop (the mirror image of
Linux's split: there the *UI* got its own thread; here the *work loop*
would need to). Worth checking for this class of freeze early whenever a
manually-pumped single-thread app adds any native modal UI, not just a
tray menu specifically.

---

## `NSImage.isTemplate` discards RGB and uses only the alpha channel — a multi-color source doesn't lose its *shape*, only its color
Tags: macos, appkit, nsimage, template-image, icons
Applies-when: deciding whether an existing full-color icon/logo asset can serve as a menu-bar template icon

Assumed initially that Aurora's logo master (a black "A" letterform with a
multi-color aurora-wave gradient overlaid across it) couldn't become a
template icon without redrawing it as a flat silhouette — reasoning that
flattening it to `isTemplate` would collapse both shapes into "one
undifferentiated blob." That reasoning was wrong, and caught by a
correction, not self-caught: `isTemplate` reads only the *alpha* channel as
a mask; RGB is discarded entirely regardless of value. Since both the
black letterform and the colored wave are fully opaque, both silhouettes
survive the flattening — what's lost is the color distinction between
them, not either shape. Verified empirically (not just reasoned through)
with a throwaway CoreGraphics tool that simulated the real rendering
(alpha-threshold to solid black/white, composited on light/dark swatches)
at both 18px and 36px — legible at both sizes, no redraw needed.

**Fix:** before assuming a multi-color asset needs a redrawn/simplified
version for template-image use, check whether the color regions are
opaque (not semi-transparent) — if so, the combined *shape* survives
`isTemplate` rendering even though the color doesn't, and it's worth
actually rendering a simulation before concluding a new asset is needed.

---

## `template` is a C++ keyword — `NSImage`'s `template` property needs the explicit setter, not dot syntax, in Objective-C++
Tags: macos, appkit, objcxx, cpp-interop
Applies-when: setting NSImage's `isTemplate`/`template` property from a `.mm` file

`icon.template = YES` doesn't compile in an Objective-C++ (`.mm`)
translation unit — `template` is a reserved C++ keyword, and dot-property
syntax needs it as a bare identifier. Plain Objective-C (`.m`) doesn't hit
this since it isn't compiling against the C++ grammar at all.

**Fix:** use the explicit setter message instead of dot syntax:
`[icon setTemplate:YES]`. General pattern worth remembering when wrapping
any Cocoa API with a property name that happens to collide with a C++
keyword (`template`, `class`, `new`, `delete`, `private`, etc.) in a `.mm`
file.

---

## `UNUserNotificationCenter` categorically denies ad-hoc-signed apps, even `.provisional`, even on a bundle ID that's never been asked before
Tags: macos, appkit, usernotifications, codesigning, ad-hoc
Applies-when: requesting notification authorization from an ad-hoc-signed (no Team ID) `.app` bundle

Assumed (from research, not yet verified hands-on) that `.provisional`
authorization was a safe way to get first-run-notification plumbing
working under ad-hoc signing, with only a *real visible banner* actually
needing a stable identity — and that the risk with plain `.alert` was a
**stale denial** left over from an earlier ad-hoc build's different code
hash. Spiked it directly rather than trust that framing: built a
throwaway bundle with a bundle identifier that had never requested
notification authorization before, called
`requestAuthorizationWithOptions:UNAuthorizationOptionProvisional`.
Result: denied immediately, no dialog, `granted=NO`, error "Notifications
are not allowed for this application." `tccutil reset UserNotification
<bundle-id>` came back "No such bundle identifier" — TCC had never even
created a record for it, so there was nothing stale to reset. Ruled out
`LSUIElement`/accessory status as a factor too (identical denial as a
plain regular/Dock-visible app). This isn't a rebuild-instability risk a
reset can work around — it reads as a categorical block on any ad-hoc-
signed (`TeamIdentifier=not set`) app ever obtaining `UserNotifications`
authorization at all, `.provisional` included.

**Fix:** don't scope a "land the silent placeholder now, revisit the
banner once signing is stable" plan for `UserNotifications` under ad-hoc
signing — verify empirically first, the same way this was caught, since
neither half works without a real (even just a free Personal Team)
signing identity. Same underlying cause as the other signing-instability
findings this project has hit (TCC rebuild re-prompts, `SMAppService`) —
worth checking whenever a new feature turns out to touch code-identity-
gated APIs, since ad-hoc signing's failure mode tends to be "silently
denied/broken," not a clear error pointing at signing.


**Follow-up (Aurora-qps.5, 2026-09-30): a real signature alone did not fix it.** A probe app with a fresh bundle ID, hardened runtime and the Developer ID signature (Team ID set, timestamped) got the identical denial as the ad-hoc control: `.provisional` returned `granted=NO`, UNErrorDomain Code=1 "Notifications are not allowed for this application", `authorizationStatus` stayed 0 (notDetermined), no dialog. Same result exec'd directly and launched through `open` (LaunchServices). So the premise above that a stable identity unblocks this is unconfirmed; the actual cause is not established. `.alert` instead of `.provisional` (fresh bundle ID, Developer ID, launched via `open`, 90s window to answer a dialog) returned the same immediate denial and `authorizationStatus` 0. A probe written to the conventional lifecycle (real NSApplicationDelegate, `[NSApp run]`, center delegate set first, request from `applicationDidFinishLaunching`) was denied the same way both ad-hoc and Developer ID, and a Developer ID `.alert` probe double-clicked in Finder by the user (not launched from the agent shell) was denied with no dialog or banner. Community write-ups (e.g. the ducktape PR) say ad-hoc bundles can post notifications and the grant keys on bundle ID, so this machine's behaviour conflicts with them; cause not established. **Resolution (same day): a notarized, stapled probe in `~/Applications` worked.** The same Developer ID `.alert` probe, notarized (Accepted, stapled, `spctl` accepted) and copied to `~/Applications`, got the real system permission request (no immediate denial); after the user's first answer was not Allow the probe saw `authStatus=1` (an entry now existed), and once enabled in System Settings > Notifications a relaunch gave `granted=1`, `authStatus=2`, a successful post and `delivered count=1`. Notarization and the install location changed together, so which one matters is not established. Signed-but-unnotarized probes in the scratchpad (`/private/tmp/...`), launched every way tried, were all denied instantly with no dialog. Practical rule: test UserNotifications only with a notarized build run from an ordinary apps folder, treat a no-dialog immediate denial as "not eligible", and keep delivery best-effort. The user first mistook the permission dialog for the probe itself; the dialog has no app icon and looks like a system prompt.
---

---

## macOS's temp dir is `$TMPDIR` (`/var/folders/...`), not `/tmp`; a hardcoded `/tmp` path silently misses it
Tags: macos, tmpdir, config-root, scripts
Applies-when: a script or doc hardcodes `/tmp/...` for a path the app derives from the platform temp dir (e.g. `--fresh`'s config root)

`devstack.py` copied the zone map to `/tmp/aurora-fresh/profiles/` on non-Windows, following the Linux-shaped README. On Mac the app's `--fresh` root is `$TMPDIR/aurora-fresh`, so the copy landed in a directory the app never reads. Nothing errored; frames just never flowed (compounded by an unset input leaving the pipeline idle), so `up` only timed out. The app's own startup line (`Config root: ...`) had the true path all along.

**Fix:** derive the path from the platform temp dir (`tempfile.gettempdir()`, `${TMPDIR:-/tmp}`), and when scripting against the app, read the path it logs rather than assuming it.

---

## The hardened runtime rejects ad-hoc or other-team dylibs ("different Team IDs"), so an app linked against Homebrew libraries can't launch under it
Tags: macos, codesign, hardened-runtime, library-validation, dylib
Applies-when: signing with `--options runtime` (required for notarization) an app that loads dylibs it didn't sign itself

Library validation lets a hardened process load only Apple-signed libraries or ones with the *same Team ID*. Aurora's mac binary links `/opt/homebrew/...` dylibs (ad-hoc, no Team ID), so `codesign --options runtime --sign -` gave a launch-time dyld abort: "code signature ... not valid for use in process: mapping process and mapped file (non-platform) have different Team IDs". Bundling the dylibs into `Contents/Frameworks` and rewriting them to `@rpath` fixed the *path* but not this: ad-hoc-signed app and ad-hoc-signed dylibs still share no Team ID, so they were rejected too. `com.apple.security.cs.disable-library-validation` makes both launch, at the cost of weakening the runtime.

**Fix:** for distribution, bundle the dylibs and sign app and every dylib with the same Developer ID (Team ID) so validation passes with no entitlement; treat `disable-library-validation` as a dev-loop stopgap. Bundled-and-shared-Team-ID case was not yet verified (no cert at the time).


**Confirmed removable (Aurora-qy5.6.4, 2026-09-30):** with the app and all 28 bundled dylibs signed by one Developer ID (Team ID 464U3WR286), a copy signed with `bundle-dylibs.sh` and *no* `--entitlements` launched under the hardened runtime and stayed up; `lsof` showed 28 bundled dylibs mapped and none from `/opt/homebrew`, and `codesign -d --entitlements -` showed no entitlements. The entitlement is only needed for ad-hoc or mixed-Team-ID bundles.

**Removed and shipped (2026-09-30):** `app/mac/Aurora.entitlements` is now an empty dict, and the notarized 1.0.4 bundle (submission `fc89af97-f64e-4609-8401-b4897cb9a614`, Accepted) has no entitlements (`codesign -d --entitlements -` prints just `[Dict]`). It launched, mapped the 28 bundled dylibs and none from `/opt/homebrew`, and the full fake-hue + relay + viz chain ran on it with no new permission prompts. Real Screen Recording / audio capture and Hue streaming were not re-run on it. A library `dlopen`ed at runtime that is not signed by the same Team ID would now fail with a library-validation error; none appeared. The default ad-hoc dev build never read this file (no hardened runtime), so only the Developer ID path changed.
---

## Screen Recording is granted to the responsible process, not the binary; launched from an editor, a missing grant stalls capture silently
Tags: macos, tcc, screen-recording, responsible-process, devstack
Applies-when: running Aurora (or any capture app) from VS Code's terminal, an agent, or a script and capture produces no frames

TCC attributes the Screen Recording request to the *responsible process*, which for an app started from VS Code's shell is VS Code. With `activeInputName=mac` and VS Code lacking the grant, the pipeline stopped emitting frames but the app stayed alive: no crash, no error (app log buffered/empty). After granting VS Code Screen Recording and restarting the stack, frames flowed and tracked screen content. A Terminal or Finder launch would attribute to that app instead.

**Fix:** when capture is silent and the process is alive, check which app is responsible for the launch and grant *that* app Screen Recording (restart the stack after). Don't chase the pipeline code first.

The converse bit a denied-state test on 2026-10-05: `tccutil reset ScreenCapture com.aurora.app` (it reported success, so a grant for Aurora's own identity did exist) followed by `devstack.py up` still captured the real display, because the app was a child of the terminal and ran under the terminal's grant. Aurora's own grant, the one a user's double-click uses, never came into play. Denied-state checks (permission error UI, failed resume, refused mode switch) therefore need `Aurora.app` launched on its own (`open build/mac-app/bin/Aurora.app --args ...` or Finder), after the `tccutil reset`. The fake bridge, relay and viz from `devstack` are fine to keep running under a hand-launched app.

---

## `plutil -lint` accepts an entitlements file that `codesign` rejects; a `--` inside an XML comment is enough
Tags: macos, codesign, entitlements, plist, amfi
Applies-when: writing or hand-editing an `.entitlements` (or any plist codesign parses), especially with comments

`app/mac/Aurora.entitlements` linted OK with `plutil -lint`, but `codesign --entitlements` failed with `Failed to parse entitlements: AMFIUnserializeXML: syntax error near line 12`. The culprit was a `--` used as a dash inside an XML comment, which is illegal XML that plutil tolerates and AMFI's stricter parser does not. Worse, the failed `codesign` left the *previous* signature in place, so the launch test that followed still ran and "passed" against a binary that never got the entitlements.

**Fix:** no `--` inside XML comments in plists codesign reads. After signing, confirm the result actually took (`codesign -d --entitlements - <app>` shows the keys, `codesign -dvv` shows the `runtime` flag) before trusting any launch test, and run the negative case (same signing without the entitlement fails) so the test can distinguish the two.

---

## A bundling check that only reads install names doesn't prove what dyld loads: a leftover absolute rpath silently wins over the bundle
Tags: macos, dyld, rpath, bundling, verification
Applies-when: copying dylibs into `Contents/Frameworks` and rewriting them with `install_name_tool`, then declaring the bundle self-contained

The first bundling prototype rewrote every direct dependency to `@rpath/...`, added `@executable_path/../Frameworks`, and reported "zero `/opt/homebrew` references" from `otool -L`. It launched. But `DYLD_PRINT_LIBRARIES=1` showed all 29 libraries loaded from Homebrew and none from the bundle: the binary still carried `LC_RPATH /opt/homebrew/lib`, listed *before* the bundle rpath, and several Homebrew dylibs carried absolute rpaths of their own. `@rpath/x` resolves through the first rpath that has the file, so the working machine's Homebrew always won. The result would have failed on any Mac without those libraries.

**Fix:** delete every existing `LC_RPATH` (`otool -l | awk '/LC_RPATH/...'` then `install_name_tool -delete_rpath`) and add only the bundle-relative one, and verify by *behaviour*: run a copy signed without the hardened runtime under `DYLD_PRINT_LIBRARIES=1` and count libs loaded from the bundle vs `/opt/homebrew` (DYLD_* variables are stripped under the hardened runtime, so the check needs the non-hardened copy). Better still, run on a machine without the libraries.

---

## `sandbox-exec` with a deny profile is a cheap way to prove an app doesn't need a directory (e.g. Homebrew), but only with a negative control
Tags: macos, sandbox-exec, verification, bundling, homebrew
Applies-when: you need evidence that a bundled app is self-contained and you have no clean Mac or VM to test on

`sandbox-exec -f deny.sb <binary>` with `(version 1)(allow default)(deny file-read* (subpath "/opt/homebrew"))` runs the app with reads under Homebrew refused, enforcing the check where `DYLD_PRINT_LIBRARIES` only observes it. The bundled Aurora.app launched and served; the unbundled build aborted in dyld on its first Homebrew library. Two things make it trustworthy: first confirm the profile bites (`sandbox-exec -f deny.sb /bin/ls /opt/homebrew/lib` -> "Operation not permitted"), and run the unbundled build as a control so a pass can't be a profile that denies nothing. It hides only what the profile names (not a clean Mac), the tool is deprecated, and it usually needs `(allow default)` so the app can otherwise run.

**Fix:** treat it as a strong approximation, not a substitute for a Homebrew-free machine. Record the profile, the sanity check and the control result together.


---

## NSMenu tracking blocks the pumping thread inside `-sendEvent:`, and a common-modes timer is not the fix here; move the tick loop, not the tray
Tags: macos, appkit, nsmenu, threading, runloop, tick-loop
Applies-when: an app that shares one thread between AppKit's event pump and a real-time loop shows a stall while a status-item or context menu is open

Holding the status-item menu froze frame delivery for exactly as long as it was open (Aurora-zlw). `[NSApp sendEvent:]` for the click enters NSMenu's tracking loop, nested and blocking, and returns only when the menu closes, so a `tick(); sleep_until(); pump();` loop can't tick. The Windows equivalent (`TrackPopupMenuEx`) was fixed by moving the *tray* to its own thread, but AppKit requires the main thread for the status item and menu, so on Mac the tick loop is what moves. The tempting single-thread alternative, a `CFRunLoopTimer` in `kCFRunLoopCommonModes` so ticks fire inside tracking mode, is ruled out by `TrayIcon.hpp`: registering anything in common modes breaks menu tracking (tao-apps/tao#1324), and the app never calls `[NSApp run]`, so it would also mean reworking the pump that Apple Events (qps.7 reopen) depend on.

**Fix:** tick loop on an RAII-joined worker thread (exception captured and rethrown on main), main runs `pump(timeout)` in a loop, `g_stopRequested` becomes `std::atomic<bool>`, main joins the worker and then calls `pipelineHost.shutdown()` so shutdown order is unchanged. Nothing else needed to change: `PipelineHost`'s mutex already covered `reload()` on the HTTP thread, SCStream delivers on its own dispatch queue, and only `TrayIcon.mm` touches AppKit. The worker calls `cancelMenuTracking()` (dispatch to the main queue, `[menu cancelTracking]`) on exit so a stop from `/api/stop` or SIGINT can't leave main blocked in an open menu; the Windows analog is `WM_CANCELMODE`. That `/api/stop`-with-menu-open path was not exercised separately in the Aurora-zlw session.

---

## An agent shell can't open a status-item menu on Mac; capture the stall with a human click and a timestamp script
Tags: macos, verification, accessibility, system-events, testing
Applies-when: you need to reproduce or verify menu-open behaviour on Mac from a non-interactive/dev shell

`osascript` driving System Events to click the status item failed with `Not authorized to send Apple events to System Events (-1743)`: the calling process has no Accessibility/Automation grant, and one can't be given from that shell. Windows' `traygap.py` avoids this by posting the tray window message directly; AppKit has no equivalent public route to open an `NSStatusItem` menu from outside the process.

**Fix:** `tools/light-viz-relay/traygap_mac.py` records SSE frame timestamps for a window, prompts for a manual click-and-hold, then reports every gap over 0.25s and PASS/FAIL. Keep the measurement automatic and only the click manual. (Aurora-zlw was closed on live user confirmation; the script's own gap numbers were not captured.)

---

## An unset deployment target means "the host OS", and bundled Homebrew dylibs carry it too, so `LSMinimumSystemVersion` alone proves nothing
Tags: macos, deployment-target, minos, homebrew, bundling, notarization
Applies-when: declaring a minimum macOS for a bundle, or claiming a bundled app runs on older Macs

Without `CMAKE_OSX_DEPLOYMENT_TARGET`, Aurora's binary was built with `minos 27.0` (the build machine's OS): it would refuse to launch on anything older, with nothing in the build output saying so. Setting it to 14.2 (the Core Audio process-tap floor, `AudioHardwareCreateProcessTap`) fixed our own code, but 27 of the 28 bundled Homebrew dylibs still reported `minos 27.0` (bottles target the host OS; one was 11.0), so the *bundle* still only runs on 27+ regardless of the plist. A plist claiming 14.2 over 27.0 dylibs is a false promise (Aurora-qy5.3; follow-up bead filed).

**Fix:** set the target in the preset and derive `LSMinimumSystemVersion` from the same variable; check by behaviour, not intent: `vtool -show-build <file>` for every Mach-O, compare the highest `minos` with the plist. `tools/mac/verify-bundle.sh` fails when the main binary needs more than the plist declares and warns when any bundled dylib does. Lowering the real floor needs the dylibs built from source with a lower target.

---

## A build step that re-links and re-signs can leave a mixed bundle when the previous build bundled dylibs; clear the derived state
Tags: macos, cmake, codesign, bundling, stale-state
Applies-when: switching signing identity (ad-hoc <-> named) or re-running bundle-dylibs.sh against an incremental build directory

Making the CMake signing identity a cache variable (Aurora-qy5.5) exposed this: a named-identity build runs `bundle-dylibs.sh` in POST_BUILD, which copies `Contents/Frameworks` and rewrites the binary's install names. If that run failed (bogus identity), or the build was later reconfigured back to ad-hoc, the next relink produced a fresh Homebrew-linked binary while the old `Frameworks/` and `bundled-dylibs.tsv` stayed in the bundle: dylibs no one loads, with the wrong signatures. `verify-bundle.sh` caught it ("binary still links against Homebrew"), the app itself would have launched fine.

**Fix:** the ad-hoc branch removes `Contents/Frameworks` and the manifest before signing (`cmake -E rm -rf`). General rule: any POST_BUILD step that adds things to the bundle needs a counterpart that clears them when the other mode runs, or the bundle's contents depend on build history.

---

## Homebrew license metadata is aggregate per package, and a keg may not ship the full text a license needs
Tags: macos, licenses, homebrew, gpl, bundling, compliance
Applies-when: generating third-party notices for dylibs bundled from Homebrew

`brew info --json=v2` reports one SPDX expression per formula. For `flac` it lists BSD/GPL/LGPL/ISC/public-domain combined; the bundled `libFLAC` is only the Xiph BSD-style one (the keg's README and `format.h` header say so: libraries BSD-like, programs GPL/LGPL). For `gcc`, `libgcc_s`/`libgfortran` are GPL-3+ with the GCC Runtime Library Exception 3.1, but `libquadmath` is LGPL (its header says Library General Public License). The gcc keg's `COPYING` is GPLv2 and it has no GPLv3 text at all, so the notice has to point to Aurora's own GPLv3 LICENSE. Aurora-qy5.7 checked these against the shipped headers/READMEs, not upstream sites; not a legal review.

**Fix:** `tools/mac/bundle-licenses.sh` copies every `LICENSE*/COPYING*/COPYRIGHT*/NOTICE*` from each keg, adds an "applies to what we bundle" note for the aggregate packages (flac, zstd, gcc), and fails when a keg has no license file. It runs before signing because files added after it invalidate the seal. Keep the per-package table in the script and re-verify it when versions change.

---

## `codesign` with a keychain key prompts once per signature until the key is authorized once; a multi-file signing script looks like a password loop
Tags: macos, codesign, keychain, developer-id, bundling, agent-workflow
Applies-when: running a script that signs many files (bundle-dylibs.sh, sign-notarize.sh) with a freshly created Developer ID key, especially from an agent session where the dialog appears on the user's screen

The first real-identity run of `sign-notarize.sh` signs 29 Mach-O files. Each `codesign` call asks for access to the private key in the login keychain, and clicking plain Allow authorizes only that call. The user saw the same "login keychain password" dialog over and over, read it as a wrong password, and interrupted the run twice (Aurora-qy5 cert prep). After one throwaway sign with **Always Allow**, the same script ran to the dry-run line with no prompts. Whether the password itself was ever rejected was not established.

**Fix:** before the first multi-file signing run, have the user sign one scratch file in their own terminal (`cp /bin/ls "$TMPDIR/sigtest" && codesign --force -s "<identity>" "$TMPDIR/sigtest"`) and choose Always Allow. Say this up front when launching such a script from an agent, so a burst of dialogs isn't mistaken for a failure. If the password really is refused, the login keychain password has drifted from the account password; change it in Keychain Access, and do not use Reset My Default Keychain, which deletes the signing key and the notarytool profile.

---

## Check signing credentials with the tools' own read-only commands before the first real run; identity names are not what a person would type
Tags: macos, codesign, notarytool, developer-id, verification
Applies-when: wiring up a new Developer ID certificate or notarytool keychain profile, or about to pass `--identity` / `--keychain-profile` to sign-notarize.sh

The identity string was `Developer ID Application: ANDREW BUTE GWINNER (464U3WR286)`: legal name with the middle name, in capitals, plus the Team ID. `security find-identity -v -p codesigning` showed 0 identities until the certificate was created through Xcode (Settings > Accounts > Manage Certificates), which also creates the private key, and 1 afterwards. `xcrun notarytool history --keychain-profile <name>` failed with "No Keychain password item found for profile" after a first `store-credentials` attempt that had not saved anything (cause not captured), and listed an empty history, exit 0, after the second. An empty list is the pass result for a new account; nothing has been submitted yet.

**Fix:** copy the identity from `find-identity` output rather than composing it, and treat `notarytool history` as the credential smoke test. Then run `sign-notarize.sh --dry-run` with the real identity: it exercises signing, `codesign --verify --strict` and `verify-bundle.sh` on all 29 files without contacting Apple, so the first upload is not also the first test of the signing path.

---

## `sort -V` ranks "27.0" above "27"; normalize versions before comparing, and re-test a version check when the format of an input changes
Tags: macos, shell, version-compare, deployment-target, verification
Applies-when: comparing macOS/minos versions in shell (verify-bundle.sh, CI checks) where one side may be written "27" and the other "27.0"

`verify-bundle.sh` failed a correct bundle: Info.plist `LSMinimumSystemVersion` was `27` (the integer deployment target) and the binary's `minos` was `27.0`; `sort -V | tail -1` picked "27.0", so "declared < needed". Every earlier run (ad-hoc, dry run with a real identity) had "14.2" on both sides, so the comparison had never seen mixed formats (Aurora-qy5.8). It failed safe, before any upload.

**Fix:** pad both to three components (`awk -F. '{printf "%d.%d.%d",$1,$2+0,$3+0}'`) and compare those. Test equal, lower and higher, and with mixed-format inputs, not only the format the last run happened to use.

---

## A `notarytool submit --wait` that dies with "Internet connection appears to be offline" leaves a live submission; recover by ID, do not resubmit
Tags: macos, notarytool, notarization, network, recovery
Applies-when: a notarization run ends with NSURLErrorDomain -1009 or an empty notary-result.json, or a laptop slept/lost network during the wait

The upload finished and Apple processed it, but the local `--wait` polling call failed when the machine went offline. `sign-notarize.sh` then printed "not accepted" with no submission ID (the JSON result was empty), which reads like a rejection. `xcrun notarytool history --keychain-profile <p>` listed the submission with its ID and `notarytool info <id> --keychain-profile <p>` showed `Accepted`.

**Fix:** check `history`/`info` before resubmitting. If Accepted, finish by hand on the already-signed bundle: `stapler staple` and `validate`, `spctl --assess --type execute -vv`, `codesign --verify --strict`, then `ditto -c -k --keepParent` for the final zip. The script should treat an empty status as "unknown, check history" rather than a rejection.

---

## Simulate a browser download on one Mac by hand-setting the quarantine attribute on the zip and unzipping in Finder
Tags: macos, gatekeeper, quarantine, notarization, verification
Applies-when: checking that a notarized, stapled app opens cleanly for someone who downloaded it, with no second Mac available

`spctl --assess` passing on a bundle you built locally does not exercise the first-launch path: Gatekeeper only runs its download check on files carrying `com.apple.quarantine`, which browsers, AirDrop and Mail set and local builds never get. Setting it by hand on a fresh copy of the zip (`xattr -w com.apple.quarantine "0083;$(printf '%x' $(date +%s));Safari;" <zip>`), unzipping by double-click in Finder (Archive Utility passes the attribute on to the extracted app; command-line `unzip`/`ditto` may not), then opening the app gave the normal notarized-app prompt ("Safari created this file ... Apple checked it for malicious software and none was detected") with an Open button, and the TCC Screen Recording dialog followed (Aurora-qy5 cert prep). The "Safari" and timestamp in that prompt come from the attribute you wrote, not a real download.

**Fix:** use a copy that has never been launched (a launched copy is already trusted), check `xattr <app>` lists `com.apple.quarantine` before opening, and treat "can't be checked / unidentified developer" as the failure. It approximates, not replaces, a real download on another Mac or a fresh user account.

---

## The macOS Local Network prompt is hard to trigger and impossible to reset, and does not show your `NSLocalNetworkUsageDescription`
Tags: macos, local-network, privacy, tcc, nslocalnetworkusagedescription, ad-hoc-signing, verification
Applies-when: testing that a Mac build gets the Local Network permission prompt, or acceptance says the prompt "shows" a reason string

Three separate things made a one-line acceptance check (Aurora-pp8) take
hours, each looking like "the prompt is broken":

1. **Most test traffic never prompts.** Loopback (so the fake Hue bridge),
   tools run from Terminal/SSH (so a shell `curl`, or running
   `Contents/MacOS/Aurora` directly), and traffic to the default gateway
   all produced no prompt. Launch the `.app` with `open` and point it at a
   non-gateway LAN host (`curl -X PUT .../api/hue/validate` with
   `{"bridgeAddress":"<neighbor IP from arp -an>"}`; the host need not be a
   bridge).
2. **There is no reset before macOS 27.2** (see the reset lesson below for 27.2's remove button and the script that automates the test copy). `tccutil` does not cover Local Network (Apple DTS:
   "no good way to reset local network privacy on the Mac"); state lives
   outside TCC and Settings toggles keep the entry. A new bundle ID gives a
   fresh prompt, but a `cp -R` copy with a changed `CFBundleIdentifier` still
   shares the executable UUID, which local network privacy uses (TN3179);
   those copies were denied with no prompt, the app saw an instant
   `unreachable` (2 ms where a real connect takes over a second), and the
   Settings entries were off. Also patch `LC_UUID` (rewrite the 16 bytes at
   the `LC_UUID` load command) and re-sign ad hoc.
3. **macOS shows its own text, not ours.** The dialog read "Allow "Aurora" to
   find devices on local networks? This will allow the app to discover,
   connect to, and collect data from devices on your networks." The
   `NSLocalNetworkUsageDescription` reason is an iOS-style field; on macOS
   it is still required (reports: macOS 26.7+ will not prompt a GUI app
   without it) but is not displayed.

**Fix:** write the acceptance as "key present in the built bundle's
`Info.plist` and the app gets the prompt", not "the prompt shows the string".
Check the key with `plutil -p`, and make test copies with both a new bundle ID
and a new `LC_UUID`.

---

## `SecItemDelete` on a legacy-keychain item returns `errSecInvalidOwnerEdit` (-25244) to an executable whose file name differs from the creator's, even with an identical signature
Tags: macos, keychain, secitemdelete, acl, codesign, developer-id, errSecInvalidOwnerEdit
Applies-when: a Keychain delete fails with "Invalid attempt to change the owner of this item" / -25244, or you are designing a Keychain test or update path across different binaries

Aurora-2dz's cross-binary check wrote an item with binary `A`, then read and overwrote it from `B` (same Developer ID, different build): both worked, with no prompt. `SecItemDelete` from `B` failed with -25244; only `A` could delete. It looked like "delete breaks after an app update". It does not. Apple DTS (developer forums thread 69841) says the file-based keychain shim compares the current app's *name* with the app name stored in the item's ACL; a mismatch gives this error. Re-running with the same file name (`d1/AuroraSecretsTests` writes, `d2/AuroraSecretsTests` deletes, and a new binary `rm`/`cp`'d over the same path deletes) succeeded every time. The Mac executable is `Aurora` across updates, so updates are safe; renaming it, or running a renamed copy, is not.

**Fix:** keep the shipped executable name stable and give test copies the same file name in different directories. If a delete does fail, the known fallbacks are `SecItemUpdate` to empty data, or `SecKeychainItemDelete` on an item found with `kSecReturnRef` (deprecated but works). Apple's longer-term answer is the data-protection keychain, which on a Developer ID build needs `keychain-access-groups` plus an embedded provisioning profile (without one the binary is killed at launch). See [[2dz-secret-store]].

---

## A legacy Keychain item's ACL can be dumped without reading the secret; it shows what a prompt will trust, and why one appears
Tags: macos, keychain, acl, partition-id, cdhash, codesign, developer-id, always-allow
Applies-when: a Mac build gets unexpected Keychain password prompts, or you need to confirm that an Allow / Always Allow click took effect

`security dump-keychain -a ~/Library/Keychains/login.keychain-db` lists attributes and ACL entries but not secrets (no `-d`). It prints the whole keychain, so filter it to the one service in a script (`Aurora/acl-check` in Aurora-2dz) and never paste the rest. An ad-hoc-created item showed: decrypt trusted for the creating app by `cdhash`; a `partition_id` entry `cdhash:<hash>`; and `change_acl` with no trusted apps, which is why extending the ACL asks for the login keychain password. Always Allow adds the new build's requirement to the app list and its id to the partition list (`cdhash:` for ad-hoc, `teamid:<TEAM>` for Developer ID). Plain Allow adds nothing, so the next launch prompts again. After one Always Allow on a Developer ID build, other builds with the same identifier and Team ID (and the same file name) read and deleted with no prompt. Two Aurora-2dz runs looked like "Always Allow does not stick"; the ACL dump showed it does when clicked, and the earlier clicks were not recorded.

**Fix:** to test Keychain access across builds, dump the ACL before and after each dialog instead of trusting memory of which button was clicked, time each read (0.02-0.3 s means no prompt, about 10 s means a dialog waited), and keep file name and path constant. See [[2dz-secret-store]].

---

## No badge/attention API exists for an `NSStatusItem`, and `NSDockTile.badgeLabel` doesn't apply to an `LSUIElement` app with no Dock icon
Tags: macos, nsstatusitem, tray, badge, dock, lsuielement
Applies-when: wanting a menu-bar icon to show an ambient "something needs attention" signal

Looking for a way to flag a tray error on the icon itself, without opening the menu (Aurora-k73j, [[error-overlay]]): `NSStatusBarButton` (the only thing `NSStatusItem` exposes for its appearance) is a plain `NSButton` wrapper, `.image`/`.alternateImage`/`.title`, with no badge or attention-state primitive. `NSDockTile.badgeLabel` is the closest OS-level analogue, but Aurora runs `LSUIElement` with no Dock icon at all (`app/mac/README.md`), so there's no Dock tile to badge in the first place, independent of the separate notification-permission gate that can silently suppress that badge even for apps that do have one.

**Fix:** there is no shortcut, an ambient signal on the icon itself has to be a hand-built icon swap or a manually composited overlay (bake a dot into a second image, or draw a small subview/layer on top of the existing button), not an API call. Since `template` is a per-`NSImage` property (`TrayIcon.mm:133`'s `setTemplate:YES`), a deliberately non-template "alert" variant can still show real color even though the normal icon stays a system-tinted silhouette.

---

## Objective-C method bodies in a `.mm` sit outside any C++ `namespace` block, so a project namespace must be spelled out there
Tags: macos, objective-c++, namespace, compile-error, tray
Applies-when: editing the `@implementation` section of `TrayIcon.mm` (or any `.mm`) that sits between `namespace X { ... }` blocks

`TrayIcon.mm` has two `namespace Aurora::App` blocks with the `@implementation` of the menu target and app delegate between them. Aurora-k73j's e9ea988 used `Runtime::trayPauseItemLabel` inside `-menuNeedsUpdate:` and `-onTogglePause:` because the surrounding C++ code reads that way; the methods are outside the namespace, so Clang says `use of undeclared identifier 'Runtime'; did you mean 'Aurora::Runtime'?`. The commit had only been built on Linux and Windows, so it sat broken on Mac until the Mac manual pass built it.

**Fix:** inside an `@implementation` write `Aurora::Runtime::` / `Aurora::App::` in full, or call a plain-C++ function in the namespaced part. The second is better: `resolveTrayPauseClick` (`TrayClick.cpp`) takes the decision out of the ObjC method, where the namespace trap is, and makes it unit-testable.

---

## NWBrowser says nothing about Local Network permission on macOS 27: it reports `ready` and sees its own advertisement while denied; a UDP send to mDNS or any LAN connect fails with `EHOSTUNREACH`
Tags: macos, local-network, nwbrowser, bonjour, ehostunreach, permission-detection
Applies-when: detecting whether Local Network access is granted, or reading an NWBrowser/NWListener state as a permission signal

Aurora-o1qt shipped two probes that read `NWBrowser` state and both reported "granted" with the toggle off. Docs and forum posts say the browser goes `ready`, then `waiting(-65570: PolicyDenied)`. On macOS 27 it never reached `waiting`, and an `NWListener` plus `NWBrowser` round trip saw its own advertisement at once. Logging showed the real signal: with the permission off, a non-blocking TCP `connect()` to the bridge and a `sendto()` of an empty UDP datagram to 224.0.0.251:5353 both failed immediately with errno 65. The send is side-effect-free and needs no known LAN host. Note the pending-prompt window also looks denied, so keep retrying for a while after launch. A Mac with no network fails differently (not 65), which maps to unknown.

**Fix:** decide from the send (`LocalNetworkProbe.mm`, mapping in `statusFromSend`). Flipping the toggle in System Settings takes effect in the running app (the next send succeeds), so a 2 s re-check clears the shell's `local_network` condition with no relaunch (Aurora-rbp3). The send also raises the prompt: TN3179 lists a UDP multicast send as a local network operation, and a build with the browse disabled still prompted (Aurora-dwvu). The Bonjour browse o1qt added "to raise the prompt" is redundant (removal: Aurora-awcg). Test any such probe with the toggle off before trusting it; the forum recipe was wrong here.

---

## Resetting the Local Network permission: no `tccutil`, no per-app reset; a changed bundle ID plus a patched `LC_UUID` is the practical route
Tags: macos, local-network, tccutil, reset, lc-uuid, testing
Applies-when: you need the Local Network prompt to appear again, or a "reset all permissions" step is being written

`tccutil reset ScreenCapture|AudioCapture <bundle id>` works. Local Network is not in TCC: state lives in `/Library/Preferences/com.apple.networkextension.plist`, kept per user. Apple DTS says there is no good way to reset it. Deleting the plist on a running Mac fails (cfprefsd rewrites it at shutdown); deleting from macOS Recovery works but resets every app and can disturb VPN and Find My settings. A fresh user account or a VM snapshot also work and are slow.

macOS 27.2 changes this: TN3179 (rev. 2026-10-06) says the System Settings > Privacy & Security > Local Network list gains +/- buttons, and removing an app resets it. Earlier 27.x (this Mac was 27.0.1 in Aurora-dwvu) has no reset.

**Fix:** on 27.2+, remove the app from the list. Before that, `tools/mac/make-fresh-localnet-copy.sh [--launch]` copies the built app, sets a new bundle ID and `LC_UUID`, re-signs ad hoc, and launches it. Each run is a never-seen app and raises the prompt. The copy shares the original's config folder and port, so quit the original first (or pass `--fresh`). Ad-hoc copies show two dialogs where a shipped build shows one; see the notarized-build entry before counting prompts.

---

## Ad-hoc test copies show two Local Network dialogs on first launch; a notarized Developer ID build shows one. Count prompts on a notarized build
Tags: macos, local-network, ad-hoc-signing, notarization, developer-id, prompt-count, testing
Applies-when: counting or reducing permission prompts on first launch, or a fresh test copy shows a duplicate dialog

In Aurora-dwvu every ad-hoc fresh copy (new bundle ID and `LC_UUID`) showed two identical system "find devices on local networks" dialogs. That held for each pair of launch-time operations we tried (browse + send, send + Welcome's mDNS query), with or without `--fresh`. The same HEAD code, notarized and run under a never-seen bundle ID, showed one. The count was never one dialog per operation: the send repeats every 2 s on a new socket and one run had three or more operations, yet it was always two. The macOS cause is not established. TN3179 says local network privacy tracks identity by code signature plus executable UUID and calls ad-hoc identity unreliable. Removing the browse in an ad-hoc build changed nothing and would have looked like "still broken".

**Fix:** to see what users see, test on a notarized build with a new identity. Build `build/mac-release`, then run `tools/mac/make-fresh-localnet-copy.sh <that app>` without `--launch`, then `tools/mac/sign-notarize.sh <copy> --identity "<Developer ID name>" --keychain-profile aurora-notary --out build/<dir>`. Developer ID replaces the ad-hoc signature, and the new bundle ID and UUID survive. Copy the result to `~/Applications` under a distinct name and launch it with `open ... --args --fresh`. Use ad-hoc copies for allowed/denied behaviour, not for counting dialogs. Notarization takes a few minutes.

---

## No System Settings deep link reaches the Local Network list; anchors come from the pane's search index, so check it before guessing
Tags: macos, system-settings, deep-link, x-apple.systempreferences, local-network, anchors
Applies-when: adding an "Open Settings" link for a privacy pane, or a `?Privacy_...` link lands on the wrong page

`x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork` (and the `com.apple.settings.PrivacySecurity.extension` variants, with or without `.privacy-localnetwork`) all land on the Privacy & Security page on macOS 27. Apple calls these URLs unsupported. The anchors that do work (`Privacy_ScreenCapture`, `Privacy_AudioCapture`) are keys in `/System/Library/ExtensionKit/Extensions/SecurityPrivacyExtension.appex/Contents/Resources/en.lproj/PrivacySecurity.searchTerms`; Local Network is not there, because its row is a code-driven service (`PrivacyLocalNetworkService` in `TCCServiceList.plist`), not an indexed one.

**Fix:** list the real anchors with `grep -o "Privacy_[A-Za-z]*" .../PrivacySecurity.searchTerms | sort -u` before writing a link. When the pane has none, link the parent page and name the last click in the copy ("In Settings, click Local Network and allow Aurora."). Re-check after a macOS update.
