# Effect panel moves to the button row model

Id: kep215-button-row-panel

`Aurora-kep2.15`, under `Aurora-kep2`. Blocks the cut over (`Aurora-kep2.10`).
Implements the `Aurora-kep2.7` decision, see [[kep27-voiceover-tree-check]].

## State

- `web/ui/EffectPanel.js`: no tree roles. Group header is `h3 > button
  aria-expanded aria-controls` over a `role=group` list it labels. Row is a
  `button` with `aria-current` on the running effect. Each row has a visible
  Actions button (`aria-haspopup=menu`, `aria-expanded`, not `aria-hidden`).
  New effect is a button. The collapsed group cue now reads "contains the
  current effect".
- Keyboard: arrows, Home and End move between rows only (across groups, no
  wrap). Headers and New effect are Tab stops, the rows share one roving stop.
  Enter and Space are native clicks. Right on a row hops to Actions, Left hops
  back, Shift+F10 and ContextMenu still open the menu. A menu closes back to
  the control that opened it. Type-ahead covers rows, a lone Space is not eaten.
  Tab through headers and New effect before leaving the panel closes it.
- Kept from kep2.9: row actions, focus after Hide, Move, Duplicate, Delete,
  and every live region sentence. Menus still render in the panel outside the
  scroll region.
- `EffectPanelModel.js`: `treeKey` is now `rowKey` plus `rowItems`.
- Tests: `EffectPanelModel.test.mjs`, `browser-check/checks/effect-panel.mjs`
  at 760 and 390 px (adds markup assertions and Tab order). Demo vendor copy
  re-synced, seams and closure checks pass.

## Open

- Not rechecked on an iPhone with VoiceOver. The kep2.7 trial covered the frame
  8 markup, this build matches it, but the menu sits at the end of the panel,
  not inline in the row as frame 8's trial menu did.

## Resume

Owner review, then `Aurora-kep2.10`.

- Lessons: none new, covered by the kep2.7 entry in `docs/lessons/components.md`.
