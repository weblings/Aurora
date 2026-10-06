# Aurora-cj11: sticky shell banner for system errors (paused)

Id: cj11-shell-banner

2026-10-06. WebUI half of [[error-overlay]] (Sequencing step 2), built on
[[d3ec-host-build-errors]] and [[ewyz-connection-watcher]]. Paused: the
node-test-driven, non-Mac portion is implemented and green; Mac-specific
verification, final copy, and a real-browser pass are still open and need
the owner or a real device.

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

## Remaining

- **Banner/button copy** — `docs/planning/ErrorOverlay.md`'s own open
  question, still open. Current text ("Retry", "⚠ N problems ▾") is
  placeholder, not reviewed copy.
- **Mac live verification** — the `permission_denied:` banner row end to
  end on an open-launched Aurora.app, and the onboarding-gate's one real
  trigger path (input saved, no output ever paired) confirmed live. Needs
  Mac hardware.
- **Real-browser pass** — sticky behavior at 480px and desktop widths
  (jsdom does no layout). The devstack/headless-Chrome recipe ewyz used is
  documented Linux-only (`web-testing.md:270`, a Linux-specific cached
  Playwright path); not attempted from this Windows session.
- **Demo re-vendoring** — the bead's criteria say "Demo re-vendored"; skipped
  per the ewyz precedent above. Worth a quick owner confirmation that the
  precedent still applies here, since the written criterion was never
  updated to match it.
- k73j and m0fy both block on cj11 closing.

## Footnotes

- 2 lessons filed (bead-field drift extending planning.md's existing entry;
  NUX-order gate collapse, navigation-flow.md). `check-lessons.sh` green;
  `check-links.sh` not run this session (pre-existing cp1252 decode failure
  under this machine's Python on non-ASCII doc bytes, unrelated to these
  edits — needs a real run elsewhere before `_ids.md` picks up this file's
  `Id:` line).
