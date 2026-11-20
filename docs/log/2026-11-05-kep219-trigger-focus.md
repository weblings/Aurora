# Effect trigger keeps focus through a switch

Id: kep219-trigger-focus

`Aurora-kep2.19`, under `Aurora-kep2`.

## State

- `EffectPanel.update` sets `aria-disabled` and `aria-busy` on the trigger while a
  switch is pending, not `disabled`. A disabled button dropped focus to body and
  never got it back. `open()` checks a `_busy` flag, so click, Enter and
  ArrowDown do nothing while pending.
- The kep2.2 design field now says the pending trigger is `aria-disabled`.
- `browser-check/checks/effect-panel.mjs` asserts focus on the trigger while pending
  and after the switch settles, and that it cannot open, at 760 and 390 px. Its
  Start from expectations were stale since kep2.16 (Empty first) and were updated.
- `web/demo/vendor/webui` was re-synced with `sync-webui.py`. That also moved
  `CaptureSource.js` and `EffectPanelModel.js`, which had drifted behind `web/ui`.
- Lessons: none.
