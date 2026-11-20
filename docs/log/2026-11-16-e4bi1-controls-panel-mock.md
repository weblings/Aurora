# Graph editor: Dashboard controls panel mock on React Aria and Grille (paused)

Id: e4bi1-controls-panel-mock

`Aurora-e4bi.1`, paused for owner review. Plan: [[graph-editor-cleanup]] Stage 10; planning log [[e4bi-controls-panel-planning]]. Decisions are recorded in the bead's notes as they were made. Next: `Aurora-e4bi.8`, a design session on what the node Details drawer needs beside the panel, or whether it should exist.

## Where the mock is

- A dev-only React page, not the static Grille mock, so it runs on real Grille (dev.16) and React Aria (1.22.1): `web/graph-editor/controls-mock.html`, code in `web/graph-editor/src/mock/`. Run `npm run dev` in `web/graph-editor`, open `/graph-editor/controls-mock.html`. Not part of `vite build`. The static mock's README has a pointer.
- Strip switches: data (audio preset, long names, General only, empty), head, view (panel or a board of every naming-dialog state), error look, icon alignment, card editing; popup links for window sizes.

## Decisions (owner)

- Panel: a React Aria Tree. Sections are rows in the Dashboard accordion look (filled pill on `--aurora-surface-hover`, radius 8, 14 px, chevron right); cards are 1 px outlined rows with one text tier. Subtitle cut. Head: title, muted count, `...` menu, a rule, then the window controls (x kept, not a chevron).
- Move to section lists only the other sections, then New section..., which creates and moves in one step. Move up and down stop at a section's edges. Headings only reorder among headings; all sections collapse while one is dragged. General is always last, has no grip or menu, and the list is flat when General is the only section.
- Clicks: no selection. A single click or arrow key on a card does nothing on the canvas; double-click or Enter selects the node and fits the view. A section row toggles on click or Enter. Single-click selection (Unity and Unreal model) was rejected: arrow keys would select off-screen nodes and a drag press would select one.
- Rename... on the card menu. `addControl` stops copying the param label, and an empty label removes the key.
- One naming dialog (Grille) for Add and Rename section, Save as new, Rename effect and Rename control. No visible field label; the title names it. An error blocks the confirm, a notice does not. Project rules (the stage 7 words): error and notice only, colour only on the mark, both in the error shell's outlined row box, mark vertically centred. Copy follows the Dashboard: `Another section is named "X".` Save as new opens on a free name (`X (Copy)`); Rename effect blocks taken names as the Dashboard does; 80-character limit.
- Shells: keep Aurora's own `shell.css` markup with the centred-mark layout on both pages (the `Aurora-u8jx.5` precedent: Grille values and SVG paths copied in, no Grille classes). The naming dialog uses Grille's MessageRow; both shells move to it with `Aurora-4nqt`. An earlier choice to have the Dashboard copy Grille's markup was withdrawn after reading the precedent.
- Bottom dock only below 650 px wide (`Aurora-daaa.37`): every portrait window 650 px or wider leaves more canvas beside a side drawer than 700x900, which was already kept on the side.

## Filed

- GrilleDS epic `Grille-83g` (label `dev.17`), in the owner's order: MessageRow (`.1`), TextField label-less with autofocus, placeholder and invalid (`.2`), Dialog title and actions bar (`.3`), disabled primary keeps its look (`.4`), borderless icon button (`.5`), Drawer head actions slot (`.6`), Tooltip on a non-trigger (`.7`), Tree with sections and drag and drop (`.8`), grip icon (`.9`), release (`.10`).
- Aurora: `Aurora-e4bi.7` (bump to dev.17, blocks `.3`), `Aurora-e4bi.8` (Details design, blocks `.3`), `Aurora-daaa.37` (dock rule).
- The epic restructure (Tree from `.3`, new beads for the naming dialog and the shared message row, `.5` rewritten as drag on the same Tree) was proposed and not yet applied.

## Findings

- React Aria's Tree gives keyboard drag with built-in announcements and skips invalid targets; `getDropOperation` returning `cancel` draws no indicator. No visual states of its own: all styling is ours on `data-dragging` and `data-drop-target`.
- In react-aria-components 1.22.1 a standalone `Tooltip` (triggerRef plus isOpen) crashes; see lessons.
- Text fields inside a Tree row lose arrow keys, Home and Space to the row, and saving per keystroke throws the caret to the end; see lessons.
- `Tree` and `TreeItem` take no `onKeyDown`; Enter on a card is caught on the drawer body.
- Tuning reads `control.label ?? decl.label ?? decl.name`, so a stored empty label shows blank, and `updateControl` keeps an empty label (from reading the code, not run).
- The editor centres its toast on the window under any drawer (z 20 vs 30), so an open drawer partly covers Undo. Not filed yet.
- The catalog's longest param label is 22 characters and fits at 281 px; long names come only from typed labels and sections.
- Measured label room: 230 px at a 351 px drawer, 160 px at 281, 280 at a 400 px dock; an expanding-card chevron costs 30.
- GrilleDS had no local beads database on this machine; `bd bootstrap` built it from the tracked export (53 beads) and added a Dolt remote, removed afterwards.

## Open

- Card editing: Edit in Details (B) or the expanding card, and a back link in Details; folded into `Aurora-e4bi.8`.
- Remove with an Undo toast (new in the mock); the param ping after the fit (reverses "no ping"); the toast under drawers bug; matching the Dashboard's inline effect rename wording.
- Device checks: VoiceOver on iOS with the Tree's treegrid roles (an earlier lesson found tree roles dropped), touch drag.

## Verification

- `tsc --noEmit` passes. Frames, menus, the dialog board and keyboard paths were driven headless with `tools/browser-check`'s Chromium and screenshotted; nothing in the shipped editor changed. Not committed.

## Lessons

- [[lesson-components]]: "React Aria's standalone Tooltip crashes without a TooltipTrigger"; "Text fields inside a React Aria Tree row lose their keys to the row"; "React Aria's replace selection is what makes double-click an action, and it selects on click and arrows".
- [[lesson-planning]]: "Read the project's settled message words before adding a tone"; "A mock switch that forces a state the product cannot reach misleads the review".
- [[lesson-layout-css]]: "Judge a responsive layout switch by the room it leaves the content".
- [[lesson-architecture-process]]: the Grille change-request entry now covers a clone with no local beads database (bootstrap, then remove the Dolt remote it adds).
