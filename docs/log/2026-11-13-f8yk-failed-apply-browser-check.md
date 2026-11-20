# Browser check: a Save and apply that cannot run shows as an error-shell row

Id: f8yk-failed-apply-browser-check

`Aurora-f8yk`. `graph-editor-failed-save.mjs` now drives a Save and apply the server accepts but cannot run: the effect is made the running one, then the server's draft is swapped for an audio graph while the dummy input has no audio. Aurora's own row appears in the editor and on the Dashboard (not the editor's `Couldn't save`), and applying a working graph clears it.

Found: the row is the effect failure's (`_failEffect`, with Retry and Open Settings), not the `Couldn't apply settings: <reason>` reload wording; that needs the running effect itself to fail to rebuild, which the fake-Hue stack cannot cause, so that wording stays unit-tested only (`ErrorShell.test.tsx`). The editor reloads what Aurora applied, so it holds the audio graph and its own preview says `Draft would not load` with Test off; "Test stays on" is asserted only for the refused Saves.

## Verification
- `graph-editor:failed-save`, `graph-editor:error-shell` and `graph-editor` pass.

## Lessons
- none
