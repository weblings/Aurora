# E3: draft, validate and preview loop

Id: pvxx6-draft-preview-loop

`Aurora-pvxx.6`, from [[sequence-e-planning]]: the editor sends its document
as a session draft and shows what the server says back.

## Done

- **Draft out** (`useDraftLoop.ts`): the document goes to
  `PUT /api/graph/drafts/:session` 250 ms after the last edit. One session id
  per tab, kept in `sessionStorage` so reloads reuse the draft instead of
  filling the server's 16 slots. An invalid draft is saved too; the answer's
  `errors` drive the badges.
- **Badges** (`graph/problems.ts`, `ProblemsContext`): each issue lands on its
  node, and on the port or param it names (`port`/`param` fields). Header badge
  `⚠ n`, `⚠` on the port, dashed outline plus message under the param, unpinned
  messages under the node header. Issues with no node, or a node not in the
  document, go to a graph-level list. Preview runtime `errors` merge in. The
  palette is monochrome, so problems read by glyph, dashed outline and text.
- **Preview** (`EventSource` on `/api/graph/preview`): opens after the first
  valid draft; the server hot-reloads later drafts. Frames go to a ref and a
  canvas (`ZoneThumbnail`) drawn on animation frames, never React state; the
  thumbnail is dimmed unless live. Error zones are striped with a white edge.
  Zones carry only an id, so cells are a wrapped grid, one block per output,
  not the room layout.
- **States** (`graph/loop.ts`, a pure reducer; header shows one line):
  `Live preview`, `Connecting`, `N problems` (stream keeps its last frame),
  `Draft would not load` (`draft_invalid` event), `Preview paused`
  (`pipeline_gone` or `cannot_preview`; reopens every 2 s, so resume brings it
  back), `Preview taken over` (`replaced`; Reconnect button, no auto-retry),
  `Aurora unreachable` (retry 3 s), `Draft not sent` (429/413 reason in the
  tooltip). `draft_deleted` re-sends the draft. `EventSource`'s own reconnect
  is never used: every end closes it and the hook decides.
- Without a live pipeline the editor shows `Preview paused` with the server's
  message; it takes no position on `Aurora-que2`'s fix and will pick it up
  as-is.
- `vite.config.ts`: the dev proxy sets `Origin` so writes pass the same-origin
  gate (lesson note added).

## Verified

Vitest 63 (15 new): issue-to-badge mapping (node, port, param, unpinned,
unknown node, runtime errors, dedupe), every loop state and transition,
frame parsing and cell layout. Typecheck and `vite build` pass.

Live, headless Chromium on `devstack.py up --input dummy` through the Vite
dev proxy on `builtin.video`: Live preview in under a second; setting the
gain node to 0 blacked the thumbnail in about 400 ms; deleting `floor_hue`
gave `1 problem` with the badge and `⚠` on `send_hue.frame`; Undo returned to
Live; `PATCH /api/v1/state {"running": false}` gave `Preview paused` and
resuming gave `Live preview` again. Not run: `replaced`, `draft_invalid`,
429, the embedded (CMake-built) editor, Windows, Linux (E6 gate).

## Lessons

- Dev-proxy write gate: addendum to the Origin-vs-Host entry in
  the web-testing lessons (no new entry).
