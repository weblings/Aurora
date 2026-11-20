# Row menu follow-on flows

Id: kep26-row-menu-flows

`Aurora-kep2.6`, under `Aurora-kep2`: frames and decisions for what happens
after each row menu item. Owner reviewed 2026-11-03. Decisions live in the
bead's design field and are not repeated here.

## State

- Frames 14-20 in `web/ui/Static_kep2_Mocks/` (Rename, Delete confirm, New
  effect Start from, Duplicate, gated menus, light test, long-press), under a
  new section of `index.html`. Frames 1-13 regenerate byte-identical except
  frame 2, whose hidden custom row now carries Rename and Delete.
- Changes from review: Start from sits under the New effect text, copies are
  titled "X (Copy)", hidden custom rows gain Rename and Delete, and the saved
  active effect's menu leaves out Delete during a light test.
- Light test: the old "only open the editor" rule belonged to the chip band's
  running-effect menu. A pick and `PUT /api/effects` end a test through
  `onEffectChosen`, and deleting the active effect does too, so that one item is
  gated. Stop test stays in the shell banner.
- Frame 15's delete confirm answers the 2026-10-30 per-row Delete mis-tap
  rejection: two steps, a fresh-press guard, focus on Cancel, Admin only.

## Carried to Aurora-kep2.9

- `POST /api/effects/:id/duplicate` needs an optional `title`, since the route
  copies the graph unchanged. The editor's `distinctTitle` says "title copy" and
  should match "(Copy)".
- The running-effect delete confirm names the built-in the server falls back to
  (`runsAudioMode`). Check `/api/state` gives enough, else add a field.
- Long-press: 500 ms, cancelled by a move over 10 px, no native callout.

## Resume

Nothing open. Build is `Aurora-kep2.8` then `Aurora-kep2.9`.

- Lessons: none.
