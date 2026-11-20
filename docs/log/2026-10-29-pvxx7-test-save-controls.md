# E4: test on lights, Save, Save and apply, Dashboard controls

Id: pvxx7-test-save-controls

`Aurora-pvxx.7`, from [[sequence-e-planning]]: the editor can try a graph on
the lights and save it, and choose what the Dashboard's Tuning shows.

## Done

- **Test on lights** (`useLightTest.ts`, pure states in `graph/lightTest.ts`):
  sends the draft, starts a test, heartbeats at the server's interval, counts
  down between answers. Keep (`/api/graph/test/confirm`) and Revert; Keep is
  disabled once the document differs from the tested one (the server refuses
  it as `draft_changed` anyway, so this only saves the click). Heartbeat 404
  with `lastEnd` and `holder` becomes the toolbar sentence: an agent or
  another tab took the lights, heartbeat lost, time limit, stopped from the
  Dashboard, another effect chosen, lights paused. Three failed heartbeats show
  "Lost contact"; the server reverts by itself after 6 s. While idle the tab
  reads `GET /api/graph/test` every 3 s, so someone else's test shows and the
  button reads "Take over the lights". `pagehide` reverts at once.
- **Save / Save and apply / Keep** (`App.tsx`): a Name box edits the graph's
  `title`. A built-in is never overwritten: its writes go to a new id slugged
  from the title (`graph/save.ts`, numbered on a clash) and the editor then
  opens it; a custom effect is saved over its own id. The draft is re-sent
  before Save and apply; an invalid one is refused with its problem count.
  `?effect=` follows the open effect.
- **Inspector** (`Inspector.tsx`, `graph/controls.ts`): node purpose and port
  descriptions, a "Show on the Dashboard" checkbox per param, and the controls
  list with label, section and tooltip (applied on blur or Enter, one undo
  step), reorder and remove. New controls take the param label and the node
  title as section; an emptied tooltip drops its key; keys the editor does not
  know (`config` on built-ins) stay.
- Deleting a node now drops its controls: the loader rejects a control naming
  a missing node (`control_node_unknown`).

## Verification

Vitest 82 (19 new): controls edits, ids, every test state and sentence.
`tools/browser-check` (`Aurora-pvxx.11`) `graph-editor-edit-loop.mjs`, headless
Chromium on the dummy-input fake-Hue stack through the Vite proxy, all passing:
countdown and Revert, a takeover by an `mcp` client reported with the holder,
heartbeats blocked in the page ("Lost contact", then the server's test
inactive), Keep disabled after an edit, Save of a built-in as a new custom
(live effect unchanged), Keep, Save and apply switching the live effect, and a
marked param in `/api/graph`'s `controls`. The run found one bug: the
"Saved" notice was cleared by the effect load that follows Save as new.

Rerun against the editor embedded in the Mac binary (`build/mac-app`,
`AURORA_EDITOR=embedded`), also all passing, with two more steps: Tuning in
the WebUI shows the new control with the label and tooltip set in the
inspector, and the 120 s cap ends a heartbeat-fed test with the lights back
(`SLOW=1`, about 2 minutes). Building that binary after a source change failed
until `cmake` was rerun (stale hashed bundle in the embed glob): filed as a
bug under `Aurora-pvxx`.

Not run: Windows and Linux (E6 gate); the CI job on GitHub.

## Lessons

- none
