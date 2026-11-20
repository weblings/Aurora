# Grille mock: narrow-window drawers

Id: daaa34-mock-narrow-drawers

`Aurora-daaa.34`. The mock now matches the editor's drawers ([[daaa29-4-bottom-dock]]) so narrow layouts can be judged.

- Side width `clamp(280px, 40vw, 350px)` as `--drawer-w`; below 650 px wide or aspect under 0.75 the drawer docks at the bottom, half height, with a Full/Half height button.
- Zone preview stays visible in both modes (steps left of a side drawer, stays top-right above the dock), large map included. Dashboard controls steps left of a side drawer; both bottom corner buttons lift above the half-height dock and hide at full height (README notes it).
- Frame strip: "Narrow (new window)" links open popups at 400x800, 700x900, 1000x600.
- Finding: the real editor has the same drawer-covers-preview problem on the side (`.zone-thumbnail` z-index 5 under the fixed Grille drawer); filed `Aurora-daaa.35`.

## Verification

- Headless Chromium screenshots at 400x800 (half, full, large map) and 1000x600 (side, large map): preview and buttons as described. Repo checks not run (mock only).

## Lessons

- none
