# Grille v0.2.2-dev.4

Id: 6ovl-grille-dev4

`Aurora-6ovl`. The editor pins Grille v0.2.2-dev.4 (`tools/grille/switch.mjs dev v0.2.2-dev.4`).

- The Gamma slider's local `.ui-slider-header` margin override is replaced by Grille's `--ui-slider-header-gap: 11.5px` on `.zm-gamma-island` (`Grille-rga`). The demo vendor copy was re-synced.
- dev.4 also eases the Switch (`Grille-chz`, closes the gap noted in [[4nqt7-leaf-islands-controls]]) and adds `squareChatIcon`. Swapping the Notice mark to it is `Aurora-7p8f`.
- The gaps mock labels name dev.4.

## Verification
- `tsc --noEmit` clean, `vitest run` 383 of 383 (31 files), 44 web node tests, vendor closure, demo graph and descriptors checks, editor and recipes builds all passed.
- The built CSS carries the `var(--ui-slider-header-gap, ...)` rule.
- Not run: browser checks, so the Gamma row and the Switch motion were not viewed.

## Lessons
- none
