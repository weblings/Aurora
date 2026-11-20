# Tidy: the recipes page's layered layout in the editor

Id: y8ku-tidy-action

`Aurora-y8ku`, the follow-up from `Aurora-4g4d.3`. Content that arrives without node positions (MCP drafts, built-ins, a pasted clip with no `ui`) now gets the spacing the recipes page uses, and the editor has a Tidy action. See [[4g4d2-recipes-page]] for `layered`.

## What shipped
- **Tidy** in the Edit menu and the canvas right-click menu. With a selection it lays out only those nodes, keeping their top-left and pushing them clear of the rest. With none it lays out every node and refits the view. One history entry, measured sizes, "Already tidy" when nothing would move. Name kept as Tidy (owner). Houdini calls it Layout, Blender add-ons Auto-Arrange, Unreal plugins Format.
- **Open**: an effect that opens with unplaced nodes is tidied once, as an undoable edit that counts as unsaved. It runs once per open and never again, because dragging, adding and pasting all save positions.
- **Fallback**: `positionsFor` uses `layered` instead of `columnLayout` for nodes with no saved position. It never separates or moves nodes, since it runs on every rebuild (an earlier draft pushed nodes apart after a drag and was removed).
- **Paste**: a clip with no positions is laid out from its wiring, from the paste point. Before, its nodes stacked on one spot.

## Findings
- MCP content is not a paste. `put_draft` stores a private per-session draft, `apply` and `keep` save it as an effect with no `ui`, so it reaches the editor through `positionsFor` on open.
- The MCP cannot read or edit the graph open in an editor session. `docs/planning/WebDemoEditor.md` now says WebMCP is out of 1.2.0 for that reason (owner, 2026-11-20).
- `graph/doc.ts` and `graph/layout.ts` now import each other. Only functions are used across the cycle, so it loads.

## Verification
- `npm run typecheck` and `npm test` (356 tests) pass. New cases cover `tidyPositions`, paste with no positions and the layered fallback.
- Checked in a running editor on the fake-lights stack: not done, the owner was to look at the `tidy-layout-check` effect. The existing `tools/browser-check` editor checks were not run, and some may assume a freshly opened built-in is not unsaved.

## Lessons
- none
