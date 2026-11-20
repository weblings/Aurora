# Shared focus-ring tokens

Id: oecx-focus-ring-tokens

`Aurora-oecx`, blocks `Aurora-kep2.8`. Implements the proposal from [[kep22-effect-panel-mocks]].

## State

- `tokens.css`: `--aurora-focus-ring-width`, `-offset`, `--aurora-focus-ring` (aliased to
  `--aurora-button-light`) and `--aurora-shadow-popup`, plus one `:focus-visible` rule.
- Inset ring on `.segmented-btn` and `.dropdown-option` (clipping containers). The effect panel's
  inset rows now use the tokens and its per-control rules are gone.
- Decision: `.text-input` moved from the accent ring to the shared one, so every control matches.
  `.dropdown-menu` keeps `outline: none` (its active option is the indicator).
- Demo copy re-synced.

## Verification

- `effect-panel` browser check passes at 760 and 390, now asserting the trigger ring is 2px solid
  `#dadada` at 2px offset. `web/ui` style tests and the demo seams check pass.
- Not checked: the other screens in Chromium (only the effect panel stub page ran).

- Lessons: 0 new, 1 updated in `docs/lessons/layout-css.md`.
