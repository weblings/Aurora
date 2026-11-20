# Title menu: New and Open submenus

Id: iryq-title-menu-new-open

`Aurora-iryq`. The graph editor's title menu is one Grille `Menu` instead of two: Save, Save as new, Save and apply, Rename (no ellipsis), a separator, then `New` and `Open` as `SubmenuItem`s. The old fixed 280px width and the second "Open another effect" menu are gone.

- **Grille dev.11.** The first pass stopped at the Step 0 gate: dev.10's `SubmenuItem` had no max-height or class prop. Grille dev.11 adds `SubmenuItem maxHeight` (default cap 480px, never past the screen) and `MenuSection`. `web/graph-editor` is bumped to `v0.1.0-dev.11` (package.json, lockfile, README); same files as the dev.10 bump. Nothing else pins Grille or copies its CSS (the static mocks are not touched).
- **New** is a `Start from` `MenuSection`: Empty (the blank graph, `BLANK_ID`) then the built-ins, hidden ones included, Music pulse only when `/api/capabilities` reports an audio input. `graph/titleMenu.ts` `startPoints()` copies the rule of `startPoints()` in `web/ui/EffectPanelModel.js`.
- **Open** lists every other effect in Custom then Built-in sections, using the default Grille cap (no `maxHeight` passed). Long titles end in an ellipsis; titles over 24 characters get a `Hint` with the full title.
- **One path.** New and Open both call `openEffect(id, 'here')` in `App.tsx`; `where` is the seam for a new tab later.
- **Width.** The dialog is `width: max-content`. The edited-since-test note stays a visible paragraph (Grille's menu `description` is only a `title=` and screen-reader text), capped at 32ch so it wraps instead of widening the menu.
- **Known wrinkle.** `Hint` makes its child a tab stop, and React Aria logs `<Focusable> child must have an interactive ARIA role` in dev for the long-title items. Hover works; keyboard focus stays on the menu item.

## Verification

- `npm run typecheck`, `npm run build` clean; `npm test` 136 passed (10 files), including the new `graph/titleMenu.test.ts` (start list, Music pulse rule, Open grouping).
- `graph-editor:top-bar` asserts the menu is narrower than 280px, New and Open submenus (right arrow opens, Enter opens an effect, arrows alone open nothing), Start from, Empty to `@empty`, Custom before Built-in. `graph-editor:title-menu` asserts Save / Save and apply / New / Open for a built-in, and with 40 faked effects that Open scrolls on screen, groups Custom then Built-in and ellipsizes a long title.
- All 20 `graph-editor:*` browser checks pass, including `add-menu` and `context-menus` (the Add node cascade, the other `SubmenuItem` user, is unchanged by dev.11).
- The submenu's accessible name is its trigger's label ("New", "Open"), not its `aria-label`, because Grille labels it by the trigger.

## Lessons

- none
