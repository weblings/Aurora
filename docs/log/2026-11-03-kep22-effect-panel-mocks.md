# Effect panel static mocks (paused)

Id: kep22-effect-panel-mocks

`Aurora-kep2.2`, under `Aurora-kep2`: static mocks of one full-width Effects
dropdown with an attached non-modal panel, replacing the Video/Audio toggle.
Paused 2026-11-03 after two design-review passes. The owner considers the
shape close to final. Decisions live in the bead's design field and are not
repeated here.

## State

- Frames in `web/ui/Static_kep2_Mocks/`, viewed through `index.html`. The
  current list is in the bead's design field.
- Frame 8 trial, driven in headless Chromium: Up/Down/Home/End moved focus
  with no switch, Enter and Space switched, Right/Left hopped to the ⋯ and back, the list stayed
  one tab stop, the trigger was named "Effects, Fire". Same look as frame 1.
  Gap found: headers and New effect were reachable only by Tab, in an order
  that depends on which group holds the running effect.
- Frame 9 tree trial (`frame9.js`), driven the same way: `role=tree` with
  group headers as expandable nodes. Up/Down walked headers and rows in order,
  Right expanded or stepped in, Left collapsed or stepped out, Enter toggled a
  header and switched on a row, type-ahead jumped to a match, and a collapsed
  group with the running effect showed its check. Shift+F10 opened the row
  menu (Esc closed only the menu). The running effect's menu has no Hide item.
  Hide and Unhide moved rows, with focus going to the next row, then the
  previous, then the group. Hiding both built-ins removed the Built-in group.
  The panel came out as two tab stops (tree, New effect), which was changed
  below.
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

## Decisions (2026-11-03, later)

- Input badges removed from rows. Their value only showed when an input was
  missing, and that is signalled elsewhere.
- Gating removed: failures are only known reactively, so no row is dimmed or
  `aria-disabled`. A missing input surfaces through the shell banner.
- The running effect's menu omits Hide instead of showing it disabled.
- The row's second text line is `secondary` (`.mk-opt-secondary`), was
  `reason`. Today it only says "Built-in" on hidden built-ins.

## Frame 9 adopted as the spec (2026-11-03, later)

- The tree replaces radios. `gen.py` builds frames 1-7 as static states of
  the frame 9 tree, frame 8 stays as the rejected button-row record, and the
  radio path and its CSS are gone.
- 4a wins: the tree header always puts the check on the right. 4b removed.
- Tooltips and row menus render in the panel, outside the tree and its
  scroll region. `layers.js` places both under their row, flips above when
  the viewport runs out, and frame 9 uses it for its live menu. Scrolling
  closes an open menu.
- Menus may extend past the panel's bottom edge (frame 2) as long as they
  stay in the viewport. Treated as normal floating-menu behavior.
- Verified in headless Chromium: frame 3's menu flips above Lava lamp
  without clipping, frame 4 shows the header check, and in frame 9 hover and
  keyboard focus show tooltips outside the tree (a mouse click does not),
  the menu hides the tooltip, and Esc returns focus to the row without it
  passing through the body.

- 6b resolved: hidden rows stay selectable, so a hidden effect may run. The
  rule narrows to "the running effect's menu has no Hide". This also covers
  the tray or MCP starting a hidden effect. Auto-unhide on pick was rejected
  as a surprising side effect.
- Touch descriptions: long-press opens the row menu (platform convention on
  iOS and Android is long-press for actions, not tooltips), and the menu
  leads with the description as a non-interactive line. Not yet mocked.

- Trigger wording, switch states and outside-change rules decided (details
  in the bead's design field). "Running", not "active", to match the app's
  host states and banner copy. Paused keeps the effect name because Pause is
  app-wide and already shown by the top bar. Pending reuses kep2.1's shipped
  controlled `Dropdown`, `.pending` outline and "Switching to X..." line.
  Outside changes patch rows by id, per the APG rule of not moving focus or
  reordering under the user.
- Frames 10-12 (switching, rejected, paused) added. Frame 7 doubles as the
  success state. The warning glyph and accordion chevrons are CSS masks,
  which Chromium drops over `file://`, so check them served over HTTP.

## Failure, inputs and scope (2026-11-03, later)

- The earlier build-time check was wrong: a missing input is neither a
  rejected switch nor saved-not-applied. `Pipeline::build` falls back to a
  built-in and the PUT succeeds, so the trigger can move to an effect the user
  never picked, with no inline error. Read from the code and
  `PipelineTests.cpp`, not run live.
- Picking Music pulse blanks `activeInputName`, so a video or mixed custom
  effect fails after it, and a mixed effect depends on the order the built-ins
  were visited. Both input names now stay saved, the effect id chooses the
  mode, and the server auto-picks a missing input but never `dummy`
  (`Aurora-kep2.3`). Auto-pick is mainly for a normal build whose user never
  chose audio. A build with no such input still fails.
- A failed effect switch no longer keeps the old effect running, which the
  owner found confusing with the old chips. It stops, the trigger reads "No
  effect running", the pick stays saved, and Retry or a restart tries it
  again. Startup fails the same way, so the built-in fallback goes
  (`Aurora-kep2.4`). Deleting the running effect still moves to a built-in.
- Scope: effect switches only. Failed device or settings changes keep the
  effect running (saved-not-applied), and light tests keep their revert.
- A failed build shows in the banner only, under the 2026-10-06 split by cause
  in [[error-overlay]]. Inline stays for requests that never ran, where the
  old effect keeps running. The banner has no live region, so the panel
  announces the failure.
- Edit graph joins the built-in and hidden row menus, editing a built-in saves
  as a new custom effect, and the Dashboard's link goes at cut over.
- Pins and recents are dropped in favor of the panel.
- A dim steady magenta failure light, like a shader's missing material, was
  accepted as later work (`Aurora-dh1p`). It needs a pipeline with no capture
  input, and it cannot show when the outputs are down.
- A dead or unreachable bridge shows nothing today: the app reports running,
  nothing reads `isConnected()`, and nothing reconnects. `Aurora-lt66` adds a
  daemon-side check, a self-clearing banner row and automatic reconnect, with
  no Retry button. So the trigger means what Aurora is running, not strictly
  what is on the lights.

## Open (owner)

- Frame 11 and the Edit graph menu items are not redrawn yet (remaining
  `Aurora-kep2.2` work). The row follow-on flows are `Aurora-kep2.6`.

## ARIA and design review gaps (2026-11-03)

Review record. Later sections and the bead's design field override it. Delete
confirm and menu gating are still open, as `Aurora-kep2.6`.

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
- Superseded by the decisions below: gated rows were 5.11:1 at rest and a
  reason line inside one was ~3.17:1 (fails), which is now moot.
- `max-height: calc(100vh - 150px)` should use `dvh` and not assume the
  trigger's offset. 32 px ⋯ targets pass WCAG 2.5.8 but are small at 390 px.

- New effect is now the last item in the frame 9 arrow sequence: `role=tree`
  wraps the scrolling list and the pinned footer, and New effect is a
  top-level treeitem. Down from the last row and End land on it, Up and Home
  leave it, Right, Left and Shift+F10 do nothing, Enter, Space and click
  activate. The panel is one tab stop. Verified in Chromium, including that
  the footer stays pinned and its ring is inset.

## Focus ring (2026-11-03)

- Measured in Chromium: the trigger, New effect and accordion headers showed
  the browser's default `auto` ring, while rows and tree headers used a
  mock-local 2px grey inset ring. `tokens.css` has no focus tokens (only
  `.text-input` and a `.dropdown-menu` `outline: none`).
- Adopted RockyRoadImport's shape in `mock.css`: `--aurora-focus-ring-width`
  2px, `--aurora-focus-ring-offset` 2px, `--aurora-focus-ring` aliased to
  `--aurora-button-light` (#dadada), one `:focus-visible` rule. Inset inside
  clipping containers (rows, headers, New effect, menu items). Verified every
  focus target in frames 1, 8 and 9 reports the same width and color.
- Not done: the real app still uses the browser default. Adding the tokens and
  rule to `tokens.css` touches every screen and is out of scope for this bead.
  Open: bead for it, and whether `.text-input`'s accent ring should move too.

## Method

- Frames were generated from one Python script with state flags per frame,
  screenshotted with `tools/browser-check`'s `launch()`, and aligned by
  reading computed styles (`measure.mjs`) rather than by eye, used to line the
  group headers up with the New effect footer.

## Resume

Finish the `Aurora-kep2.2` frames in `gen.py`, regen, and have the owner
review them. Build beads are cut under `Aurora-kep2`, starting with
`Aurora-kep2.3`.

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
  - "Aurora's stylesheets define no focus ring, so new controls need shared
    ring tokens or they look inconsistent beside the browser default"
    (layout-css)
