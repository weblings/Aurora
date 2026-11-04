# VoiceOver check of the effect panel tree

Id: kep27-voiceover-tree-check

`Aurora-kep2.7`, under `Aurora-kep2`: the effect panel spec was an ARIA tree
(frame 9) driven only in headless Chromium. Checked on a real iPhone, VoiceOver
on iOS 27.2 in Safari, by the owner. Closed 2026-11-03.

## State

- Frame 9 (`role=tree`) fails. A header read only "Built-in" with no role or
  expanded state. A row read its name and description only, with no tree item,
  selected or has-popup. The ⋯ is `aria-hidden`, so the row menu was
  unreachable. This matches WebKit ignoring `treeitem` on iOS (bug 164936).
- Frame 8 (button rows) passes. Header "button, heading level 3, expanded".
  Row "name, description, button", running row "current item". The ⋯ reads
  "Actions for X, popup button, menu popup". Menu items read "menu item,
  button" and all were reachable. A double-tap on a row commits.
- Gaps on frame 8, not blockers: no expanded state is announced when the menu
  opens, nothing is heard after a menu action, and group depth comes only from
  the headings. Frame 8's ⋯ was a silent log until this bead, so
  `frame8.js` now opens a working inline `role=menu` for the touch test.
- Decision: the panel uses the frame 8 button model, not `role=tree`. The
  Screen colors description also lost "edges of".

## Resume

- The kep2.2 design field and `Aurora-kep2.8` still say tree. Update both
  before the panel build.
- TalkBack is untested and split to the optional `Aurora-kep2.14`.

## Lessons

- Filed: VoiceOver on iOS drops role=tree and treeitem semantics (`docs/lessons/components.md`).
