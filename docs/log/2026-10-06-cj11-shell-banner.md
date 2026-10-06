# Aurora-cj11: sticky shell banner for system errors (Mac verified, copy and demo open)

Id: cj11-shell-banner

2026-10-06. WebUI half of [[error-overlay]] (Sequencing step 2), built on
[[d3ec-host-build-errors]] and [[ewyz-connection-watcher]]. Paused: the
node-test-driven, non-Mac portion was implemented and green; a second
session on the owner's Mac (below) ran the real-browser and live checks.
Final copy and the demo question are still open.

## Done

- **Shell** (`web/ui/shell.js`): the beat now polls `GET /api/state` instead
  of `/api/capabilities` (reachability unchanged, `defaultFetchStatus` just
  forwards the parsed body). New `hostState`/`hostErrors`, refreshed on every
  reachable poll via `_updateHostState`; a new `onStateUpdate` callback slot
  (same single-slot shape as `onRecovered`) pushes `{state, errors, paused}`
  to whichever screen cares. Banner mounted at a new `#shell-banner-slot`
  (sticky, in flow, above `#screen-container`): one row per current error,
  2+ collapse to "⚠ N problems ▾"; a permission-prefixed row reuses
  `renderReloadError` (Open Settings, no Retry button), everything else gets
  a generic row with a source-keyed Retry button (`POST /api/reload` for a
  failed host, `PUT /api/state {running:true}` for a failed resume), which
  re-checks via `checkNow()` afterward either way. The takeover clears the
  banner outright rather than showing it alongside stale errors (every row
  is server state, stale the moment the daemon is gone).
- **Onboarding gate**: resolved the open "which steps gate the mid-onboarding
  `reload` error" question (see Findings) — gated on `currentRouteId !==
  'dashboard'`, reusing state the shell already tracked for ewyz rather than
  threading a new flag from `app.js`'s own stage-walk. Lesson filed
  (navigation-flow.md).
- **DashboardScreen.js**: tracks `hostState` from `GET /api/state`; Pause/
  Resume is omitted entirely (not just disabled) while `failed` — there's no
  pipeline to act on and the banner's Retry is the resolve action now; Stop
  stays. Subscribes to `app.onStateUpdate` on mount (cleared on unmount) so a
  tray pause/resume or a build recovering on its own updates the top bar
  live, with no `_loadAll` round trip. Also sets `app.platform` (from its own
  `/api/capabilities` fetch) since `GET /api/state` carries no platform field
  and the banner's Mac-permission detection needs one.
- **Tests**: new cases in `shell.test.mjs` (0/1/2+ errors, permission row,
  both Retry paths, both onboarding-gate directions, takeover clearing the
  banner) and `DashboardScreen.test.mjs` (Pause hidden while failed, the
  heartbeat-push handler). `VIDEO_STATE`/`AUDIO_STATE` shared fixtures given
  real `state`/`errors` fields (the exact placeholder-becomes-load-bearing
  gap `webui-testing.md:162` warns about). Full `web/ui` and `web/demo` node
  suites green.
- **Demo**: left byte-identical, following ewyz's own owner-approved
  precedent (the vendor Dashboard snapshot predates the Pause/Stop topbar
  and the demo shim always answers, so re-vendoring buys risk with no
  observable benefit) — the bead's own written criterion still says "Demo
  re-vendored," flagged below rather than silently overridden.

## Findings

- **The bead's own acceptance criteria had gone stale against its sibling's
  correction.** cj11's `acceptance_criteria` field says the onboarding gate
  hides a `'startup'` error; d3ec's C1 correction (same day) means a fresh
  install is `idle`, not `failed` — `startup` can no longer fire during NUX
  at all, so gating on it would gate nothing. d3ec's own log already named
  this ("cj11's onboarding gate must target [reload], not startup") but the
  citing field on cj11 itself was never updated. Built against `'reload'`,
  the source that actually can fire mid-onboarding. Lesson filed/extended
  (planning.md, the plan-doc-drift entry — same failure mode, a bead's own
  field this time, not a markdown section).
- **"Before the pairing step" collapses to "before the Dashboard route."**
  The fixed onboarding order (output connect → output select → Mode+Device)
  means any output this build can onboard is always paired before
  Mode+Device is ever reached, so a `'reload'` error can only exist
  mid-onboarding when there's no output to pair at all — making "gate it
  before pairing" and "gate it on any non-Dashboard route" the same
  condition for every real flow. No new cross-module flag needed; the
  shell's existing `currentRouteId` (tracked for ewyz) already carries it.
  Lesson filed (navigation-flow.md).

## Mac / real-browser session (2026-10-06, same day)

Rebuilt `build/mac-app` (the bundled binary predated d3ec, so it held no
errors) and drove the page with headless Chromium (Playwright, installed
under the session scratchpad) against the open-launched Aurora.app.

- **Sticky never worked, now does.** Banner scrolled away with the page at
  every width though all node tests passed. Two causes: sticky on a child
  of a slot sized to itself, and `body { overflow-x: hidden }` making body
  a never-scrolling scroll container. Fixed in `styles/shell.css`: sticky on
  `#shell-banner-slot`, `overflow-x: clip` on body. Verified at 480px and
  1280px (top stays 0 after scrolling 1500px, content pushed not covered, no
  horizontal scroll). Lesson filed (layout-css.md).
- **Live failure cycle** (bogus `activeInputName`): banner row shows the
  real reason + Retry; Retry fails again; after fixing the input the next
  Retry succeeds. The host's `reload` error replaces the `startup` one per
  source.
- **Permission row on a real Mac** (stale grant after rebuild, then
  `tccutil reset ScreenCapture com.aurora.app`): `failed`/`startup`/
  `permission_denied` renders the permission block, not a blank page.
  Answering macOS's own prompt then pressing Retry clears the banner and the
  host goes running. The host also recovered on its own once or twice before
  a click was seen; cause not isolated.
- **Banner is Retry-only.** The "Open Screen Recording settings" link opens
  the pane but never adds Aurora to the list (only macOS's prompt does), so
  the banner row drops it and says "answer the macOS prompt (or toggle
  Aurora under System Settings), then press Retry; quit and reopen only if
  it still fails". `renderReloadError` gained an opt-in `{retryId}` so
  Dashboard/Mode screens keep their Settings link and old copy.
- **Retry on refocus, tried and removed.** Built a read-only
  `/api/mac/screen-permission` (`CGPreflightScreenCaptureAccess`) plus a
  refocus handler; the live app showed preflight stays `false` after a
  mid-run grant (true only after relaunch), so it could never fire. Removed
  route, handler, tests, and the CoreGraphics link. A blind retry on focus
  was ruled out too: a retry while the prompt was unanswered coincided with
  a second prompt. Lessons filed (input.md, debugging-method.md).

## Copy unification and follow-ups (same session)

- **Copy** (implemented): permission rows are one line for denied and
  pending alike ("Screen Recording is off. Allow it in the macOS prompt or
  System Settings, then Retry."); other rows prefix their source ("Couldn't
  start: " / "Couldn't resume: " / "Couldn't apply settings: "); the collapse
  reads "N problems ▾". Non-banner callers of `renderReloadError` unchanged.
- **Decisions:** demo re-vendoring dropped from these beads; top bar stays
  non-sticky (the banner pins on its own; a sticky top bar would need
  offsetting by the banner's variable height); the unexplained
  self-recovery after a grant is accepted, not chased.
- **Follow-up Aurora-nkhi** (inline `reloadError` duplicating the banner).
  First filed on the premise that every `reloadError` leaves the host
  failed; live check disproved it (a failed reload on a running host holds
  no error), so the bead was corrected to suppress the inline copy only
  when the shell already holds a matching host error. Lesson filed
  (architecture-process.md).

## Remaining

- **Onboarding gate, live** -- the one real trigger (input saved, no output
  ever paired, so a `reload` error exists mid-onboarding) not run on the Mac:
  needs the owner's Hue output out of the real config.
- **Audio permission block** (`renderAudioPermissionBanner`) still says
  "quit and reopen"; untested, not part of this banner.
- **Dead link** in the d3ec Windows verification log (a bare lessons-file
  name that doesn't resolve from `docs/log/`), reported by `check-links.sh`;
  pre-existing, not from this bead.
- **Bead close** -- k73j and m0fy both block on cj11 closing.

## Footnotes

- 6 lessons filed in all (4 this session: sticky parent/scroll container,
  stale preflight, mocked OS signal, failed reload on a running host). `check-lessons.sh` green; `check-links.sh`
  was run this session with python3 (the file is Python despite its name).
- 2 lessons filed earlier (bead-field drift extending planning.md's existing entry;
  NUX-order gate collapse, navigation-flow.md). `check-lessons.sh` green;
  `check-links.sh` not run this session (pre-existing cp1252 decode failure
  under this machine's Python on non-ASCII doc bytes, unrelated to these
  edits — needs a real run elsewhere before `_ids.md` picks up this file's
  `Id:` line).
