# Graph editor: Preview island and sim layouts planned, per-node previews filed

Id: u8jx6-preview-island-planning

`Aurora-u8jx.6` (stage 7, epic `Aurora-u8jx`). Planning only, no code. The bead's design field now holds the mock brief and [[graph-editor-cleanup]] Stage 7 records the decisions. Also filed `Aurora-u8jx.17`, `Aurora-z9vu` and `Aurora-ugb8`, and moved release 1.1.4 to 1.2.0.

## Findings that set the scope

- The editor's preview stream runs from when the draft loads (useDraftLoop.ts) and hot-reloads on every edit. It runs the session draft, not the effect on the lights, and its frames also carry runtime errors to the Problems chip (App.tsx `groupProblems`). So the Zones island is the only place the draft's colours show before Test, and hiding it changes nothing else.
- Nothing is drawn on nodes today. The preview frame carries only final zone colours and errors per output (graph/frame.ts).
- The island hides itself at zero zones (ZonesIsland.tsx `count === 0`), which is the original bug: with the bridge down, the one view of the draft disappears.
- `Aurora-91cj` (fixed in fb618807) keeps the saved zone map on disk while the bridge is down, so a sim of the user's own room is possible.
- The preview stream `/api/graph/preview` is internal, not in the `/api/v1` list (PublicApiRoutes.cpp). Port types are already in `/api/nodes`, and the loader ignores the graph doc's `ui` (GraphLoader.hpp). So per-node previews need no public API change.
- Prior art: Unity Shader Graph (per-node previews, a Main Preview whose mesh can be swapped, Play mode apart), Unreal (node thumbnails, All Node Previews as a separate toggle for cost), TouchDesigner (a viewer per node), MADRIX (pipeline previews apart from an Output preview of what reaches the LEDs). None puts a play target on the preview window.
- Slow nodes (YOLO): [[node-graph-pipeline]] already plans async nodes that return the latest result plus its age, and `INode::supportsAsync()` is reserved. vvvv (async region plus HoldLatest), MediaPipe (flow limiter) and DeepStream (detector every Nth frame, tracker between) handle it the same way. ComfyUI's batch model does not fit continuous output. New concern: the editor preview builds its own graph, so a detector in both preview and live would run inference twice.

## Decisions (owner)

- The island is the editor's main preview, renamed Preview. Test is the only way to the lights (play mode) and never changes target from the island. A running test pulls the island to the real layout, and no reachable lights disables Test with a reason.
- A sim can be picked over working lights (the owner's XR habit of testing in a sim before the headset). Layouts: Lights, Sim: your room (saved zone map), Sim: basic room (4 quadrants, the demo's `ROOM_ZONE_MAP`). The word "Sim:" replaces a circled-info mark.
- The output is plain text until a second output exists. A future target choice (Hue, headset) goes in Test's split menu.
- A "Preview" Test target was rejected: the preview never stops, so Test would have nothing to do.
- Per-node previews go to 1.2.1. Values carry the time they were produced. Display is a static Async tag, the rate on hover, and dimming with a reason only when stalled.
- Release 1.1.4 ships as 1.2.0.

## Filed and changed

- `Aurora-u8jx.6`: retitled, design rewritten (decisions, leans to confirm, 10 frames), notes gained the prior art.
- `Aurora-u8jx.17` (1.2.0): core test that `ui` entries keep extra keys through draft PUT, GET and save.
- `Aurora-z9vu` (1.2.1): live previews on each node, blocked by `.17`.
- `Aurora-ugb8`: the pre-commit link check fails when `web/graph-editor/dist` is not built.
- 87 beads relabelled 1.1.4 to 1.2.0, five bead texts and [[api-v1-plan]] and [[api-v1-review]] updated (dated history reads "1.1.4 (now 1.2.0)"), by a Haiku subagent and checked after.
- 141 records that were only in `.beads/issues.jsonl` were imported into the local store (add-only, no existing record overwritten).

## Verification

- Doc checks only (lessons, links) through the pre-commit hook. Repo builds and tests not run (planning only). Every bead field written was read back and compared with its source file.

## Lessons

- The local Dolt store can fall behind `issues.jsonl` (`bd show` reports a bead missing, and auto-export refuses to overwrite). Import only the missing ids with `bd import <file>` rather than `bd init --from-jsonl`, which can replace data.
- Non-ASCII characters passed as `bd` arguments on Windows arrive as mojibake. Keep field text ASCII (now in the `bead-field-writes-guard` memory).
- The pre-commit link check fails on a backticked `dist/` path when the editor is not built (`Aurora-ugb8`). Building the editor clears it without bypassing the hook.
