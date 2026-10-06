# Aurora-ewyz: shell-level connection watcher (implemented, verified)

Id: ewyz-connection-watcher

2026-10-06. WebUI half of [[error-overlay]] (Sequencing step 1). Verified: unit suites pass (Node 24 now available) and a live kill/restart against the fake-Hue devstack confirms the takeover overlay and silent auto-reconnect. `--fresh` mid-NUX reconnect not yet exercised. Ready to close pending `bd` access (none in this session's PATH).

## Done

- **Review recorded on beads before building.** Interaction gaps in the step-1 design vs later beads (endpoint rework into cj11, 22 `checkNow` triggers stacking polls, 500-vs-gone conflation, undefined stop signal, `bootstrap()` dropping the NUX route, stale pause until cj11, triple-touch test churn) were analyzed; the right-sized subset went into ewyz acceptance: coalescing `checkNow()`, the transport/application taxonomy, an explicit stop contract, route-id-preserving reconnect. Backoff, poll-target seams and draft restoration deferred outside the sequence. Notes on ewyz, contract on cj11.
- **Shell** (`web/ui/shell.js`): `App` owns the beat (recursive `setTimeout` 3s + 2.5s abort, `/api/capabilities`), 2 consecutive failures raise the `Aurora isn't running` takeover, recovery calls `onRecovered(preservedRouteId)` once. `checkNow()` always polls or attaches to the in-flight poll (single-flight shared with the beat; a verdict cache was designed then dropped, see Findings). Confirmed Stop is terminal with manual Retry connection; tray/quit Stop lands in the polling unexpected-loss variant. `showUnreachable()` is the boot/stage path.
- **Screens** (Dashboard, ModeDevice, ZoneMapping, EntertainmentZoneSelect, `app.js`, `index.html` slot): Dashboard heartbeat deleted; all 13 inline `DAEMON_UNREACHABLE` renders replaced with `checkNow()` + silence, except blip paths that await the verdict and report the action's error (switch, pause, stop-confirm, mode apply). Shared components gained a backward-compatible `onUnreachable` channel. `DAEMON_UNREACHABLE` is now the internal signal, translated at screen funnels, never rendered.
- **Tests:** new `web/ui/shell.test.mjs` (12 cases) + DashboardScreen test updates (blip actions, silent outage, beat poke). Brace-balanced, no stale heartbeat refs; NOT run.
- **Beads:** ewyz IN_PROGRESS (claimed); acceptance rewritten twice as the design settled (single-flight wording, demo line).

## Findings

- **A cached reachability verdict can predate the failure that triggered the call.** The first `checkNow()` design returned the last-known verdict inside a ~500ms min-interval; a screen awaiting it right after a successful beat poll would misread a fresh outage as a blip and set an inline error alongside the coming takeover. Dropped the cache: always poll or attach; single-flight plus abort already bounds the cost. Lesson filed (components.md).
- **The vendor Dashboard snapshot predates the Pause/Stop topbar**, so "re-vendor DashboardScreen" would port months of Dashboard evolution plus MacPermissionRecovery and re-decide seams blind -- and the demo cannot show error UI anyway (the shim always answers), so the re-vendor buys risk with no observable benefit. Vendor tree left byte-identical; full re-sync is a separate demo-porting task. Lesson filed (architecture-process.md). Owner agreed: the demo ideally never errors since it connects to nothing.
- **CI's `web.yml` gate does not cover `web/ui` tests** (only `web-processing`, `web/demo`, `web/ui/styles`). The new shell suite and the DashboardScreen suite run manually (`node <file>.test.mjs`), same as the existing screens tests. Follow-up: extend the gate loop or accept the manual convention.
- **No JS runtime on this machine** (`node`/`bun`/`deno` all absent, no repo-shipped installer), so suites are authored-but-unrun. Tooling note, not a repo lesson.

## Verified (2026-10-06, follow-up)

- **Unit suites**: `node web/ui/shell.test.mjs`, `node web/ui/screens/DashboardScreen.test.mjs`, `node web/ui/messages.test.mjs` all pass on Node v24.14.0.
- **Live kill/restart**: `tools/light-viz-relay/devstack.py up` (live screen capture produced no frames in this sandbox -- no capturable desktop session; `--input dummy` confirmed the pipeline itself is fine, environment-only gap, not a code issue). Drove headless Chrome over CDP: loaded the WebUI on a zone-mapping screen with Zone 0 selected, `taskkill`'d `Aurora.exe`, and after ~11s (2 missed 3s beats) the shell showed the "Aurora isn't running" takeover with "This page will reconnect on its own." Relaunched `Aurora.exe --fake-hue` (no `--fresh`, config root preserved) and within ~9s the page silently returned to the same zone-mapping view with Zone 0 still selected -- no manual reload, no "Try again" click needed. Matches the designed `onRecovered(preservedRouteId)` path.

## Remaining

- `--fresh` mid-NUX (Output Connect step) reconnect returning to the same step -- not exercised this pass.
- Close ewyz via `bd` (unblocks cj11's banner work, which consumes the beat + taxonomy + gate) -- no `bd` binary in this session's PATH, needs to be run where beads is installed.

## Footnotes

- 2 lessons (verdict-cache, vendor-rot). `check-lessons.sh` and `check-links.sh` green.
