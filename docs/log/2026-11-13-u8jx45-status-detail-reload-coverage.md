# Graph editor: the dead open-failure status detail is gone, the reload row's coverage is checked

Id: u8jx45-status-detail-reload-coverage

`Aurora-u8jx.4.5` (P3), items 4 and 5 of `Aurora-u8jx.4`, left over from stage 6 ([[u68h9-open-failure-row]]). No rendered output changes.

## Item 5: the unused detail

- `graph/status.ts` gave the rank 1 open failure the detail `The error above says why.` Traced every use of `Status.detail`: `App.tsx` reads only `status.rank`, `status.label` (the header's `data-preview`, and the Test button's disabled tooltip when blocked) and `status.action`. Nothing reads `detail` or `where`, so no rank's detail is drawn, and the Test tooltip for an open failure is the label `No effect is open`, as [[graph-editor-cleanup]] says. Nothing was meant to show it.
- Removed the text: rank 1 open failure now has `detail: null`. The type stays `string | null` (the other ranks still set it and the field already defaulted to null), so no caller changed. The status test asserts `detail: null` for it.
- [[graph-editor-cleanup]] and the editor README never quoted the text; only the earlier log [[u68h9-open-failure-row]] does, as history, and is left as written.
- Left alone: the other ranks' details (`Retrying.`, the Reconnect and Take over text, the loop summary) are equally undrawn. That is a wider question than this bead (drop `detail` and `where` from `Status` altogether); not filed here.

## Item 4: the reload row's coverage claim

Verified, the wording in the browser-check README and the check comment is true. `ErrorShell.test.tsx` renders case `one error on a running host` (a `reload` error) and asserts the editor's markup equals `web/ui/shell.js` output; both files carry the prefix `Couldn't apply settings: ` (`ErrorShell.tsx` line 17, `shell.js` line 83). `web/ui/shell.test.mjs` asserts the Dashboard banner includes `Couldn't apply settings: No outputs available` (twice). The ErrorShell test does not name the wording itself; it holds through the markup match with `shell.js`. No wording fix needed.

## Checks

`npm test`, `npm run typecheck` and `npm run build` in `web/graph-editor`, `node web/ui/shell.test.mjs`, and the ErrorShell test pass. No browser check: nothing rendered changed.

## Lessons

none
