# Effect panel: rows, layers and switch states

Id: kep28-effect-panel

`Aurora-kep2.8`, under `Aurora-kep2`. Shipped in `dc66b3f`, closed here. Design record in
[[kep22-effect-panel-mocks]], row model changed by [[kep215-button-row-panel]].

## State

- `web/ui/EffectPanel.js` holds the DOM, `EffectPanelModel.js` the pure rules, and
  `styles/effect-panel.css` the rules moved from `mock.css`, which stays as the frame record.
- The panel sits in `.db-effect-slot` in place of the `Aurora-kep2.1` picker.
- The trigger always names what is running. A pick closes the panel, and pending keeps the
  trigger `aria-disabled` and `aria-busy`, so it holds focus and ignores activation.
- Rejected picks show a panel line. A failed host announces the banner sentence.
- Collapse state is kept in `localStorage` under `aurora.effectPanel.expanded`.
- Focus rings use the shared tokens from [[oecx-focus-ring-tokens]], the local rings are gone.
- The touch long-press was cut by [[kep224-cut-long-press]].

## Verification

- `EffectPanelModel.test.mjs`, `DashboardScreen.test.mjs` and `web/ui` 23 of 23 at close.
- `browser-check` `effect-panel` passes on current code at 760 and 390: keyboard, focus,
  outside changes and switch states, against the stub page.
- Fake-Hue pass at 1280 and 390 on a Release build of `7cd27b9`, 74 panel checks. See
  [[kep210-cut-over]].
- Owner touch pass on an iPhone: row hold, Actions menu, layout.
- VoiceOver: the owner heard "Switched to Music pulse" and accepted the rest without item
  results. The failed switch announcement was not tried on a device, see `Aurora-kep2.22`.

## Open

- `Aurora-kep2.27`: a pick while paused saves and applies on resume, with no feedback.
- The `Aurora-kep2.2` design field still says `role=tree`. The button row model replaced it.

- Lessons: none.
