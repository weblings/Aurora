# Browser checks: the editor regression set on one stack

Id: 1n1u-browser-check-set

`Aurora-1n1u`. `npm run graph-editor:set` (`tools/browser-check/checks/run-set.mjs`) runs the editor regression set against one fake-Hue stack and one Vite dev server instead of bringing both up for every check. Each check still runs in its own Node process and browser and prints its time. `LOGS=<dir>` keeps each check's output with the seconds since it started on every line. Single-check npm scripts are unchanged and bring up their own stack. Checks see the shared stack through `AURORA_SHARED_STACK` (`lib/stack.mjs`).

Also: `settle(page)` in `lib/waits.mjs` waits for fonts, finite CSS animations and a still canvas transform. It replaces 13 fixed sleeps in `graph-editor:narrow` and the layout sleeps in `graph-editor:gate`. `graph-editor` (edit loop) polls for the server's heartbeat revert instead of sleeping 7 s.

Editor drafts outlive their tabs: up to 16, kept for an hour. On a shared stack they piled up until the server refused new ones around the 10th check, and `clipboard` then failed. The runner now counts free draft slots before each check and restarts the app (same port and config, 7.3 s) when fewer than 6 are left. That happens once per full run.

## Timings (Windows, same machine, 2026-11-17)

| | stack per check | `graph-editor:set` |
|---|---|---|
| Original 15 checks | 428 s | about 246 s |
| Default set (16, with `tuning-sections`) | n/a | 257 s |
| Setup per check | `devstack up` 9.0 s, Vite about 2 s | 10 s once |
| narrow | 61 s | 17 s |
| graph-editor | 37 s | 19 s |
| top-bar / failed-save | 23 / 24 s | 11 / 12 s |
| fastest checks | 13-14 s | 2-4 s |

## Not done

- The acceptance target (under half of the baseline, 214 s) is missed: 246 s is 57% of 428 s. Most of what is left is real product timers: `refused-save` waits out the 4.2 s callout five times (42 s), `undo-toast` proves the toast outlasts its 8 s hold while hovered (17 s of its 23 s), and `graph-editor` waits for the server's 6 s heartbeat timeout. Follow-up: `Aurora-1n1u.1`.
- Running checks in parallel on one stack was tried and dropped. `refused-save` beside the others failed, because it asserts that the server's effect list is unchanged, and the extra open tab used up the draft slots `narrow` needed. `title-menu` and `top-bar` count effects too.
- There is no route to list or clear drafts, so the runner restarts the app to clear them.
- `graph-editor:gate` fails the same way with and without the runner: it waits for an Undo button the bar no longer has (`Aurora-e4bi.19`). Its 45 s includes a 30 s timeout.

## Verification
- `npm run graph-editor:set`: 15 of 16 pass in 257 s. The one failure is gate, as above.
- Baseline for the table: the 15 single-check scripts run one after another from a clean checkout of `5ab40689`. 14 of 15 pass, gate fails.
- `npm run graph-editor:control-count` alone still brings up and tears down its own stack (13 s).

## Follow-up
- `Aurora-1n1u.1` (further timer cuts toward 214 s) was filed without the owner asking and closed unworked on 2026-11-20. `Aurora-1n1u` stands as done.

## Lessons
- none
