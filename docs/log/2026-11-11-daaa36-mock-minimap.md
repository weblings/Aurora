# Grille mock: minimap above the zoom menu

Id: daaa36-mock-minimap

`Aurora-daaa.36`. Mock only: `web/ui/Static_GraphEditor_Mocks_Grille/`. Owner decisions from 2026-11-11 (review of the mock's corners and icons).

## Mock changes

- View menu Minimap item toggles a real minimap (it was a toast). The map sits bottom-left directly above the zoom button; the View menu opens above the map, so its Minimap item stays reachable.
- The map lifts with the bottom dock and hides at full height, like the other bottom corner buttons. Frame: Minimap on.
- Gradient stops frame: one row per stop, Zest `minus` removes a stop (off at the 2-stop minimum), Vidstack `add` appends one.
- Corner positions in the mock README corrected (zoom bottom-left, Dashboard controls bottom-right).
- Dashboard-mark diamond cut; Zest `minus.svg` added to `web/ui/icons` for Grille to ship.

## Verification

- Headless Chromium (playwright-core from `tools/browser-check`): no page errors on any frame; with the minimap on, the View menu's bottom edge (618 px) sits above the map's top (624 px); gradient stop buttons: remove enabled on 3 stops.
- Screenshots of At rest, Minimap on, Gradient stops and the 400x800 dock checked by eye.
- Repo checks not run (mock only).

## Lessons

- none
