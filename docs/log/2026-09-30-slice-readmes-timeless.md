# Slice READMEs made timeless, citation scan widened (2026-09-30)

Closed: Aurora-y2a. Follow-up to Aurora-cv1 (see `2026-09-30-slice-agents-into-readmes.md`). Branch `feat/MacSupportV2`.

## Why

Slice READMEs sit outside every docs freshness mechanism: no `Status:` line, no archive-on-close, and `check-links.sh` only scanned `docs/` and `.claude/skills/`. Their status prose had rotted (`input/windows` said `WindowsGrabber` "not started" though `WindowsGrabber` and `AudioGrabber` exist; `app/{linux,windows}` listed "No pairing flow / No zone-mapping UI" stopgaps the WebUI removed; `web/ui` said "No screens exist yet").

## Done

- Stripped Status / Known stopgaps / Not yet built sections; replaced with "What's here" (identity, entry points) and, for the apps, a "Configuration" section that is true today (credentials via WebUI pairing or env, config roots, the Windows monitor-liveness caveat, which is a real limitation). `input/windows` build recipe now points at `docs/Building.md`. `app/mac`/`input/mac` lose their support-status paragraph in favor of a pointer to the root README. `web/demo`'s "Not yet built" list (user-upload video, an eyeball pass of the render) was dropped, not tracked elsewhere.
- `docs/check-links.sh` now also scans slice READMEs/CLAUDE.md and the root `README`/`CONTRIBUTING`/`AGENTS`/`CLAUDE`. First run found four dead citations, fixed: `CONTRIBUTING.md` linked `Building.md` instead of `docs/Building.md` (a genuinely broken GitHub link, labelled correctly but href wrong), and three bare filenames in `web/demo/CLAUDE.md`.
- Root `AGENTS.md` gains the rule: slice READMEs carry only non-stale content, and a bead that changes what a slice does or builds updates its README in the same close. `docs/README.md` checklist step 4 updated to match the new scan scope.

## Lessons

- Filed: a widened checker beats a "remember to grep" step; the first run of the widened scan found four dead citations (resolution note appended to the scan-scope entry in `docs/lessons/architecture-process.md`).
- Filed: piping a validator through `tail` hides its exit status. Slip this session: the NUX-log commit went through with a failing link check (a bare filename citation to [[mac-tray-parity]]), fixed in a follow-up commit (`docs/lessons/debugging-method.md`).
- Not filed: my wrong "build serves a fetched copy of `web/ui`" claim (Mac NUX log). `docs/lessons/input.md` already records that `AURORA_WEBUI_SOURCE_DIR` is baked to the checkout path; the miss was not checking it, not a missing lesson.

## Not done

The tools READMEs (`fake-hue-bridge`, `light-viz-relay`) are runbooks and were left as is. Prose truth is still not mechanically checked; the rule plus timeless content is the mitigation.
