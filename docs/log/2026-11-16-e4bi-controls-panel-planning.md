# Graph editor: Dashboard controls panel redesign planned as stage 10

Id: e4bi-controls-panel-planning

`Aurora-e4bi` (now the stage 10 epic, 1.2.0). Planning only, no code. [[graph-editor-cleanup]] Stage 10 holds the plan. Also filed two 1.2.1 items: sticky note or comment nodes, and sub-graphs.

## Findings that set the scope

- The panel is `ControlsDrawer.tsx`. Each row is `node title · param id` on one line with three icon buttons, so most ids truncate. The second line joins label and section and prints "No label" when both are empty.
- "No label" misleads. Tuning falls back to `decl.label ?? decl.name` (`TuningControls.js`), so an empty label is not empty on the Dashboard.
- The audio preset sets only `section` ("Response speed", "Sensitivity", "Color character") and no label. What the drawer showed as the name was the section.
- A section is a free-text string on each control. It has no object, no order of its own, and no create, rename or delete. Tuning starts a heading whenever the string changes between neighbours (`groupBySection`), so a split section prints twice.
- Tuning draws no heading for an empty section.
- `addControl` defaults the section to the node title, so three single-control nodes gave three one-control headings.
- The loader calls `controls` frozen in the format and validates only its shape and references. A search of `core` found one other reader, `PresetRoutes.cpp`, which lists control labels in array order. Array order affects display only, never evaluation.
- Text tiers: Grille has text, emphasis, secondary, muted and disabled. Aurora's own tokens have primary and secondary. Rocky Road's song card has a title and a subtitle. Grille has no list-reorder or drag support.
- Selecting a node already exists: `selectNode` in `App.tsx` selects, focuses and `fitView`s it. The ping is the shell's `shell-ping` keyframes. Nothing focuses a single param.
- Prior art for sections: Substance Designer names groups by string, which is Aurora's current model. Figma, TouchDesigner and Houdini make groups real objects with rename, delete, nesting and drag. WCAG 2.5.7 asks for a single-pointer alternative to any drag, and move buttons or menus meet it. Blender's group interface was not confirmed.
- Side-panel convention found in design systems (Cloudscape, Workday): a toolbar toggle, with the panel floating or pushing the content. None was node-editor specific.

## Decisions (owner)

- Keep the corner Dashboard controls button for this version. Move it later if a higher-priority control needs the space.
- Cards show the effective label only. Node and param go to the tooltip and accessible name. Two text tiers at most.
- Sections stay derived from the array as runs. The panel gets real section actions (a panel menu, a section menu, accordions) without new stored objects, so the format is unchanged.
- General is the default section, stored as an empty string, last in the drawer. Tuning headings a non-first headless group "General". New controls append, so they land in General.
- Deleting a section moves its controls to General. Rename and delete are batch edits with one undo step.
- Empty sections vanish on reload.
- Move to section is a submenu of existing sections, never a string field.
- Double-click or Enter on a card selects the node. No ping.
- Drag is built last and may slip past 1.2.0, since the menus already do every move.
- The mock is the first sub-bead.

## Filed

- Epic `Aurora-e4bi` with `.1` mock, `.2` section helpers and the Tuning heading, `.3` card list, `.4` sections, `.5` drag, `.6` check and docs. `.3` depends on `.1` and `.2`, `.4` on `.3`, `.5` on `.4`, `.6` on `.3`.
- 1.2.1: `Aurora-i6cj` sticky note or comment nodes, and `Aurora-g5mz` sub-graph support. Neither is scoped yet, and both need checking against the `/api/v1` format freeze in 1.2.0.

## Lessons

- A row that joins fields hides which field supplied the text: `../lessons/planning.md` "A row that joins fields hides which field supplied the text".
- Filing an epic with children is slow, because every `bd` write exports: `../lessons/architecture-process.md` "Filing an epic with children takes minutes".