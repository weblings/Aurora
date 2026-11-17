# Graph editor: Tuning is the only panel, controls are added from the node (design and mock)

Id: e4bi8-tuning-only-design

`Aurora-e4bi.8`, design session with the owner in ASCII sketches, then a mock. Replaces the Tuning and Node tabs of [[e4bi8-tuning-node-tabs-design]]. Plan: [[graph-editor-cleanup]] Stage 10. Build bead: `Aurora-e4bi.9`; `Aurora-e4bi.3`'s card menu updated. The bead stays open for the sub-graph interface placement (`Aurora-g5mz`). Nothing in the shipped editor changed.

## Why the Node tab went

- Review of the tabs mock: the Tooltip field switch (2) showed too little difference to judge, the toggle (3) and "Nothing" on switch-on (5) stay, and the Ports list gave the user nothing to act on.
- Without Ports, the Node tab's only own jobs were adding a param to Tuning and the node's purpose. Everything else (the Tuning label and section, Edit, Remove, going to the node) Tuning's cards already do. Too thin for a tab.
- Rejected on the way: an Add control... picker in Tuning (the author is already on the canvas, and adding gets one home); a selected-node strip at the foot of Tuning (it follows the selection, which the click model rejected); a multi-select submenu (Grille's `Menu` has only `selectionMode: 'single'`, and no Checkbox or Switch).

## Decided (owner, 2026-11-17)

- Tuning is the only panel. The mock keeps the tabs behind a Panel model switch, in case a second panel earns its place (sub-graph interface).
- Controls are added only from the node. Its menu (right-click, Shift+F10 or the `...` that already ships in `GenericNode.tsx`, faded until hover or selection since `Aurora-daaa.27.1`) drops Details and renames Show on the Dashboard to **Show in Tuning...**, hidden on a node without params.
- Show in Tuning... opens a non-modal popover beside the node (right, else left, by measured room, else below) with the node's params and the Dashboard's `.toggle-switch`. It is used on every node with params, one-param nodes included, and stays open while several are switched. Switching on appends to General.
- Purpose: the node title keeps its `Hint` with the catalog's short `tip`. A touch press on `...` starts the menu with that tip, as the Dashboard's effect menu does (`EffectPanel.js` `_openMenu`, touch only). No (i) glyph: the shell uses it for notices.
- Touch: a tap on a port or param name toggles its description in a popover; hover and focus keep the `Hint`. React Aria's `useTooltipTrigger` (3.53.1) opens on hover only for a mouse, on focus only when focus-visible, and closes on pointer down, so a tap never opens a tooltip. React Aria's touch route is long-press (`PreviewTrigger`), which `Aurora-kep2.24` cut from the Dashboard. No other node editor found documents tap-to-show port hints.
- Show on node stays on the card menu (visible and touch-reachable, unlike double-click). Show on node, double-click and Enter ping the param's row on the node: a 2 px ring inset 4 px from the node's sides and rounded, so it never meets the selection outline.
- Edit control's Tooltip field is a 3-row textarea.
- The word is Tuning everywhere: menu, picker, empty state ("No controls yet. Select a node, open its ..., and choose Show in Tuning."), toasts ("Removed X from Tuning.").
- For the build: today's `addControl` copies the catalog label and uses the node title as section (`controls.ts`), which predates the `.1` decisions (no label copy, append to General). `ControlsDrawer.tsx`'s "Remove X from the Dashboard" label changes too.

## Mock

`web/graph-editor/controls-mock.html`, Panel model b (default). Stand-in nodes use `GenericNode`'s classes (title `Hint`, faded `...`, ports, params) with drawn handle dots, not React Flow.

- Found: a remove from outside the Tree (the picker) crashed `CardRow`, because the Tree renders the removed card for one more frame.
- Found: at 400 px a "right top" picker first rendered past the window edge, focusing its first switch scrolled the document, and React Aria closed the popover on that scroll.
- Found: the docked drawer covered the lower stand-in nodes, so a tap on `...` landed on a Tuning card. The mock's node area now stops above the dock; the editor pans instead.
- Measured: a port name's hit box is 43x16 px, under the 44 px touch guideline.
- Critique follow-up (owner, 2026-11-17), decided after review: d, the muted dot, is the plan of record (plan Stage 10, built in `Aurora-e4bi.9`). A passive mark, no click shortcut (the glyph is far under the 24 px WCAG 2.5.8 target and sits against the label's tap hint) and no tooltip of its own (`Hint` would make it a tab stop). First mocked as: an In-Tuning mark switch puts Grille's `dotIcon` after the param label on the stand-in nodes, in the text colour (a), the secondary colour (b), Grille's `--ui-color-text-muted` (d, default since the owner asked to try it), or none (c, today). Hidden text ", in Tuning" in the label, not a tab stop, and the label's hint adds the Tuning label and section. The old diamond sat in the same place (`Aurora-daaa.27.3`, dropped in `Aurora-s1t7.5`). The audio preset exposes every param, so switch some off in the picker to see a mixed node.
- Owner review: the picker sat on its node and was hard to tell apart (now beside it), Open Tuning had no hover (now the menu row hover), the ping was too wide and crossed the selection outline (now inset).

## Grille

Filed in dev.17, each blocking the release `Grille-83g.10`: `Grille-83g.11` TextField multi-line form, `Grille-83g.12` Menu `aria-describedby`, `Grille-83g.13` Popover `offset` and `crossOffset`. Already filed: `Grille-83g.2` (TextField placeholder, autofocus, invalid, full width), `Grille-83g.7` (Tooltip `triggerRef` and `isOpen`).

## Open

- Sub-graphs (`Aurora-g5mz`): where the interface editor lives now that Tuning is the only panel. Next.
- Side pill: it shows and hides, but reads as a resize handle.
- The canvas View menu's name and contents (zoom, fit, minimap).
- In the build (`Aurora-e4bi.9`): a port name tap starts no wire and does not move the node (likely `nodrag`), the tap area padded to about 44 px, real iPhone behaviour, VoiceOver on the Tuning Tree (from `.1`).

## Lessons

- [[lesson-components]]: "React Aria closes a popover on a scroll around it, so a popover that focuses inside itself must use preventScroll" (new).
- [[lesson-components]]: "A React Aria Tree renders a removed item for one more frame, so row components must not assume it still exists" (new).
- [[lesson-components]]: "React Aria tooltips never open from a tap, so touch needs its own path to tooltip text" (new).
- [[lesson-planning]]: "A mock encodes assumptions about current behaviour" gains the `...` case: read the component that would hold a control before calling it new.
- [[lesson-planning]]: "Baseline a mock to the plan of record" now says to hide a mock's losing options and delete them only when they slow the work (owner).

## Verification

- `tsc --noEmit` clean.
- Headless Chromium (`tools/browser-check` helpers), mouse at 1100x800 and touch at 400x800 and 360x800: node menu with and without params (hidden and disabled), picker beside the node with no overlap at 1100 px, inside the window at all three widths, open across two switches, closed by Esc and an outside tap; touch menu tip line on a touch press only; port and param tap popovers open and close, mouse hover still shows the `Hint`; card double-click pings the param; Open Tuning hover; empty state copy; the tabs model still loads; no page errors.
- Not checked: React Flow behaviour under a tap (stand-ins only), real touch devices.
