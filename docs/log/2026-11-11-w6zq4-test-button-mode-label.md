# Test split button shows its mode

Id: w6zq4-test-button-mode-label

`Aurora-w6zq.4`. The Test split button names the mode at rest: `Test (15s)` for Once, `Test (Live)` for Live. Running still shows `Stop 0:12` / `Stop`; `Take over` and `Reconnect` are unchanged. The menu items still start a test on pick, and the accessible name stays `Test on lights`. The chevron flip had already moved to Grille (dev.10, `Aurora-w6zq.6`).

## Verification

- vitest 132/132, `tsc --noEmit` clean.
- `graph-editor:narrow` asserts `Test (15s)` at 1470 to 400 px; `graph-editor:top-bar` asserts `Test (15s)` at rest and `Test (Live)` after a stopped Live test.
- All 20 `graph-editor:*` browser checks pass, including `control-count` (video 11, audio 10).
- A first run failed only because another Aurora held WebUI port 8215; the dev stack passes once that port is free.

## Lessons

- none
