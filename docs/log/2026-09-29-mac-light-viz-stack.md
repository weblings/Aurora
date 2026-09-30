# Mac verification of light-viz-stack / devstack.py (2026-09-29)

Closed `Aurora-df4`. `python3 tools/light-viz-relay/devstack.py up` on Mac (`build/mac-app` prebuilt) timed out waiting for a frame until two Mac-only assumptions were fixed; after that it ran end to end.

## Findings

- Config root: `--fresh` uses `$TMPDIR/aurora-fresh` on Mac (app logs `Config root:`), not `/tmp/aurora-fresh`. The script copied the zone map to the wrong dir; the README's step 4 had the same path. Both now use `tempfile.gettempdir()` / `${TMPDIR:-/tmp}`.
- Input: with `activeInputName` unset the Mac pipeline is idle by design (`app/mac/src/main.cpp` returns a null pipeline), so no frames flow. Script now sets `dummy` on non-Windows. The real input is `mac` (Screen Recording prompt), not exercised.
- Flags took effect (checked, not assumed): app env had `--fake-hue --fresh AURORA_DEV_LIGHT_TAP=1`; bridge log showed the app's GET/PUT and `stream conf-room-4zone -> active`; app held a UDP socket to relay :18244; SSE delivered 4-zone frames; connection reported `conf-room-4zone` (no Windows-style `conf-living-room` overwrite). viz.html served 200.
- `down` left no listeners on 8000/8215/18245/18244/18443 and no processes (process-group kill works on Mac).
- `--fresh` opens the WebUI in the default browser on Mac too (extra tab; not in the skill).

## Not verified

- Per-zone colours / zone map: `dummy` is uniform across all 4 zones, so this proves the chain, not the map. Needs `activeInputName: mac`.
- `validate.py passthrough` needs its own launch (tap address env), so it can't run against this stack. `color`/`frame` not run.
- Linux (`Aurora-beh`).

## Docs touched

`tools/light-viz-relay/devstack.py`, `.claude/skills/light-viz-stack/SKILL.md` (Mac status, `dummy` note, "hand the user the viz URL and leave the stack up" instruction), `tools/light-viz-relay/README.md` (step 4 path).

## Lessons filed

- `macOS's temp dir is $TMPDIR, not /tmp` (macos-gui.md)

The idle-by-design input is the existing "compiles/runs but silently does nothing" class (output.md no-op-stub lesson); not filed separately.
