# Notice mark: square chat icon

Id: 7p8f-notice-chat-icon

`Aurora-7p8f`. The error shell's notice mark (light test, pairing requests) is Grille's `squareChatIcon` in place of the circled (i). Errors keep the red circled exclamation.

- `web/ui/icons/square-chat.svg` is copied from Grille's `dist/icons` and `circled-info.svg` is removed. Its only user was the shell. The demo manifest and vendor copy follow.
- `shell.css` draws it twice: `.shell-mark-info` on the collapsed bar, and a mask over MessageRow's built-in icon on open rows, since MessageRow has no mark prop.
- README and THIRD_PARTY_NOTICES credit Zest Free. Docs, test names and browser check messages drop "circled-info".

## Verification
- `tsc --noEmit`, `vitest run` 383 of 383, 44 web node tests, vendor closure, demo graph and descriptors checks and the editor build passed.
- On a rebuilt Windows Release app, `dashboard-shell` and `graph-editor:error-shell` passed. The Dashboard collapsed and open screenshots show the chat icon.
- The same collapsed screenshot shows the Gamma track level with the Zone select (`Aurora-6ovl`).
- Not checked: Firefox, Safari, Mac and Linux, and the demo in a browser.

## Lessons
- [[lesson-layout-css]]: MessageRow has no mark prop, so a different mark is a CSS mask over its icon.
