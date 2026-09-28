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
it — the menu closes right after opening. Aurora's `pump()` only ever
calls `CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0, true)` — it registers
nothing in common modes — so this doesn't apply as written, but the
scoping was deliberate, not incidental, and worth preserving if this code
ever grows a custom observer/timer.

**Fix:** if a future change needs to register a run-loop observer or timer
alongside `NSStatusItem`/`NSMenu` UI, scope it to `kCFRunLoopDefaultMode`
(+ `NSModalPanelRunLoopMode` if modal dialogs need the same treatment) —
never `kCFRunLoopCommonModes` — or menu tracking silently breaks.

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
