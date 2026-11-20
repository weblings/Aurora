# NUX capture source picks from the effect dropdown

Id: hr92-nux-effect-dropdown

`Aurora-hr92`. The NUX Capture source screen drops the Video / Audio chips and uses the Dashboard's effect dropdown, cut down to Screen colors and Music pulse. `EffectPanel` gains an `onboarding` option: row "..." buttons disabled and hidden, row menu never opens, no New effect footer. `ModeDeviceScreen` keeps one persistent panel in `.md-effect-slot`, shows what runs (not the pick), and a pick calls the existing mode switch, so the Monitor or audio device field and live apply are unchanged. A centered line above the dropdown explains each choice, and builds with no audio input show neither (nothing to choose). The Dashboard dropdown is untouched. The copy is a lean until the mock settles it.

## Verification
- `ModeDeviceScreen.test.mjs`, `EffectPanelModel.test.mjs` and `CaptureSource.test.mjs` pass under node.
- The owner looked at the screen in a browser and iterated the copy and layout. A light and dark theme check was not run.

## Lessons
- none
