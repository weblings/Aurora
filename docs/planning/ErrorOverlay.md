# Error overlay

Id: error-overlay

Status: proposed — not built. Written 2026-10-05 from a design discussion.
Elaborates Aurora-d3ec's open step 4 ("Retry path") and its "design
sketches" section (tray relabel, single error channel). Aurora-k73j (tray
feedback on a failed Resume) was kept out of the main design, which is
Dashboard/WebUI-only, but its own sketch is worked out in Tray, below, once
it became clear it leans on this doc's model (the WebUI is where its
"See Error" click lands) rather than needing a separate design.

Question: once Aurora-d3ec gives the Dashboard a real error field instead of
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
  (Aurora-k73j), out of scope here.

The shape of every `topTierError` bug is the same: the field is a flag that
whoever caused it promises to clean up, instead of a value re-derived from
current server-confirmed state on every render. `toggleError`'s staleness
check is the one place that already does the latter, and it's the one that's
actually correct.

## Model: show every current error, not one winner

Each error source gets its own rule for "is this currently true," derived
from server-confirmed state the same way `isSwitchErrorStale` already does,
not from "did the handler that caused it get retried":

- mode switch — `isSwitchErrorStale` (already correct, unchanged)
- resume/pause — needs `state.paused`/`state.error` agreement, not just
  "no error was in flight"
- device save / auto-arrange — needs a fresh read showing the save held,
  not "the user clicked the same button again"
- startup / failed-resume build — `state.error`, cleared on any successful
  build (Aurora-d3ec step 1-2)
- daemon unreachable — unresolved here, see Open questions

Early drafts of this design tried to collapse all of these into one
`currentError` value and picked a render location for it (an in-page zone,
later an overlay). That raised a real question with no good answer: which
one wins if two are true at once (e.g. daemon-unreachable *and* a stale
switch error)? Picking a winner silently throws away real information —
both things are actually wrong at the same time.

Resolved by not picking: **every currently-true source renders as its own
row, all at once.** There's no precedence left to decide, because nothing
has to be hidden to make room for something else. A row's identity is its
source (switch / resume / device / startup / unreachable), not its message
text — the same source re-describing itself with different wording between
two attempts (e.g. `_switchMode`'s `"Couldn't switch to Audio."` vs a later
`reloadError`-carrying failure, `DashboardScreen.js:554-560`) is one row
updating in place, not one row disappearing and a new one appearing.

## Resolve action: one click that fixes it, or none at all

Two earlier framings of this were both wrong. First: "does a control
elsewhere on the page already retry this" (source-based, missed that
showing Retry in the overlay saves a trip even when one exists). Second:
"which sources need a Retry button" (still assumed Retry is the action,
just disputed when to show it). Neither asked the actual question: **what
single click, if any, would resolve *this* specific failure?** That's a
property of what went wrong, not of which control produced the request.

The app already has two different answers to that question, and a
mechanism for telling them apart:

- **Retry** — resending the identical request is plausibly the fix: a
  transient failure, or a case with no other way to resubmit (device
  save's field fires no change event when the already-selected value is
  reselected).
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
  helps *now*. The overlay's job is to reuse this block inside a row, not
  invent a new one.
- **No button** — nothing a single click does would help. Daemon
  unreachable resolves when the daemon comes back, which is already what
  the heartbeat is polling for, not something a click produces.

This cuts across source, not along it. Mode switch, resume, device save,
and the startup build can each fail for a permission reason or a generic
one depending on what actually went wrong *this time* — the Mac-specific
cases already route through the same `parseMacPermissionError` check
regardless of which of them produced the failure. So a row's action can't
be a per-source lookup table (switch always gets X, device save always
gets Y). It has to be derived from the error's own content: permission-
flavored → Open Settings; otherwise, retryable → Retry; otherwise →
no button. A row's data is closer to `{ message, action: { label, kind,
onClick } | null }` than a blanket `retryable` flag.

Daemon unreachable is still the only source where no occurrence has a
resolving click, since there's no failure classification for it to
disagree with. Every other source's action depends on the specific
failure, not fixed in advance.

## The overlay

One fixed-position widget, mounted the same way on every screen (Dashboard
and every NUX step alike) rather than an in-page element each screen would
need its own placement decision for:

- **Badge**: sits flush in a literal screen corner — drag-to-snap between
  two vertical positions on a fixed horizontal edge (e.g. always the right
  edge, top-right or bottom-right) rather than all four corners, so only
  one axis of mirroring is needed, not two. Persisted per viewer
  (`localStorage`) once dragged. Shows an error count and a `<`/`>`
  collapse toggle on its left edge. Chosen over an `IntersectionObserver`
  scroll-tracked badge (see Rejected, below) because a fixed-position
  widget never scrolls out of view in the first place, so there's nothing
  to watch.
- **Body**: a vertical stack of error rows, offset from the screen edge
  rather than touching the badge's corner. One generic row template for
  every error (message, plus whatever `action` it carries, Retry, Open
  Settings, or none, see Resolve action above, never per-source markup).
  The row at the same height as the badge is always
  whichever source most recently became true; older rows get pushed away
  as new ones arrive, so the stack reads newest-nearest-the-badge,
  oldest-furthest. Grows away from whichever edge the badge is anchored to
  (upward from a bottom anchor, downward from a top one) so it can't run
  off-screen — a static position choice, not an animated one.
- **Hidden entirely** when no source is currently true, badge included.
- **No enter/exit animation in v1.** Rows just appear and disappear, same
  as every other render in `DashboardScreen.js` (full rebuild per pass).
  Animating this later is cheap *if* it turns out to matter — the source
  set is small and fixed (five-ish entries), so a keyed check ("does this
  source's row already exist in the DOM") is a loop over known slots, not
  a general list-diffing problem — but it isn't worth building until the
  plain version is confirmed to feel abrupt. Its only real justification
  would be stopping unrelated, unchanged rows from re-flashing their own
  entrance animation whenever anything else in the list changes, not the
  rarer "same source, reworded" case.

```
┌────────────────────────────────────────┐
│ Aurora                          ⏸   ⏻  │
│                                          │
│   [ Video ]   [ Audio ]*                │
│   Device: Monitor 2                     │
│                   ┌──────────────┐      │
│                   │⚠ Couldn't    │      │  <- older, pushed up
│                   │switch to     │      │
│                   │Audio.        │      │
│                   │      [Retry] │      │
│                   ├──────────────┤      │
│                   │⚠ Couldn't    │      │  <- newest, level with badge
│                   │save settings.│ [<⚠2]│
│                   │      [Retry] │      │
│                   └──────────────┘      │
└────────────────────────────────────────┘
```

Collapsed, the body disappears and only the badge (now showing `[>⚠2]`)
remains, unmoved, so the user can reach whatever it was sitting over.

## Rejected alternatives

- **A toast.** An error like permission-denied is state, not an event — it
  can exist before any user action (startup) and outlive a dismiss. A toast
  forces an "is this new, or already seen" judgment call that's better
  avoided than solved.
- **In-page status zone + scroll-tracked badge.** Solves "the zone scrolled
  out of view" for Dashboard's own layout, but NUX screens have no
  equivalent anchor to place a zone between, and a true fixed overlay never
  has an off-screen state to track in the first place — the scroll-watcher
  was solving a problem a fixed widget doesn't have.
- **A minimizing toast (auto-collapses to a badge on a timer).** Re-opens
  the same "is this new" question a toast has, plus a timing decision for
  when to collapse, for a case (an error already present on page load)
  where neither has a good answer. User-triggered collapse only, no timer.
- **One `currentError` winner among simultaneous sources.** Replaced by
  showing every currently-true source as its own row — see Model, above.

## Tray (Aurora-k73j)

Today the tray's only error-capable action is Pause/Resume (Launch UI and
Stop have no comparable "failed, now what" state), and the menu is always
exactly three items (Launch UI, Pause/Resume, Stop) on all three platforms.
Scoped to that one source for now.

**Relabel in place, not a new entry.** The failed item itself becomes
`⚠ See Error`, in the same slot Pause/Resume already occupies, rather than
inserting a separate entry above it. A new entry changes the list's
length, which shifts every item below it the moment an error appears or
clears, and tray menus get clicked by position as much as by reading. An
in-place label swap never moves Launch UI or Stop, whatever a user's
muscle memory already maps to "second item" stays correct through the
whole error lifecycle. Scales the same way if the menu ever grows, each
option's own slot still only reflects its own state, no new concept
needed, though a long list of options could then show several scattered
`⚠` rows with no single "how many things are wrong" count. If that ever
matters, the fix is an *always-present*, fixed first slot (inert when
clean, a real entry point when not) rather than a conditionally-inserted
one, the same badge-plus-rows shape as the overlay above, not a new
pattern to invent later. Not needed for three items.

**Clicking it opens the WebUI, not Settings directly.** Reuses the
existing, already-cross-platform "Launch UI" action (`ShellExecuteA` on
Windows, `xdg-open` on Linux, the open-browser call on Mac) rather than
duplicating the resolve-action logic (Retry vs. Open Settings vs. none)
in the tray itself. The overlay is already where that lives; the tray's
job is just noticing something's wrong and pointing at it.

**The relabel is never visible live during the click that caused it.**
Selecting a menu item closes the menu immediately on all three platforms,
as a property of how native menus work, not something the app controls.
Mac's click handler (`main.cpp:607-616`) only sets an atomic flag and
returns; the actual `setRunning` attempt, which can take seconds and is
what can fail, runs afterward on the tick thread (`:632-636`), well after
the menu that triggered it is already gone. So the relabel only ever
shows up on a *subsequent* open:

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
(`TrayIcon.cpp`'s shutdown-time `WM_CANCELMODE`) already have a working
way to force an open menu closed, but forcibly dismissing a menu the user
is actively looking at, possibly mid-click on something unrelated like
Stop, to simulate a live update isn't worth the risk of eating a click for
a freshness gain that's already accepted as a limitation on Pause/Resume
today. Not pursued.

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
hardcoded static today, real work, but spec-shaped, same pattern as the
`LayoutUpdated` refresh already proven. Mac is smallest but genuinely new,
and constrained to shape rather than color unless the alert variant
deliberately opts out of the template-image convention the normal icon
uses (`setTemplate:YES`, `TrayIcon.mm:133`).

**System notifications, rejected, same reasoning as the toast above plus
one more.** A notification is event-shaped for a condition that's
state-shaped, the same mismatch already rejected for the WebUI. Mac also
has zero existing notification code to build on, and the original k73j
sketch's whole reason for proposing a menu relabel in the first place was
avoiding notification permission. Windows is actually the cheapest
platform to wire, `Shell_NotifyIconA`'s balloon fields are already used
for the first-run message, but the state/event mismatch applies regardless
of how cheap any one platform makes it.

**Sequencing:** ship the in-place relabel and Launch-UI click-through
first, it costs nothing beyond what this doc already specifies. Treat an
icon swap as the next increment only if ambient-without-opening turns out
to matter in practice. Skip notifications.

## Open questions

- Generalized clearing rules for resume/pause, device save, and
  auto-arrange — named above, not yet written as code.
- Where the error-classification step actually lives (does `derive()` run
  each source's message through `parseMacPermissionError` itself, or does
  each source's own existing error-producing code already tag it) and what
  Retry calls for the startup/no-pipeline case specifically, when it is the
  action (Aurora-d3ec step 4, still undecided there): a dedicated overlay
  button calling `/api/reload`, or the current-mode tile doing double duty
  when idle. Switch/resume/auto-arrange's Retry rows just call whatever
  route their own on-page control already uses.
- Whether daemon-unreachable belongs in this list at all, or keeps its own
  separate heartbeat-driven treatment (an existing full-page overlay may
  already cover it) — raised during this discussion, never confirmed
  either way.
- Exact badge corner set and drag threshold/feel — proposed top-right /
  bottom-right (same edge, so only vertical position varies), untested.
- Row enter/exit animation — intentionally deferred, see The overlay, above.
- Tray icon swap's actual asset(s) and, on Linux, the real wiring of
  `Status`/`OverlayIconName` plus the matching change signal — sketched,
  not built, and deliberately deferred unless the in-place relabel proves
  insufficient on its own (see Tray, above).
