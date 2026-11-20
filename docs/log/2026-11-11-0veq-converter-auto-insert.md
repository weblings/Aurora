# Auto-insert Float/Angle converter on drop

Id: 0veq-converter-auto-insert

`Aurora-0veq`: dropping a Float wire on an Angle input (or the reverse) now inserts the converter from [[jsjj-angle-converters]] as a visible node, wired both sides, the way Unreal inserts casts. Editor only: the saved graph holds an ordinary node and two ordinary edges, so the format and loader are unchanged.

## Done

- `connection.ts`: `converterFor` names the converter for Float to Angle (`angle.fromFloat`) and Angle to Float (`angle.toFloat`), nothing else. `insertConverter` adds the node and both edges and checks the second hop with `refuseConnection` (input taken, cycle, one sender per output), returning the reason instead of a document when it fails.
- Placement: midway between the two nodes, moved down past any node it would overlap (estimated heights, `COLUMN_WIDTH - 20` wide).
- `App.tsx`: `isValidConnection` accepts a convertible pair; `onConnect` inserts through one `edit`, so undo removes node and wires together, and toasts "Inserted <id> to convert Float to Angle". Every other mismatch still shows the existing refusal.
- `converter.test.ts` (4 cases) and `tools/browser-check/checks/graph-editor-converter.mjs` (`npm run graph-editor:converter`).

## Verification

- Graph-editor vitest 133 passed, `tsc --noEmit` clean.
- Browser check against a rebuilt mac app: both drops insert with two new wires, one undo reverts, an Image on an Angle input still refuses.

## Not done

- The Grille mock still ships its own mock-only converters.
