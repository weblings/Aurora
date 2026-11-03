# Effect panel static mocks (paused)

Id: kep22-effect-panel-mocks

`Aurora-kep2.2`, under `Aurora-kep2`: static mocks of one full-width Effects
dropdown with an attached non-modal panel, replacing the Video/Audio toggle.
Paused 2026-11-03 after two design-review passes. The owner considers the
shape close to final. Decisions live in the bead's design field and are not
repeated here.

## State

- Frames in `web/ui/Static_kep2_Mocks/`, viewed through `index.html`:
  1 built-in row menu (760 and 390 px), 2 Hidden open, 3 long list,
  4a/4b collapsed groups (check right vs left of the header), 5 description
  tooltip, 6 built-ins hidden, 6b only Hidden (`frame7.html`), 7 closed
  both-inputs (`frame1-both.html`), 8 button rows instead of radios, working
  keyboard model (`frame8.js`).
- Frame 8 trial, driven in headless Chromium: Up/Down/Home/End moved focus
  with no switch, Enter and Space switched, the gated Candle row explained
  instead of switching, Right/Left hopped to the ⋯ and back, the list stayed
  one tab stop, the trigger was named "Effects, Fire". Same look as frame 1.
  Gap found: headers and New effect were reachable only by Tab, in an order
  that depends on which group holds the running effect.
- Frame 9 tree trial (`frame9.js`), driven the same way: `role=tree` with
  group headers as expandable nodes. Up/Down walked headers and rows in order,
  Right expanded or stepped in, Left collapsed or stepped out, Enter toggled a
  header and switched on a row, type-ahead jumped to a match, and a collapsed
  group with the running effect showed its check. Shift+F10 opened the row
  menu (Esc closed only the menu). Hide on the running effect was refused.
  Hide and Unhide moved rows, with focus going to the next row, then the
  previous, then the group. Hiding both built-ins removed the Built-in group.
  The panel came out as two tab stops (tree, New effect).
- A treeitem cannot contain a button, so the ⋯ is `aria-hidden` and
  mouse-only. Right on a row (a no-op for a tree leaf) opens its menu instead,
  matching "Right steps in" on a header. Left or Esc closes it back to the row,
  Shift+F10 and the Menu key are aliases, and the row carries
  `aria-haspopup="menu"`. The menu renders in the panel, outside the tree,
  positioned under its row, and flipped above the row when it would run off
  the viewport bottom with room above (checked at 640 and 560 px tall, it
  overlaps the trigger by ~3 px at the top of the list). Verified the same
  way. Mobile screen-reader support for
  `role=tree` is untested here and needs a real-device check. Row menus
  still overflow the panel bottom.
- Mock-local CSS only (`mock.css`), built on the real `web/ui/styles`. No
  `web/ui` source or style changes.
- Generator moved out of the prototyping session's temp scratchpad into the
  folder (`gen.py`, `render.mjs`, `measure.mjs`, usage in the folder README).
  Regen is byte-identical to the committed frames. The superseded
  `gen.py`–`gen3.py`, `gen4.bak` and `patch5`–`patch7.py` were folded into
  `gen.py` and not kept.

## Open (owner)

- 4a vs 4b check placement on a collapsed group header.
- 6b: built-ins hidden and no customs leaves nothing visible to select, which
  conflicts with "the selected effect cannot be hidden".
- Where touch users read descriptions (tooltip is hover/focus only).
- Whether the shell banner fires on selecting a gated effect today.
- Nothing-running trigger text: "No effect selected" (frame 6b), "All
  effects" (shipped in kep2.1) or "No effect running" (kep2 note).

## ARIA and design review gaps (2026-11-03)

- Native radios commit on every arrow key and cross all three groups (shared
  `name`). Verified in headless Chromium: four ArrowDown presses from Music
  pulse fired three `change` events, checked the `aria-disabled` Candle row
  and wrapped to Screen colors. Recommended: row buttons with `aria-current`,
  own Up/Down focus handling, commit on Enter/Space/click. The visual shape is
  unchanged (CSS moves from `label` + `:has()` to the row button).
- A click checks a radio before the switch is confirmed, against kep2's
  controlled-picker rule. Buttons avoid it.
- Not yet designed: pending/busy/error states in the panel, whether a pick
  closes the panel, Tab-out behavior, Esc order (tooltip, then row menu, then
  panel), row-menu arrow keys, focus after Hide/Unhide/Move.
- Trigger not linked to the Effects label (real `Dropdown` uses
  `aria-labelledby` label + trigger). Trigger lacks `aria-controls`.
- Per-row Delete returns, which the 2026-10-30 note rejected for mis-taps.
  The delete confirm is out of scope here, so it must gate the build.
  Gating from 2026-11-02 (Admin-only Delete, no-editor build, light test) is
  not yet carried into the row menus.
- Gated rows: 5.11:1 at rest (passes). A reason line inside a gated row
  would be ~3.17:1 (fails). Gated rows give screen readers no reason.
- Frame 6b reuses the "dormant" reason line to say "Built-in".
- `max-height: calc(100vh - 150px)` should use `dvh` and not assume the
  trigger's offset. 32 px ⋯ targets pass WCAG 2.5.8 but are small at 390 px.

## Method

- Frames were generated from one Python script with state flags per frame,
  screenshotted with `tools/browser-check`'s `launch()`, and aligned by
  reading computed styles (`measure.mjs`) rather than by eye, used to line the
  group headers up with the New effect footer.

## Resume

Decide the open items and the radio-vs-button row model, update `gen.py`,
regen, then have the owner re-review before a build bead is cut.

- Lessons:
  - "Native radios commit on every arrow key, and one shared `name` groups
    them across every radiogroup wrapper" (components)
  - "Static mocks agree on layout and content, not on the keyboard and focus
    model" (planning)
  - "Reviving a rejected option: say which rejection reasons the new shape
    answers and which still stand" (planning)
  - "A generator for checked-in output belongs beside that output, not in a
    session scratchpad" (architecture-process)
  - "A string-replace patch to a script must assert each anchor, or a
    drifted anchor is a silent no-op" (build-toolchain)
