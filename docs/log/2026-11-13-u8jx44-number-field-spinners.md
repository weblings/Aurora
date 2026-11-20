# Graph editor: node param number fields drop the native spin buttons

Id: u8jx44-number-field-spinners

`Aurora-u8jx.4.4` (P2, item 9 of `Aurora-u8jx.4`), owner direction 2026-11-13: try dropping the increment buttons first. No core, server or Grille change.

## The bug

The number box beside a float param's slider (Beat bounce, Palette drift) showed the OS's up/down spin buttons, not Grille's, in a 70 px box, so a value such as `0.28499999999999998` was cut off.

## The fix

- **No spinners.** `editor.css`, one block by the node-param rules: `.param input[type='number']` gets `appearance: textfield` (`-moz-appearance` too) and the WebKit `::-webkit-inner-spin-button` / `::-webkit-outer-spin-button` are `-webkit-appearance: none; margin: 0`. It covers the gradient stop position boxes as well. The slider already drives the value; arrow keys in the box still step it. If steppers are wanted later, use the RockyRoad number-field component.
- **Wider box.** The float param's number box is 84 px (was 70) and does not shrink (`flex: none`); the slider keeps the rest of the row at the 240 px minimum node width.
- **Display rounding.** `ParamWidget.tsx` `displayNumber` shows the value to 7 significant digits (`Number(v.toPrecision(7))`, all a 32-bit float has), so the server's float32 values (`0.0500000007451`, found in a real browser at 12 digits) and slider step noise (`0.28499999999999998`) read `0.05` and `0.285`. It is deliberately not rounded to the param's `step`: a person who types `0.2837` into a `0.01`-step param keeps the digits they typed in the box (past 7 significant digits the box rounds, which a float32 cannot hold anyway) (the box is controlled, so step rounding would rewrite the text under the cursor). The stored value is still the exact number the slider or the box produced; only the shown text is cleaned.

## Checks

Unit test (`graph.test.tsx`): `displayNumber` drops float noise and keeps typed digits. Browser (throwaway script, not kept as a check): no spinner appearance, `scrollWidth <= clientWidth` on every float field at 1470 px, typing sets the value, a slider click updates the box with no noise.

## Lessons

None.
