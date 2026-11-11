# Test split button and Zones island variant in the Grille mock

Id: daaa32-test-split-zones-island

`Aurora-daaa.32`. `web/ui/Static_GraphEditor_Mocks_Grille/` gains a Decisions switch, "Test split button + Zones island" (default off, original layout unchanged). On: one split button `[▷ Test ⌄]` replaces the status pill, Test on lights, countdown and Revert (menu: Once 15 s / Live until stopped; label is the state; Stop is the revert; Take over and Reconnect are its labels; Problems and offline disable it with a tooltip). The Zone preview becomes a "Zones" island copying `ZoneThumbnail.tsx` (regions at mapped positions, 14 px leftover cells 8 per row, one block per output) with a hover/focus corner icon toggling small and large (348 px). Engine and editor changes (15 s Once, untimed Live in core/Runtime LightTest) are not filed; they follow only if the variant is chosen. Placement context is [[graph-editor-cleanup]].

## Verification

- Headless Chromium, switch on: bar text for rest, Testing, Testing live, Problems, Take over, Reconnect matches the spec labels; zone map renders, large toggle and chevron hide work; menu pick starts Live. No console errors. Screenshots read for rest and large only.

## Lessons

- none
