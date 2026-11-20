# Test mode menu marks the current mode

Id: w6zq7-test-menu-selected-mode

`Aurora-w6zq.7`. The Test caret menu uses Grille's `Menu` with `selectionMode="single"` and `selectedKey` set to the current mode, so the current mode carries Grille's selected-item look and the `menuitemradio` role. The `, default` suffix is gone. Picking an item still starts that test. Landed in `075e09f9`; the bead was closed afterwards with the label work of `Aurora-w6zq.4` ([[w6zq4-test-button-mode-label]]).

## Verification

- `graph-editor:top-bar` asserts the checked `menuitemradio` for the current mode and `aria-checked="false"` on the other.
- All 20 `graph-editor:*` browser checks pass.

## Lessons

- none
