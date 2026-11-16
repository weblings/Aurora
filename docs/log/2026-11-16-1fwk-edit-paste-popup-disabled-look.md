# Graph editor: no Firefox Paste popup on Edit, disabled Test and Edit are greyed

Id: 1fwk-edit-paste-popup-disabled-look

`Aurora-1fwk`, stage 9 of [[graph-editor-cleanup]]. Reported as a native menu on a left click of Edit and a Test caret that would not open. Neither reproduced in Chromium (dev server and embedded build, 1470 to 400 px): the click reached the button and no `contextmenu` event fired.

## What changed

- Cause was Firefox only: opening Edit called `navigator.clipboard.readText()` to enable Paste, and Firefox answers that with its own Paste popup. The probe now runs only when the `clipboard-read` permission is already granted, so Paste stays on in Firefox.
- The Test caret and Edit are plain `disabled` buttons, and Grille greys only `[data-disabled]`, so a disabled Test looked enabled. `editor.css` gets a `.ui-button:disabled` rule with Grille's tokens.
- Tradeoff: without a prior grant Chrome no longer disables Paste when the clipboard holds no Aurora nodes.

## Verification

- `graph-editor:clipboard` passes (Chromium, permission granted), `tsc --noEmit` clean.
- A Playwright probe measured Test text going from rgb(255,255,255) to rgb(102,102,102) once a problem disables it.
- Owner confirmed in Firefox on the rebuilt app: no Paste popup on Edit, disabled Test looks right.

## Lessons

- none
