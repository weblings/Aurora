# Graph editor: Grille's 31px button scheme applied (dev.16), local button overrides removed

Id: u8jx11-grille-button-scheme

`Aurora-u8jx.11` (P2), the follow-up to the Rocky Road pick (C-prime) in `Aurora-u8jx.7` (the A/B/C mock frame, closed in this commit; the pick is C-prime, with `buttons.css` / `buttons.js` kept as its record). `Aurora-u8jx.10` (the Grille bump for `circledInfoIcon`) is closed by the same bump. Grille `0.1.0-dev.14` made the 31px Rocky Road form the default Button (`Grille-41p`), dev.15 added `circledInfoIcon` (`Grille-a0y`), dev.16 made the icon-only Button a 31px square (`Grille-kca`, filed from this work).

## What changed

- `@weblings/grille` is `0.1.0-dev.16` in `web/graph-editor`. The mock's `grille/` (tokens, ui, fonts CSS) is refreshed from node_modules and its README names the version. This also unblocks `Aurora-u8jx.10` (the icon is in the package; the notice mark stays with `Aurora-u8jx.5`).
- `editor.css`: the bar's fixed 32px rule (`.editor-header .ui-button`) is down to `white-space: nowrap`; the `.editor .btn` padding and font rule is gone. Menu items pad 8px (was 10px) so item text still lines up with a bar button's label, which now pads 8px.
- `data-size="sm"` is dropped from every bar button (Grille still has the size). Undo and Redo, raw `ui-button`s, take `data-icon`: without it they are padding plus glyph (28px at 12px, 32px at 16px), with it a 31px square, so the bar is 48px.
- Dense-panel `.btn` buttons moved to Grille `Button`: `ControlsDrawer` (three icon buttons), `ParamWidget` (remove stop, + stop), `ProblemsChip`'s `Add node…`. `ViewMenu` takes the `ui-button` class like the bar buttons (a popover trigger needs the ref).
- `ErrorShell`'s Retry keeps `.btn`: `ErrorShell.test.tsx` asserts its markup equals `web/ui/shell.js`, which the Dashboard uses.
- Mock: new frame `#s7-sizes` (`sizes.js`, `sizes.css`) measures the sizes live. The `buttons.css` / `buttons.js` A/B/C frame from `Aurora-u8jx.7` is kept as a record.
- Browser checks: `graph-editor-top-bar.mjs` expects 31px, no `data-size`, and compares menu-item padding to the Dashboard link (Undo has none now); `graph-editor-narrow.mjs` adds a 360px width.

## Checks

`tsc`, vitest (184) and the build pass. `graph-editor:top-bar`, `narrow` (with 360px: no sideways scroll, Test split button joined and inside the window), `corners` and `drawers` pass on dev.16; `refused-save`, `error-shell`, `zones` and `popover-toggle` passed on dev.14 and were not re-run on dev.16 (the dev.15 and dev.16 changes are an icon and the icon-only Button).

## Lessons

none
