# Wire the effect panel's row actions

Id: kep29-wire-row-actions

`Aurora-kep2.9`, under `Aurora-kep2`, built on the uncommitted `Aurora-kep2.8`
panel and committed with it. Awaiting owner review, so both beads stay open.

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

## Open

- Not run on the fake-Hue stack. Touch long-press not checked on a device.
- The demo shim has no duplicate route, so Duplicate there shows the generic
  failure line.
- `Aurora-kep2.7` found VoiceOver on iOS drops `role=tree` and chose the button
  row model, but `Aurora-kep2.8` built the tree. Needs an owner decision before
  `Aurora-kep2.10`.
- A custom effect file with no `title` shows its id and has no description.
  Nothing in the panel edits a description.

## Resume

Owner review of kep2.8 and kep2.9, then `Aurora-kep2.10` (cut over).

- Lessons: 2, in `docs/lessons/components.md`.
