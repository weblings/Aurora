# Graph editor: top-bar and title-menu checks fixed

Id: daaa25-browser-check-timeouts

`Aurora-daaa.25`. `graph-editor:top-bar` and `graph-editor:title-menu` passed at the end of stage 2 ([[daaa13-embedded-run]]) and timed out from stage 3 on.

## Cause

Commit `d2f8ee52` (`Aurora-daaa.18`, [[daaa18-fit-zoom-thumbnail]]) set fit view's `minZoom` to 0.6. With `minZoom` put back to 0.1 both checks passed unchanged, so the editor is right and the checks were wrong. Grille dev.4 was not involved.

- title-menu: `builtin.video` at 60% overflows 1470x900, and the pane-drag step pans it further, so `.first()` node header was outside the window and `click()` waited out its 30 s timeout (line 76).
- top-bar: the view-menu step waited for zoom `> z0` after Zoom in, which is true at the first animation frame (61 of 72%), then opened the menu mid-animation. The menu was gone before Fit view could be clicked. At the old unclamped fit the timing happened to land. Not traced further than that: waiting for the zoom to hold still fixes it.

## Fix

- title-menu: click the first node header fully in view.
- top-bar: wait for the zoom to settle after Zoom in and after Fit view.

## Verification

Both pass on the fake-Hue stack, dev server. With the Delete/Backspace guard removed from `EditorPopup`, title-menu fails at the Delete step; restored, it passes. Embedded build not rerun.

## Lessons

- Filed in [[lesson-web-testing]]: a canvas check that clicks `.first()` node or waits for "zoom changed" breaks when fit zoom or animation timing changes.
