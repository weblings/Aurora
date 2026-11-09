# Graph editor control-count baseline and CMake rebuild check

Id: daaa4-control-count-baseline

`Aurora-daaa.4` and `Aurora-daaa.3`, stage 1 follow-ups of `Aurora-daaa`.

## State

- `tools/browser-check/checks/graph-editor-control-count.mjs` (`npm run graph-editor:control-count`) counts rendered buttons, inputs, selects, textareas and links outside `.react-flow__node` at 1470x900 and asserts against a ceiling.
- Baseline: `builtin.video` 84, `builtin.audio` 132. This replaces the doc's 82 / 130 and the stage 1 log's 97 / 160, which used different hand rules. The doc table and status line are updated.

- `Aurora-daaa.3` (commit ee4c969): `tools/browser-check/lib/browser.mjs` now finds the cached headless shell on Mac (`mac-arm64`/`mac-x64` layouts) and takes the highest revision, so checks run without `AURORA_BROWSER`. The back-link check passed that way.

## Verification

- Check run on the fake-Hue stack: 84 and 132, passes at those ceilings.
- `touch web/ui/styles/forms.css`, then `make aurora-app-mac` in `build/mac-app`, printed `[ 95%] Graph editor: vite build`. A second build with no touch printed none. So `Aurora-daaa.2`'s rebuild criterion holds; it stays closed.

## Lessons

- `make AuroraApp` does not build the embedded editor; the target that does is `aurora-app-mac`. Use it to check embed dependencies.
