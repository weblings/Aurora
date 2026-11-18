# Browser checks: narrow parks the pointer before Esc

Id: e4bi18-narrow-tooltip-esc

`Aurora-e4bi.18`. `graph-editor:narrow` failed at 700x900 with "Esc left the drawer open". The bead suspected the Grille dev.17 drawer toggle; the toggle steps run only for the bottom dock and passed. The cause was a hover tooltip still open under the pointer: React Aria's `useTooltipTrigger` handles Escape on `document` in the capture phase and stops propagation, so the first Esc closed the tooltip and the Drawer never saw it (dismiss the topmost layer, intended). The check now moves the pointer to a corner before Esc. No product or Grille change.

## Verification
- `narrow` passes (rerun by the coordinator).

## Lessons
- web-testing.md: "A hover tooltip under the parked pointer takes the first Esc"
