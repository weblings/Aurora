# Wire the effect panel's row actions

Id: kep29-wire-row-actions

`Aurora-kep2.9`, under `Aurora-kep2`, built on the `Aurora-kep2.8` panel and
committed with it in `dc66b3f`. Closed 2026-11-05 with [[kep28-effect-panel]].

## State

- `web/ui/EffectPanel.js`: Rename in place, Delete alertdialog, Start from menu,
  and the focus moves and live region sentences (`actionAnnouncement`) for Hide,
  Unhide, Move, Duplicate and Delete.
- `DashboardScreen.js`: `_onPanelAction` calls the routes and refreshes the list.
  Deleting the running effect is a pending switch to the fallback built-in,
  derived from the saved `activeInputName`, so `/api/state` needed no new field.
  Effects and state refresh on window focus and `visibilitychange`.
- Core: `POST /api/effects/:id/duplicate` takes an optional `title` (max 80).
  The graph editor's `distinctTitle` now says "(Copy)". The editor bundle was
  not rebuilt.
- Tests: `EffectPanelModel.test.mjs`, `browser-check/checks/effect-panel.mjs` at
  760 and 390 px, the `Duplicate*` core test, editor vitest. Owner checked a
  Windows build on desktop and mobile: Duplicate and Delete work.

## Close, 2026-11-05

- Fake-Hue pass at 1280 and 390 covered every row action, see [[kep210-cut-over]].
- Owner iPhone pass covered the Actions menu and Delete's guard and confirm. The
  touch long-press was cut, see [[kep224-cut-long-press]].
- The `role=tree` question was settled by [[kep215-button-row-panel]].

## Open

- `Aurora-kep2.23`: the demo shim has no duplicate route, so Duplicate there shows
  the generic failure line.
- `Aurora-kep2.25`: Duplicate fails on a title over 73 characters.
- `Aurora-kep2.26`: a copy is not last in Custom until the order is saved.
- A custom effect file with no `title` shows its id and has no description.
  Nothing in the panel edits a description.

- Lessons: 2, in `docs/lessons/components.md`.
