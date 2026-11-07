# Touch long-press cut from the effect panel

Id: kep224-cut-long-press

`Aurora-kep2.24`, under `Aurora-kep2`. Amends the long-press decisions in
[[kep22-effect-panel-mocks]] and [[kep26-row-menu-flows]], and removes the fix from
[[kep221-long-press-first-tap]].

## State

- On an iPhone a long-press on a row selected its text and opened no menu. The owner
  cut the gesture: the visible Actions button already opens the same menu on touch.
- `EffectPanel.js`: the press timer, move tolerance and click-swallow flag are gone.
  A touch tap on Actions still starts the menu with the description line, so the
  description stays reachable on touch.
- The `contextmenu` handler stays, because the keyboard ContextMenu key opens the row
  menu and the browser's menu must not open with it.
- `effect-panel.css`: rows add `-webkit-user-select: none`, so holding one selects
  nothing.
- `effect-panel.mjs`: the long-press check became a touch tap on Actions.

## Verification

- `effect-panel` browser check and `web/ui` tests pass, demo copy re-synced.
- Owner touch pass on an iPhone: holding a row selects nothing, Actions opens the
  menu, Delete's double-tap guard and confirm work, layout holds.

- Lessons: 1, in `docs/lessons/components.md`.
