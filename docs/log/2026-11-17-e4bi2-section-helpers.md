# Tuning sections: one shared derivation, editor section helpers, General heading

Id: e4bi2-section-helpers

`Aurora-e4bi.2`, pure code and unit tests, no UI. Plan: [[graph-editor-cleanup]] Stage 10. Rule (owner, 2026-11-17): the Dashboard shows the order the editor's Tuning shows.

## Done

- `web/ui/TuningControls.js`: `deriveSections(controls, ui)` replaces `groupBySection`. Named sections in first-appearance order, General (`''`) last, every control of a section together, so an ungrouped array (paste, `put_draft`, hand edit) draws the same on both screens. `SECTIONS_KEY = '#sections'` ([[e4bi10-sections-ui-key]]) only places empty sections, after the stored section each followed, else at the end before General.
- `web/ui/TuningFields.js`: a headless group that is not first is headed "General". The Dashboard passes no `ui`, so it draws no empty sections.
- `graph/controls.ts`: `sectionNames`, `regroup`, `moveControlToSection`, `renameSection`, `deleteSection` (controls go to General), `addSection`, `reorderSections`, `withSections`. They take `(controls, ui)`, never the doc, for sub-graph reuse ([[e4bi11-subgraph-readiness]]). Every controls edit writes the regrouped array and keeps `#sections` only while a section is empty. Opening a graph does not rewrite it.
- `addControl(doc, node, param)`: no catalog label, no node-title section, appends to General. The drawer row reads "No label" until one is typed.
- `GraphDoc.ui` is `Record<string, Position | string[]>` with `positionIn` to narrow. `removeNodes`, paste and layout keep or skip the key, and `parseClip` drops non-position entries.
- Demo vendor re-synced (`sync-webui.py`), byte-identity and seam checks pass.

## Open

- An empty section stored first lands at the end before General, a literal reading of the bead. One line in `deriveSections` if the owner wants it first.
- Untested: the Dashboard's General heading in the DOM, the drawer's add path.

## Verification

Sonnet agent, coordinator re-ran: typecheck clean, vitest 277/277 (was 260), `TuningControls.test.mjs` and `TuningFields.test.mjs` ok.

- Lessons: none
