# Test split button and Zones island variant in the Grille mock

Id: daaa32-test-split-zones-island

`Aurora-daaa.32`. `web/ui/Static_GraphEditor_Mocks_Grille/` gains a Decisions switch, "Test split button + Zones island" (default off, original layout unchanged). On: one split button `[▷ Test ⌄]` replaces the status pill, Test on lights, countdown and Revert (menu: Once 15 s / Live until stopped; label is the state; Stop is the revert; Take over and Reconnect are its labels; Problems and offline disable it with a tooltip). The Zone preview becomes a "Zones" island of plain cells, one per zone, 8 per row, for a single canonical output, with no screen mapping (zone regions can overlap and every zone starts full-screen, so a mapped box hides zones). The size toggle (small/large, 348 px) sits in the header beside the hide chevron, not the bottom-left corner: there it covered a cell, since rows fill from the left. First cut mapped zones as `ZoneThumbnail.tsx` does (d643ce57). Engine and editor changes (15 s Once, untimed Live in core/Runtime LightTest) are not filed; they follow only if the variant is chosen. Placement context is [[graph-editor-cleanup]].

Decision (owner): if the island reaches the editor, zone cells are DOM elements (colour written from the preview ref loop, no React state), not the `ZoneThumbnail` canvas. Zone counts are small today: LED strips are not supported yet. Revisit if an output with hundreds of zones lands; canvas would then need hit testing for tooltips.

## Verification

- Headless Chromium, switch on: bar text for rest, Testing, Testing live, Problems, Take over, Reconnect matches the spec labels; zone cells render, large toggle and chevron hide work; menu pick starts Live. No console errors. Screenshots read for rest and large only.

## Lessons

- none
