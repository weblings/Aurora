# Notice mark: square chat icon

Id: 7p8f-notice-chat-icon

`Aurora-7p8f`. The error shell's notice mark (light test, pairing requests) is Grille's `squareChatIcon` in place of the circled (i). Errors keep the red circled exclamation.

- `web/ui/icons/square-chat.svg` is copied from Grille's `dist/icons` and `circled-info.svg` is removed. Its only user was the shell. The demo manifest and vendor copy follow.
- README and THIRD_PARTY_NOTICES credit Zest Free. Docs, test names and browser check messages drop "circled-info".
- First version: a CSS mask over MessageRow's built-in icon. It drew smaller than the 24px error mark, then, moved onto the svg, larger-looking than it: the bubble covers 78% of its grid against the circle's 66%.
- The owner sized both marks in a temporary gaps mock section (notice and error): open rows 15 and 16px, collapsed bar 14 and 15px.
- Filed `Grille-6co` (pad the icon's viewBox to 93.75%) and `Grille-qy0` (MessageRow `icon` prop), shipped in v0.2.2-dev.5, which the editor now pins.
- Result: notice rows pass `icon={squareChatIcon}`, open-row marks set `--ui-size-icon-overhang: 0px` (16px glyph), and `.shell-mark` is 15px for both. The padding gives the notice sizes. The mask override and mock section are removed.

Ported to 1.2.1 by [[b665-react-free-port]]. The verification below ran on `feat/ReactPort`.

## Verification
- `tsc --noEmit`, `vitest run`, 44 web node tests, vendor closure, demo graph and descriptors checks and the editor and recipes builds passed.
- On a rebuilt Windows Release app, `dashboard-shell` and `graph-editor:error-shell` passed, and the Dashboard screenshots were viewed.
- The first version's collapsed screenshot shows the Gamma track level with the Zone select (`Aurora-6ovl`).
- The first dev.5 app rebuild failed with EPERM while the mock's dev server was still running. The checks above are from the rebuild after it was stopped.
- Not checked: Firefox, Safari, Mac and Linux, and the demo in a browser.

## Lessons
- [[lesson-layout-css]]: a Grille icon draws 8px larger than its layout box, so size it with the overhang variable.
- [[lesson-build-toolchain]]: a running Vite dev server makes the app build's `npm ci` fail with EPERM on Windows.
