# Dashboard effect picker beside Video/Audio

Id: kep21-effect-picker

`Aurora-kep2.1`: first slice of `Aurora-kep2` (option C). An All-effects
`Dropdown` replaces the MCP button beside Video/Audio.

- Rows: built-ins, a divider, then customs from `GET /api/effects`, with
  descriptions as option tooltips. Audio is listed only where the build has an
  audio input.
- Shown only when a custom effect exists or a light test runs. With only the
  built-ins it would repeat the row.
- Loading-state parity with the toggle: the label and selected row follow
  `state.effect`, never the pick. A switch outlines and disables the trigger
  (and the row), and a "Switching to X…" line renders under the row. An error
  is keyed by effect id and clears once that effect runs.
- `Dropdown` gained `controlled`, `setBusy`, `onClose` and a `dividerBefore`
  option flag. An open menu defers the whole controls render until it closes.
- Verified in headless Chromium against the fake-Hue stack: initial, open,
  pending, confirmed and back-to-Video, plus 390 px. The 390 px pass caught the
  right-anchored menu running off the left edge. Fixed with a narrow override
  placed after the picker rules (an earlier media query lost to them).
- `Aurora-kep2` is now `needs-design`: management actions ("⋯" beside the
  picker) and built-in naming (Video/Audio vs "Screen colors"/"Music pulse")
  are explored in its notes, not decided.

- Lessons: none.
