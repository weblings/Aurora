# Graph editor: Status no longer carries the undrawn detail and where fields, and Take over's tooltip is drawn

Id: uds2-status-undrawn-fields

`Aurora-uds2` (P3), found in [[u8jx45-status-detail-reload-coverage]]. The one rendered change is the Take over tooltip, below.

## What changed

- Re-traced the consumers across `web/graph-editor/src`, tests included. `App.tsx` calls `pickStatus` once and reads only `rank`, `label` and `action`. Nothing reads `detail` or `where` except `status.test.ts`. No consumer was meant to draw `detail` (the Test button's tooltip is the label), so none was wired in.
- `graph/status.ts`: `detail` and `where` are gone from the `Status` type, and `at(rank, label, action)` takes only what is kept. The loop summary's own `detail` (`summarize` in `graph/loop.ts`, tested in `loop.test.ts`) stays; `pickStatus` uses only its label.
- `graph/status.test.ts`: assertions on `where` and `detail` now check `rank`, `label` and `action` instead (the "stays out of the status" cases assert rank 7, the quiet default), so the priority order keeps the same coverage.
- [[graph-editor-cleanup]] and the editor README describe where each state shows in the UI as prose only; neither names a `where` or `detail` field as code. No edit needed.

## The Take over tooltip (review finding)

Rank 5's `detail` was meant to be drawn: [[graph-editor-cleanup]] says the `Take over` button's tooltip names the holder, and `lightsInUseText` is documented as that tooltip. `SplitTestButton` never drew it (the tooltip was the generic Test line), and dropping `detail` would have removed the text's last home. Fixed here, not by re-adding a `Status` field:

- `SplitTestButton` takes `takeOverHint: string | null` and uses it as the main button's tooltip when the action is Take over.
- `App.tsx` passes `lightsInUse(lights.state, otherHeld?.holder ?? null)`, the same call `pickStatus` makes.
- The `lightTest.ts` comment on `lightsInUseText` no longer claims `data-preview` (that is `status.label`).
- `graph-editor-error-shell.mjs` hovers `Take over the lights` while an agent holds the lights and asserts the tooltip is `Lights in use: an agent is testing`.

## Checks

`npm test`, `npm run typecheck` and `npm run build` in `web/graph-editor` pass. `graph-editor:error-shell` (with the new tooltip assertion) and `graph-editor:top-bar` pass under the stack lock. The Take over tooltip is the one rendered change.

## Lessons

none
