# The first tap after a touch long-press runs

Id: kep221-long-press-first-tap

`Aurora-kep2.21`, under `Aurora-kep2`.

## State

- `EffectPanel._onPointerDown` clears `_longPressed`, so the flag only eats the click from
  its own release. Before, a release with no click left it set and the next tap was ignored.
- `effect-panel.mjs` long-presses a row with synthetic touch pointer events and no click on
  release, then taps Duplicate. It passes with the fix and fails without it.
- `web/demo/vendor/webui` was re-synced.
- Not checked on a real iOS or Android device, and whether real browsers skip that click
  is still unconfirmed.
- Lessons: none.
