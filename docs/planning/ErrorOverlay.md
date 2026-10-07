# Error overlay

Id: error-overlay

Status: proposed — not built. Written 2026-10-05 from a design discussion,
revised the same day after a comparison with Hyperion's error, tray and
suspend/resume handling (see Hyperion comparison, below). The revision's
changes were agent-proposed; the owner approved folding them in. UI copy
and visual details are still proposals to confirm before building.
Elaborates Aurora-d3ec's open step 4 ("Retry path") and its "design
sketches" section (tray relabel, single error channel), and Aurora-k73j
(tray feedback on a failed Resume), whose "See Error" click lands in the
WebUI described here.

Question: once Aurora-d3ec gives the WebUI a real error field instead of
stderr-only failures, where does it live, how does a user far down the page
find out, and does it survive scrolling and unrelated successes without
either vanishing early or sticking around after it's resolved?

## Problem: today's error display doesn't hold together

From the d3ec bead's 2026-10-05 inventory, read directly from the code:

- **`toggleError`** (failed mode switch) is shown under the Video/Audio
  toggle, and is the one source that already clears correctly: `_loadAll()`
  checks `isSwitchErrorStale(state, toggleErrorMode)`
  (`CaptureSource.js:90-92`) against the *running pipeline's flags* on every
  load, not against whether the user clicked anything.
- **`topTierError`** (resume/pause, device save, auto-arrange) is shown
  under the device field, and has no such rule. Concretely:
  - `_togglePause`'s success path (`DashboardScreen.js:651-652`) just calls
    `_loadAll()` — nothing clears `topTierError`, so a failed-then-succeeded
    Resume still shows "Couldn't resume Aurora." after it worked.
  - Each of `_onAutoDivideClick`, `_onEntertainmentConfigChange`, and
    `_onDeviceFieldChange` nulls `topTierError` only at the *start of its
    own* retry (lines 395, 494, 506) — an unrelated successful action never
    clears someone else's stale message.
  - `_onAutoDivideClick`'s success path doesn't call `_renderTopTier()` at
    all, only `_renderZoneMappingContent()`/`_renderBridgeZoneList()`, so a
    cleared error can sit on screen until something unrelated repaints that
    zone.
- **Startup / failed-resume build errors** don't exist as WebUI state yet —
  today they only reach stderr (Aurora-d3ec's original finding).
- **Tray** Resume failures are stderr-only on all three platforms
  (Aurora-k73j).
- **No pipeline reads as running.** After a failed startup build the host
  has no pipeline but is not paused (`m_paused` false, `m_pipeline` null).
  `PipelineHost::pause()` returns false with nothing to pause
  (`Pipeline.cpp:487`) and `setRunning(true)` reports success because the
  host isn't paused (`:512`), so the tray and the Dashboard both offer
  "Pause", and clicking it silently does nothing. This is d3ec's headline
  case (Mac launched with Screen Recording denied).
- **Daemon unreachable has three surfaces.** The Dashboard heartbeat's
  "Aurora has stopped" overlay (`DashboardScreen.js:727-756`), the boot-time
  `renderUnreachable` screen (`app.js`), and the inline `DAEMON_UNREACHABLE`
  string ("Couldn't reach the daemon.", 22 call sites). The overlay is a
  dead end even when the daemon comes back (the heartbeat stops itself), NUX
  screens have no heartbeat at all, and "daemon" means nothing to a user.
- **The Dashboard's paused state is read only on load**
  (`DashboardScreen.js:186`): a tray Pause, or a failed tray Resume, isn't
  reflected in an open tab until something reloads it.

The shape of every `topTierError` bug is the same: the field is a flag that
whoever caused it promises to clean up, instead of a value re-derived from
current server-confirmed state on every render. `toggleError`'s staleness
check is the one place that already does the latter, and it's the one that's
actually correct.

## Model: three kinds of failure, each with one owner

Borrowed from Hyperion (see Hyperion comparison): a command that was
refused and a system that is degraded are different things, and each gets
the treatment that fits it.

1. **System errors: Aurora is not doing what the user wants.** Startup
   build failed, resume failed, (later) a runtime fault. The daemon holds
   these, not the page: `PipelineHost` stores them (d3ec step 1) and `GET
   /api/state` serves them (d3ec step 2). Clearing is the daemon's job, a
   successful build clears the build error. The WebUI and the tray only
   read it, so a tray-initiated failure shows in the WebUI and vice versa,
   and there is no client-side flag left to forget to clear. The doc's
   earlier separate "resume/pause" source folds into this one: a failed
   resume *is* a failed build, so keeping a client-side copy as well would
   show one failure twice. These render in the banner (below).
2. **Rejected requests: the user's action didn't take, nothing else
   changed.** Mode switch, device save, auto-arrange. Aurora is still in
   its prior, consistent state; the failure is about something the user
   just did, at a control they are looking at. These stay inline at that
   control: `toggleError` already works this way, and `topTierError` gets
   the owner fix from `docs/lessons/components.md` (cleared only by a
   confirmed result, rendered on every path). They never enter the banner,
   which removes the hardest clearing rule from the earlier draft ("a fresh
   read showing the save held").
3. **Daemon unreachable.** Neither of the above: when the daemon is gone,
   every server-derived error is stale and unknowable. It takes over the
   whole screen instead (see Daemon unreachable, below), and the banner and
   inline errors only exist while the daemon answers.

**Host state becomes explicit.** `GET /api/state` gains a state field,
`idle | running | paused | failed`, so "no pipeline because the build
failed" is no longer read as "running". `failed` replaces "Pause" with the
error's resolve action on every surface (banner Retry, tray "⚠ See Error").
`idle` is no pipeline and no error: `Pipeline::build` returns null, not an
exception, while no input is configured, which is every fresh install
until Mode+Device is saved. Clients ignore states they do not know.

**Error shape is keyed by source, not a single string.** `errors` is an
array of `{source, message}` with `source` unique (`startup`, `resume`,
`reload`, later `output`/runtime), decided in Aurora-d3ec: an array has a
stable order for banner rows and a simple OpenAPI schema, and takes `code`
or `since` later without reshaping. Today at most one entry exists, since
any successful build clears all. Within the banner, every currently-true source
is its own row, all at once, the same "show every current error, not one
winner" rule as before: a row's identity is its source, not its message
text, so a source that comes back reworded updates in place.

## Resolve action: one click that fixes it, or none at all

Two earlier framings of this were both wrong. First: "does a control
elsewhere on the page already retry this" (source-based, missed that
showing Retry in the banner saves a trip even when one exists). Second:
"which sources need a Retry button" (still assumed Retry is the action,
just disputed when to show it). Neither asked the actual question: **what
single click, if any, would resolve *this* specific failure?** That's a
property of what went wrong, not of which control produced the request.

The app already has two different answers to that question, and a
mechanism for telling them apart:

- **Retry** — resending the identical request is plausibly the fix: a
  transient failure, or a case with no other way to resubmit. For a
  `failed` host (no pipeline) Retry calls `POST /api/reload`; for a failed
  resume it calls `PUT /api/state {running: true}`; inline rows call
  whatever route their own control already uses.
- **Open Settings** — the real cause is a permission denial, something
  only the user can fix outside the app. This already exists, not just as
  a detection rule but as a working deep link:
  `MacPermissionRecovery.js`'s `parseMacPermissionError` matches a
  `permission_denied:`/`permission_pending:` prefix, and `renderReloadError`
  renders an "Open Screen Recording settings" link straight to the actual
  pane (`x-apple.systempreferences:…Privacy_ScreenCapture`), confirmed
  still working through the Tahoe rename. `renderAudioPermissionBanner`
  does the same for audio, though with no verified pane-specific anchor,
  so it links to the general Privacy & Security pane instead. Clicking
  Retry here wouldn't be wrong exactly, it would just fail again until the
  user has actually been to Settings, so Open Settings is the click that
  helps *now*. The banner's job is to reuse this block inside a row, not
  invent a new one.

  *Revised during Aurora-cj11's Mac check (2026-10-06):* the Open Settings
  link opens the pane but never adds Aurora to the Screen Recording list
  (only macOS's own prompt does), and a retry applies a fresh grant to the
  running app. So the banner's permission row is Retry-only ("answer the
  prompt, then press Retry"); `renderReloadError` takes an opt-in `retryId`
  for that, and Dashboard/Mode screens keep the Settings link.
- **No button** — nothing a single click does would help.

This cuts across source, not along it. A startup build, a resume, a mode
switch and a device save can each fail for a permission reason or a
generic one depending on what actually went wrong *this time* — the
Mac-specific cases already route through the same `parseMacPermissionError`
check regardless of which of them produced the failure. So a row's action
can't be a per-source lookup table. It has to be derived from the error's
own content: permission-flavored → Open Settings; otherwise, retryable →
Retry; otherwise → no button. A row's data is closer to `{ source, message,
action: { label, kind, onClick } | null }` than a blanket `retryable` flag.

## The banner

One sticky element mounted by the app shell, not by any screen:

- **Mounted next to `#screen-container`** in `index.html`, owned by `App`
  (`shell.js`), so every screen, Dashboard and every NUX step alike, gets
  it with no per-screen placement decision. This answers the reason the
  earlier draft rejected an in-page zone (NUX screens have nowhere to
  anchor one): the shell does, outside any screen.
- **In flow, sticky at the top**: `position: sticky; top: 0`. It pushes
  content down when it appears and pins to the top of the window once the
  page scrolls, so it never scrolls out of view and never covers anything.
  The page scrolls the document itself (`shell.css:20`), so sticky needs no
  extra scroll container. Optional: make the top bar sticky with it so
  Pause/Resume stays reachable on a long Dashboard (today the top bar
  scrolls away).
- **Rows**: one generic row template for every error (message plus
  whatever `action` it carries, Retry, Open Settings, or none, never
  per-source markup). One error shows as one row; two or more collapse to
  a summary line ("⚠ 2 problems ▾") that expands, so several errors can't
  eat the window.
- **Fed by the shell's heartbeat**, which polls `GET /api/state` instead of
  `/api/capabilities` (also lock-free, `PipelineRoutes.cpp:83-99`): one
  request gives reachability, host state and the error object, and gives
  an open Dashboard live paused-state updates from the tray for free. The
  stored error string must stay lock-free to read (its own small mutex, not
  the pipeline lock `m_mutex`).
- **Onboarding gate**: a fresh install is `idle`, not failed (no input
  configured, so `build()` returns null), so it shows nothing. The failure
  to gate is one step later: once Mode+Device saves an input but no output
  is paired, the reload throws "No outputs available" and the host reports
  `failed` with a `reload` error (checked live in Aurora-d3ec). The banner
  hides that while NUX is still before the pairing step.
- **Hidden entirely** when no source is currently true.
- **No enter/exit animation in v1.** Rows just appear and disappear, same
  as every other render in `DashboardScreen.js`. Animating later is cheap
  if it turns out to matter (the source set is small and fixed), but not
  worth building until the plain version feels abrupt.

```
┌────────────────────────────────────────┐
│┌──────────────────────────────────────┐│
││⚠ Screen Recording is off for Aurora. ││  <- sticky banner (shell)
││  [Open Screen Recording settings]    ││
│└──────────────────────────────────────┘│
│ Aurora                          ⏸   ⏻  │
│                                         │
│   [ Video ]   [ Audio ]*                │
│   ⚠ Couldn't switch to Audio.           │  <- rejected request: inline
│   Device: Monitor 2                     │
│   ...                                   │
└────────────────────────────────────────┘
```

The cost is layout shift: content moves down when the banner appears and
back up when it clears. Accepted, since errors are rare and the shift is
what makes a new one noticeable.

## Daemon unreachable: take over the screen

The existing stop overlay (`.overlay` scrim, `forms.css:365`) becomes a
shell-level takeover with a single variant (Aurora-yzp4): heading-only
"Aurora has stopped", no body copy and no button -- the page cannot
relaunch the daemon, and the beat owns recovery.

- **Unexpected loss**: the overlay shows and the heartbeat keeps polling;
  when the daemon answers, the overlay clears and the shell calls
  `bootstrap()` (`app.js`) so routing is worked out fresh. `bootstrap()`,
  not a re-mount of the current screen, because screen instances hold
  state (`stopPhase`, `topTierError`) that would bring stale errors back;
  it already goes straight to the Dashboard once `nuxCompleted` is set.
  Cost: a NUX user loses Back history and any half-finished pairing step,
  acceptable for a daemon restart.
- **Intentional stop** (user confirmed Stop): the Dashboard tells the shell
  the stop was deliberate, and the shell shows the same overlay. The beat
  keeps polling rather than going terminal, so relaunching Aurora clears
  it with no click and no reload.

This replaces all three current surfaces: the Dashboard heartbeat overlay
moves to the shell, the boot-time `renderUnreachable` becomes the same
overlay, and inline catches stop printing `DAEMON_UNREACHABLE` and instead
trigger an immediate heartbeat check, the ownership rule
`docs/lessons/components.md` already set ("a failure that only means the
daemon is unreachable sets no inline error"). Copy says "Aurora", never
"daemon". The heartbeat endpoint takes no pipeline locks, so a slow request
during a NUX step (e.g. pairing) can't read as the daemon being gone.

## Hyperion comparison

Read from `hyperion.ng/` on 2026-10-05:

- **Device faults are server state, pushed.** `LedDevice::setInError` sets
  `_isDeviceInError` and signals it; a successful `enable()` clears it;
  the WebUI repaints from the pushed `components-update`. Borrowed: system
  errors held by the daemon, cleared by the daemon.
- **Command errors and state errors are treated differently.** A rejected
  command gets a one-off modal (`content_index.js:30-46`); "disabled" is a
  persistent banner in the page shell, outside page content
  (`#hyperion_disabled_notify`, `index.html:297`). Borrowed: the
  rejected-request vs system-error split, and the shell-level banner. Not
  borrowed: the modal; the no-toast reasoning in Rejected still holds.
- **Connection lost takes over the page.** A 3s watchdog replaces the body
  with a connection-lost screen and keeps polling (`hyperion.js:62-90`).
  Borrowed, with recovery added.
- **Recoverable device failures retry themselves** (`retryEnable`, 5 × 5s).
  Not borrowed for now, see Accepted gaps.
- **Suspend and Resume are separate, idempotent intents**; the tray has no
  error feedback at all. Aurora's `setRunning(bool)` is already an intent;
  only the trays turn it back into a toggle (see Tray). Hyperion's tray
  offers nothing beyond that.

## Rejected alternatives

- **A toast.** An error like permission-denied is state, not an event — it
  can exist before any user action (startup) and outlive a dismiss. A toast
  forces an "is this new, or already seen" judgment call that's better
  avoided than solved.
- **A minimizing toast (auto-collapses to a badge on a timer).** Re-opens
  the same "is this new" question a toast has, plus a timing decision for
  when to collapse. User-triggered collapse only, no timer.
- **One `currentError` winner among simultaneous sources.** Replaced by
  showing every currently-true source as its own row — see Model, above.
- **A fixed-position overlay (corner badge + offset body, drag-to-snap).**
  The first draft of this doc. It solved scrolling, but at the cost of
  drag handling, a saved per-viewer position, a collapse toggle to uncover
  what it sat on, and growth-direction logic. The sticky shell banner
  solves the same scrolling problem without covering content, for the
  price of layout shift.
- **An in-page status zone + scroll-tracked badge.** NUX screens have no
  shared anchor for a per-screen zone; the shell-level banner removes the
  need for one, and sticky positioning removes the need to track scroll.
- **Daemon unreachable as a banner row.** Every other row is server state
  that's stale once the daemon is gone, so unreachable replaces everything
  rather than sitting next to it.
- **Rejected requests in the banner.** A failed save leaves Aurora as it
  was; its staleness rule ("did the save hold?") had no clean definition,
  and the user is already looking at the control that failed.

## Tray (Aurora-k73j)

Today the tray's only error-capable action is Pause/Resume (Launch UI and
Stop have no comparable "failed, now what" state), and the menu is always
exactly three items (Launch UI, Pause/Resume, Stop) on all three platforms.

**Relabel in place, not a new entry.** The item itself becomes `⚠ See
Error`, in the same slot Pause/Resume already occupies, rather than
inserting a separate entry above it. A new entry changes the list's
length, which shifts every item below it the moment an error appears or
clears, and tray menus get clicked by position as much as by reading. An
in-place label swap never moves Launch UI or Stop. Scales the same way if
the menu ever grows, each option's own slot still only reflects its own
state, though a long list could then show several scattered `⚠` rows with
no single count. If that ever matters, the fix is an *always-present*,
fixed first slot (inert when clean, a real entry point when not), the same
summary-plus-rows shape as the banner, not a new pattern to invent later.
Not needed for three items.

**Shows for a `failed` host, not only a failed Resume.** Driven by the
daemon-held error, so it covers the startup-failure case (today the tray
offers a "Pause" that does nothing) as well as a failed Resume, from
either the tray or the WebUI. Implemented as one `PipelineHost::status()` snapshot read when the menu opens (state plus errors together, never a separate `buildError()`/`isPaused()` pair: since Aurora-ja76 a running host can hold errors, so the error list alone cannot drive the label),
the model `docs/lessons/architecture-process.md` already set for this
label. Labels: running → Pause (even with errors held); idle → Pause (status quo); paused, no error → Resume; failed or paused with an error → `⚠ See Error`.

**Clicking it opens the WebUI, not Settings directly.** Reuses the
existing, already-cross-platform "Launch UI" action (`ShellExecuteA` on
Windows, `xdg-open` on Linux, the open-browser call on Mac) rather than
duplicating the resolve-action logic in the tray itself. The banner is
already where that lives; the tray's job is just noticing something's
wrong and pointing at it. Accepted cost: the relabel removes Resume from
the tray while an error stands, so a transient failure needs a trip to the
WebUI's Retry. If the WebUI failed to bind (`webUiBound` false, already
passed to every tray), "See Error" would lead nowhere, so the item keeps
its Pause/Resume label in that case.

**Send the intended state, not a toggle.** Every tray click today only
sets a flag, and the tick thread later runs
`setRunning(pipelineHost.isPaused())` (`app/mac/src/main.cpp:634`, Linux
`:696`, Windows `:858`), so the target is decided seconds after the click.
The menu still says "Resume" while a multi-second resume runs, and a
second click then pauses right after the resume succeeds. Fix: capture the
target when clicked (run / pause request, not a toggle flag), which is
what `PUT /api/state {running}` already sends.

**The relabel is never visible live during the click that caused it.**
Selecting a menu item closes the menu immediately on all three platforms,
as a property of how native menus work. Mac's click handler
(`main.cpp:607-616`) only sets an atomic flag and returns; the actual
`setRunning` attempt, which can take seconds and is what can fail, runs
afterward on the tick thread (`:632-636`), after the menu is already gone.
So the relabel only ever shows up on a *subsequent* open:

- Mac and Windows compute the label once, immediately before display
  (`TrayIcon.mm:67-73`'s `menuNeedsUpdate:`, `main.cpp:462-478`'s
  freshly-rebuilt `HMENU`), with no mechanism to update an already-open
  menu.
- Linux already has a live push for this shape of thing: `refresh()`
  (`TrayIcon.cpp:372-378`) emits a `LayoutUpdated` signal, already wired
  from the tick loop whenever `isPaused()` changes (`main.cpp:700-703`).
  The same compare-and-call pattern, extended to the error state, would
  let Linux's label update even while the menu is open, if the host
  honors the signal promptly (most do).

Both Mac (`TrayIcon.mm:211-218`'s `cancelMenuTracking`) and Windows
(`TrayIcon.cpp`'s shutdown-time `WM_CANCELMODE`) already have a way to
force an open menu closed, but dismissing a menu the user is actively
looking at, possibly mid-click on Stop, to simulate a live update isn't
worth the risk of eating a click. Not pursued.

**Ambient signaling (visible without opening the menu) needs a real icon,
no badge API exists.** `NSStatusBarButton` is a plain button wrapper, no
built-in badge/attention primitive, and Aurora has no Dock icon
(`LSUIElement`) for `NSDockTile.badgeLabel` to apply to either, so there's
no shortcut, only a discrete icon swap or a hand-composited overlay dot.
Cost differs by platform: Windows reuses `Shell_NotifyIconA(NIM_MODIFY,
...)`, already live in this file for the first-run balloon
(`main.cpp:496-515`), just needs a second `HICON`. Linux's
StatusNotifierItem already exposes the right properties (`Status`,
`IconName`, `OverlayIconName`, `TrayIcon.cpp:169,175,183`) but they're
hardcoded static today. Mac is smallest but genuinely new, and constrained
to shape rather than color unless the alert variant deliberately opts out
of the template-image convention the normal icon uses (`setTemplate:YES`,
`TrayIcon.mm:133`).

**System notifications, rejected, same reasoning as the toast above plus
one more.** A notification is event-shaped for a condition that's
state-shaped. Mac also has zero existing notification code to build on,
and the original k73j sketch's whole reason for a menu relabel was
avoiding notification permission. Windows is the cheapest platform to
wire (the first-run balloon fields), but the state/event mismatch applies
regardless.

## Sequencing

Remaining work is resequenced under Proposed revision, Sequencing (below).

0. **Core (prerequisite for 2 and 4), Aurora-d3ec**: d3ec steps 1–2, with the error
   keyed by source and the explicit `running | paused | failed` state
   added to `GET /api/state`. The startup build moves under `PipelineHost`
   in all three apps, per d3ec step 1's startup caveat.
1. **WebUI A, shell connection watcher, Aurora-ewyz**: independent of step 0, can ship
   first. Heartbeat moves to `App`; the two-variant takeover replaces the
   three unreachable surfaces; reconnect calls `bootstrap()`.
2. **WebUI B, sticky banner for system errors, Aurora-cj11**: needs step 0. Heartbeat
   switches to `GET /api/state`; d3ec step 3's error display renders here
   through `renderReloadError`; `failed` hides Pause and offers Retry
   (settles d3ec step 4).
3. **WebUI C, inline rejected requests, Aurora-m0fy**: the `topTierError` owner fix for
   device save and auto-arrange. Separate cleanup, no banner involvement.
4. **Tray, Aurora-q9l1 (click-time target, independent) then Aurora-k73j (See Error, after d3ec and cj11)**: needs step 0. `buildError()` getter, `⚠ See Error`
   label for `failed` and failed-resume, click-time target in place of the
   toggle flag, `webUiBound` fallback. Icon swap only if ambient signaling
   turns out to matter in practice. No notifications.

Every WebUI step touching `DashboardScreen.js` also needs re-vendoring
into `web/demo/vendor/webui` (see Accepted gaps).

## Accepted gaps (not doing now)

- **Failures after a successful build have no source.** A resume against a
  dead bridge returns success because the DTLS failure is swallowed
  (`docs/lessons/output.md`, "A dead Hue bridge cannot fail a pipeline resume"), and a
  mid-run stream drop isn't reported anywhere. Hyperion's
  `setInError` + bounded retry is the model if this is picked up. The
  keyed error shape leaves room for it.
- **A failed resume's error stays until the next successful build.** If
  the user decides to stay paused, the banner row stays. Kept on purpose:
  it's the accurate reason Aurora is paused, and Retry is right there.
- **Demo fork porting.** `DashboardScreen.js` is vendored into
  `web/demo/vendor/webui`, but `shell.js` and `app.js` aren't. Moving the
  heartbeat out of the Dashboard means re-vendoring it, and the demo won't
  get the shell banner or takeover unless `demo-boot.js` adds them. The
  demo shim always answers, so it never needs either.
- **NUX loses Back history on reconnect** (see Daemon unreachable).

## Open questions

- Exact banner and takeover copy, and whether the top bar goes sticky with
  the banner.
- Which NUX steps gate the mid-onboarding `reload` error (the onboarding
  gate above), confirmed when building Aurora-cj11.
- Row enter/exit animation — intentionally deferred.
- Tray icon swap's actual asset(s) and, on Linux, the real wiring of
  `Status`/`OverlayIconName` plus the matching change signal — deferred
  unless the in-place relabel proves insufficient.
- Bounded automatic retry of resume in the daemon (Hyperion's
  `retryEnable`), shown as "Retrying 2/5…". Only safe if Aurora can tell
  "bridge busy" from "another app owns the entertainment area"; otherwise
  the retries fight that app. Not scheduled.

## Proposed revision: errors go to the shell by cause (2026-10-06)

Status: in progress. Core (Aurora-ja76) shipped 2026-10-06
([[ja76-hold-running-reload-error]]); WebUI (98pr) shipped
([[98pr-webui-banner-x]]); Mac audio row (h457) shipped
([[h457-audio-permission-banner-row]]); WebUI inline cleanup (m0fy) shipped
([[m0fy-top-tier-error-owners]]); the tray beads (q9l1, k73j) are not built. Raised during Aurora-nkhi's live Mac check:
with the host running and Screen Recording off, a failed Video switch left
the permission block inline under the toggles and the banner empty. That is
what the Model section prescribes today (rejected requests stay inline), but
the owner expects every host-state error in the shell. The owner confirmed
this split over "everything in the shell" on 2026-10-06, and the open
questions are settled below (agent-proposed, owner-approved). The sections
above are unchanged until this is built; the Core changes below are built.

### The rule

Split by cause, not by which control sent the request:

1. **Daemon unreachable**: full-screen takeover, unchanged.
2. **Host-state errors**: Aurora is not doing what the user asked. Shell
   banner, held by the daemon. This now includes a reload that failed while
   a pipeline was running (the old pipeline keeps driving the lights, the
   saved config and the running pipeline disagree), and the Mac audio
   permission block (decision 4).
3. **Field and step errors**: about a value or step the user is looking at
   and fixes in place. Inline: bridge address and pairing on
   OutputConnectScreen, "No active zones to arrange", auto-arrange save,
   zone-select empty states, and ModeDeviceScreen's reload error during
   onboarding (decision 3).

Why not "everything in the shell": errors tied to a field read better next
to it (NN/g: show the error close to its source; Carbon: banners are
system-level, not task-specific), and a client-reported banner channel would
reintroduce the client-side clearing rules the Model section removed. With
this split the shell is fed only by daemon state. GOV.UK's error summary
(top summary plus inline message, linked) was considered and not taken: it
needs a page-fed banner, and it targets long forms with errors found on
submit, not a control the user just touched.

### Config PUT outcomes

`PUT /api/config` already returns three different things, today handled by
one code path in `DashboardScreen._onDeviceFieldChange` and
`ModeDeviceScreen`:

- **Saved, not applied** (`succeeded:true` plus `reloadError`,
  `SettingsRoutes.cpp:153-158`): host-state error, goes to the shell.
- **Rejected outright** (`succeeded:false`, 400, e.g. `invalid_field_type`,
  `SettingsRoutes.cpp:132,149`): nothing changed and the daemon holds
  nothing, so there is nothing for the shell to show. Stays inline as the
  one exception (decision 8).
- **Field validation**: detected by the screen or a step-specific endpoint,
  inline.

A paused host never reaches the first case: `reload()` returns success
without building while paused (`Pipeline.cpp:499-500`), the config applies
on resume, and a bad config then fails as a `resume` error (`resume`
rebuilds from the saved config, `Pipeline.cpp:575-576`).

### Core changes

- `PipelineHost::_recordFailure` (`Pipeline.cpp:389-395`) returns early when
  a pipeline is running or paused. It would hold the error while running
  too. `HostStatus` can then carry `errors` while `running`; clients must
  not read "has errors" as "failed". `_publishStatusLocked` already derives
  the state from the pipeline, not from the error list. A successful build
  still clears all errors.
- `pause()` publishes an empty error list (`Pipeline.cpp:554`), so pausing a
  running host with a held reload error clears it. Kept: the bad config
  resurfaces as a `resume` error on the next Resume.
- Each entry gains an `id` from one host-wide monotonic counter, stamped
  when the entry is created or replaced (decision 11). Entries a publish
  leaves alone keep their id. `since`, if added, is for display only.
- Publishing merges by source instead of replacing the whole list. Today
  every publish replaces it and at most one entry exists; the audio
  permission entry (decision 4) can coexist with a reload error, so the
  Model section's "at most one entry" no longer holds.
- Reverses d3ec's "do not store" note for reload-with-a-pipeline and the
  cj11 lesson "a failed reload on a running host holds no error".
- A dismiss route on all three apps, cleared daemon-side so the tray and
  every tab agree. It is registered once in `registerStateRoute` (decision
  12), backed by `PipelineHost::dismissError(source, id)`.
- A failed reload stores its error only if no build has landed since it
  started (decision 10). The old "no pipeline exists" early return gave
  that guard for free; holding while running removes it.
- Mac: `MacAudioGrabber` publishes an `audio_permission` entry when
  `isLikelyPermissionDenied()` turns true and removes it when it turns
  false (decision 4).

### Dismiss (the X)

User-triggered only, no timer (consistent with the rejected minimizing
toast). Offered only while the old setup is still working:

- `running` host with a held error: dismissible.
- `paused` host with a failed resume: not dismissible. No lights are on and
  the user asked for running; the row is the accurate reason it is paused,
  as Accepted gaps already records.
- `failed` host: not dismissible, Retry is the action and the row is the
  only explanation for no lights.

The daemon owns the dismissal. A client-only dismiss would reappear on the
next poll, in the tray and in a second tab. The dismiss carries
`{source, id}`; the daemon removes that entry only if the id still matches,
otherwise it is a no-op, so an X click racing a new failure cannot clear the
new one. Dismiss deletes the entry outright rather than setting a hidden
flag, so no dismissal state is remembered and the next failure arrives with
a new id.

### Banner and copy changes

- Mockup: the inline "Couldn't switch to Audio." line goes, the row sits in
  the banner.
- Saved-not-applied row: "Saved, but couldn't apply: ‹reason›. Aurora is
  still running your previous setup and will try the new one next time it
  starts." It must not promise the next launch works: that launch builds
  from the same saved config and can fail the same way.
- Retry on a running host with a held error is a reload against the saved
  config. The banner's handler is keyed by source today (`POST /api/reload`
  for `failed`, a state PUT for a failed resume); it needs a rule for this.
  The resolve-action rule still applies first: a `permission_denied:` error
  offers Open Settings, not Retry.
- Audio permission row: the existing `renderAudioPermissionBanner` block and
  its Open Settings link, inside a banner row, dismissible (the host is
  running and the detection is a heuristic, e.g. a silent room).
- The "Rejected requests in the banner" alternative above is superseded for
  saved-not-applied errors: its "did the save hold?" clearing problem goes
  away because the daemon clears on the next successful build or a dismiss.

### Bead effects

- **Aurora-nkhi**: superseded. Its suppress-if-banner-holds logic only
  exists to patch the old split. Closed 2026-10-06 without shipping; its
  node tests are carried into Aurora-98pr's notes.
- **Aurora-m0fy**: keeps its scope (owner fix for `topTierError`), shrunk to
  the errors that stay inline; now after Aurora-98pr (same fields). Shipped
  2026-10-07 as one key per control, not one owner for the field
  ([[m0fy-top-tier-error-owners]]).
- **Aurora-k73j**: rule unchanged (running → Pause; paused with an error or
  failed → `⚠ See Error`). Clarification: errors on a running host do not
  change the label, so `buildError()` alone must not drive it.
- **Aurora-ja76** (new, core): hold the error on a running host, `id`, merge
  by source, dismiss route on all three apps.
- **Aurora-98pr** (new, WebUI): remove the Dashboard's inline `reloadError`
  copies, banner X, running-host retry rule, saved-not-applied copy.
- **Aurora-h457** (new, Mac): `audio_permission` entry pushed on
  transitions, banner row, retire the Dashboard's `/api/mac/audio-status`
  poll.
- cj11 and d3ec are closed; their logs and the architecture-process lesson
  on failed reloads point here.

### Sequencing

Replaces steps 3–4 of Sequencing above; steps 0–2 (d3ec, ewyz, cj11) are
done.

1. **Core, Aurora-ja76**: prerequisite for everything below.
2. **WebUI, Aurora-98pr**: needs ja76.
3. **Mac audio row, Aurora-h457**: needs ja76 (merge by source) and 98pr
   (banner X).
4. **WebUI inline cleanup, Aurora-m0fy**: after 98pr, which takes the
   saved-not-applied copies out of the same fields first.
5. **Tray**: Aurora-q9l1 stays independent. Aurora-k73j does not depend on
   this revision's beads (its label reads host state), but its rule must
   ignore ja76's running-host errors.

### Decisions (2026-10-06)

1. **Paused host with a failed resume: not dismissible.** It fails the
   Dismiss rule's own test (no lights, the user asked for running), and
   Accepted gaps keeps its "stays until the next successful build" entry.
   Dismissible means `running`, nothing else.
2. **Tray for a running host with a held error: keep Pause.** The slot only
   relabels when its own action would fail, and Pause works. Relabelling
   would take away pausing lights that are running. No paused host holds a
   reload error (Config PUT outcomes), so k73j's rule needs no new case.
3. **Mode+Device reload failure during onboarding: inline.** A step error
   under rule 3: `renderReloadError` stays on ModeDeviceScreen and the
   banner gate is unchanged. The daemon holds it, so the banner shows it if
   the user reaches the Dashboard with it unresolved.
4. **Audio permission block: moves to the banner, pushed by the daemon.**
   Host-state by rule 2 (running, capturing silence). Today it comes from
   the Mac-only `/api/mac/audio-status` route, which the Dashboard polls
   only in audio mode and which takes the pipeline lock through
   `withAudioInput` (`app/mac/src/main.cpp:265-276`), so the lock-free
   heartbeat cannot call it. Instead the grabber publishes and removes an
   `audio_permission` entry on the flag's transitions, so a dismiss holds
   until the condition clears and returns. No `severity` field for now: the
   copy already says "likely".
5. **Dismiss identity: a monotonic `id`.** Timestamps can collide and depend
   on the clock; a counter cannot and costs nothing.
6. **Saved-not-applied: the X is enough, with honest copy** (Banner and copy
   changes). Possible later bead, only if stale rows prove a problem in
   use: a Revert action that re-saves the running config, or Kubernetes-
   style `configRevision`/`appliedRevision` on `GET /api/state` so the row
   is derived from the mismatch instead of held.
7. **Demo fork: leave the demo alone**, per the ewyz/cj11 precedent. When
   re-vendoring `DashboardScreen.js`, take the removal of the inline
   `reloadError` copies with it so the demo does not keep the old split.
8. **Rejected outright stays inline.** Nothing changed daemon-side, and
   `invalid_field_type` is usually a client bug, so generic inline copy is
   enough.
9. **Stop failure: deferred.** `/api/stop` always returns `succeeded:true`,
   so the real failure is a shutdown that hangs with the daemon still
   answering. Likely shape: a timer in the Stop dialog that, if the daemon
   still answers N seconds after a confirmed stop, tells the user how to
   quit Aurora from the OS.
10. **Stale failure guard: a build epoch.** A counter bumped on each
    successful swap; a failing reload records it when its build starts and
    stores its error only if it is unchanged, checked under `m_mutex`. Not
    a reload mutex: Hue builds are slow and network-bound, and the late-
    failure test's nested reload would deadlock. d3ec rejected a sequence
    counter only because the early return covered the case. The existing
    late-failure test (`PipelineTests.cpp`, "lands after a concurrent
    successful build") stays as written and is the mutant check.
11. **Id stamping: per entry, from a host-wide counter.** Stamped when an
    entry is created or replaced, including a repeat failure with an
    identical message (decision 5's "next failure arrives with a new id").
    Not restamped on every publish: an unrelated publish (the audio entry
    flipping) would otherwise invalidate the id under the user's click and
    the X would silently do nothing.
12. **Dismiss route is shared.** One route in `registerStateRoute`, since
    the core `dismissError` is needed either way and per-app lambdas can
    drift. Responses: 400 bad body, 409 host not running (as `PUT
    /api/state`), 200 `{succeeded:true, dismissed:false}` for a stale id
    (the client calls `checkNow()` regardless, so a stale click needs no
    error UI). The earlier "per app like `/api/stop`" wording had no stated
    reason; `/api/stop` is per-app only because it touches app-local
    shutdown state.
13. **Retry and row types in the shell.** `shell.js` `_retry` already posts
    `/api/reload` for every source but `resume`, so a running-host `reload`
    row needs no new retry rule, only a regression test. The new
    `audio_permission` source takes the generic Retry too: a grant does not
    revive a grabber created before it (found live, Aurora-h457), and the
    reload rebuilds it. Its row gets Retry, Open Settings and an X.
    Aurora-98pr must also
    check that `_visibleErrors`' hide-`reload`-off-dashboard gate hides
    nothing a post-onboarding route needs.
14. **Audio entry publisher: the Mac main loop, on edges.**
    `isLikelyPermissionDenied()` is a 10-second timer, not an event, and
    the grabber has no host handle. The tick thread polls the existing
    `audioPermissionLikelyDenied` helper (it already takes the pipeline
    lock, which only the HTTP route could not) and publishes or removes the
    entry on transitions. Needs a remove-by-source operation in core. Any
    successful build clears all entries and restarts the grabber's grace
    window, so a dismissed row returns after a structural save if the
    denial persists. Accepted.
15. **A build failure supersedes earlier build entries.** Found building
    ja76: with plain merge-by-source, a failed retry of a failed startup
    held `startup` and `reload` together, two rows for one cause. A new
    `startup`/`resume`/`reload` failure replaces the earlier ones; sources
    other components hold (`audio_permission`) still merge.

Verification needed when built: core tests (hold while running, clear on
build and on pause, merge by source, dismiss with a stale `id` is a no-op,
audio entry on transitions only, a failed reload that lands after a newer
success stores nothing, an unrelated publish keeps the other entry's id),
node tests for the banner X and its
running-only rule, a new live Mac check (the existing checks assumed the old
behavior), and updates to the lessons that record the old rule.
