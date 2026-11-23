# Graph editor error shell on Grille MessageRow

Id: 4nqt2-error-shell-messagerow

`Aurora-4nqt.2` (closed, P3; 1.2.1). `ErrorShell.tsx` draws its rows with Grille `MessageRow` (error and notice tones) and Grille `Button`, instead of shell.css markup.

- Rows: error, condition, note, light test and pairing. Retry, Stop test, Approve and Deny keep their ids and `data-action`. Dismiss is `MessageRow`'s own button.
- Kept in shell.css: the collapse toggle and counts, the 60vh cap with fades, the arrival pulse. Each row sits in a `shell-banner-row shell-grille-row` wrapper that carries the key and pulse. editor.css zeroes its border and padding and keeps the red ping on error rows.
- The permission and local-network rows are still shared HTML with the Dashboard. The editor strips their own mark.
- The Dashboard keeps the old markup until `Aurora-4nqt.4`, so the parity test in `ErrorShell.test.tsx` now compares words, control ids, keys, dismiss count and marks.
- `graph-editor-error-shell.mjs` selectors moved to `.ui-message-row-mark` and `[aria-label="Dismiss"]`. No build change.

## Verification
- `tsc --noEmit` clean, `vitest run` 375 passed.
- The Dashboard shell with injected dev errors was shown on the devstack and the owner approved it. The editor rows and the browser check `graph-editor:error-shell` were not run here.

## Lessons
- [[lesson-components]]: Grille MessageRow takes no key, pulse or ids.
