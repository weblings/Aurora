# macOS GUI (AppKit, tray, run loop)

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

---

---

## macOS's temp dir is `$TMPDIR` (`/var/folders/...`), not `/tmp`; a hardcoded `/tmp` path silently misses it
Tags: macos, tmpdir, config-root, scripts
Applies-when: a script or doc hardcodes `/tmp/...` for a path the app derives from the platform temp dir (e.g. `--fresh`'s config root)

`devstack.py` copied the zone map to `/tmp/aurora-fresh/profiles/` on non-Windows, following the Linux-shaped README. On Mac the app's `--fresh` root is `$TMPDIR/aurora-fresh`, so the copy landed in a directory the app never reads. Nothing errored; frames just never flowed (compounded by an unset input leaving the pipeline idle), so `up` only timed out. The app's own startup line (`Config root: ...`) had the true path all along.

**Fix:** derive the path from the platform temp dir (`tempfile.gettempdir()`, `${TMPDIR:-/tmp}`), and when scripting against the app, read the path it logs rather than assuming it.
