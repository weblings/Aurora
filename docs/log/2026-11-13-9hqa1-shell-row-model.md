# Error shell: one row model for both pages, the Dashboard patches rows by key

Id: 9hqa1-shell-row-model

`Aurora-9hqa.1` (P2), stage 6 follow-up 2.1 under `Aurora-9hqa`. Working tree only at the time of writing; the coordinator commits and closes. See [[error-overlay]] (The banner, Rows) and [[u8jx14-shell-spotlight-mock]] for why the keyed patch matters to the arrival spotlight in `Aurora-u8jx.5`.

## What was built

- `web/ui/shellRows.js` (plain JS, like `messages.js` and `testHolder.js`): the row model both pages draw from. `orderRows` (light test, pairing requests, conditions as sent, errors newest `id` first with id-less ones last, then page notes), row keys (error and condition: source + message; light test: holder session + `live`/`once`, no countdown; pairing: ref; note: text; a repeated key gets `#2`), `layoutRows` (the unchanged collapse rule: two or more problems fold to a `summary` row, expanded they gain a `less` row; the light test and pairings are not problems), `collapsedLabel` (`1 problem`, `N problems`), `renderRow` (html per row; every root has `data-key`, every button `data-action` and `data-key`), `bannerRows` and `bannerHtml`. `SOURCE_PREFIX` and the error sentence moved here (`errorSentence`) from `shell.js` and `ErrorShell.tsx`, as did the light-test sentence and clock.
- `web/ui/shellPatch.js`: `planPatch(prev, next)` is pure (removes first, then keep, replace or insert per next row in order, so a reorder is all keeps); `applyPatch(slot, rows)` is the thin DOM half (a `<template>` builds a changed row; a kept row is never touched; the signature lives on the node as `data-sig`).
- A row is kept only when its key and signature both match. The signature is the row html, except the light-test countdown text is left out (its own 1 s timer ticks it), so a poll never replaces the Stop test row. This is why the planner takes `{key, sig}` for the previous rows rather than bare keys: a running host turning paused changes the same row's Dismiss and wording under an unchanged key.
- `shell.js`: `_bannerHtml()`, `_renderBanner` calls `applyPatch`, one delegated click listener on the slot calls `_act(action, key)` (`expand`, `collapse`, `retry`, `dismiss`, `stop-test`, `approve`, `deny`). No per-render listeners. A stub slot with no `ownerDocument` (unit tests) gets the whole html written instead of a patch.
- `ErrorShell.tsx`: rows come from `orderRows` and `layoutRows`, React key = row key, `data-key` and `data-action` attributes match the Dashboard's, and the permission rows share `permissionRowHtml`. `ErrorShell.test.tsx` parity reads `_bannerHtml()`.

## Behaviour changes

Only the two the bead names: the light-test row now sits above pairing requests (it was below), and errors are drawn newest first by id (the daemon's array is first-seen order, `Pipeline.cpp:993`). Focus on Retry, Dismiss and Stop test now survives a poll. A changed message is a new key, so the editor remounts that row only. The collapse rules are untouched (that is `Aurora-u8jx.5`).

## Findings

- The raw message sits in `data-key`, so the old unit assertions that a reworded message (`screen_share_declined: ...`) is absent from the html now strip `data-key` first.
- `web/demo/vendor/sync-webui.py` reports no new import: the demo does not vendor `shell.js`, so the new modules are unreached and `MANIFEST.json` is unchanged. The script also rewrites `sourceCommit` and `descriptors.json` (line endings); those were reverted as noise.
- The Dashboard is served from the live `web/ui` checkout, not baked into the app binary, so the browser check needed no rebuild.

## Checks

- Unit: `shellRows.test.mjs`, `shellPatch.test.mjs` (new), `shell.test.mjs` (now drives `_act` and reads `_bannerHtml()`), graph-editor `npm test`, `npm run typecheck`, `npm run build`, seams test.
- Browser, `checks/dashboard-shell.mjs` (`npm run dashboard-shell`, new, runs against the app's own Dashboard through `withAuroraStack` in `lib/stack.mjs`): with a dev error and an agent's live light test drawn, keyboard focus on Retry and on Stop test survives three `/api/state` polls on the same nodes; a second POST `/api/dev/errors` with the same source and new text replaces only the error row (the light-test row node is the one tagged earlier and keeps focus). Confirmed to fail (focus lost at the first poll) when the applier is forced to rewrite innerHTML. `graph-editor:error-shell` still passes unchanged.
- Not checked: Dismiss focus across polls (same mechanism as Retry), pairing rows in a browser (unit only), reorder of kept rows in a browser (the applier moves nodes; the planner is unit-tested).

## Lessons

- none new.
