# Aurora-jk4p: Mac menu-bar tip gets a new GIF and Pause / Resume copy (closed)

Id: jk4p-mac-tray-tip-gif-copy

2026-10-08. Follow-up to `2026-09-30-mac-nux-tray-tip.md` (Aurora-qps.8).

- `web/ui/icons/MacTray.gif` replaced by the user's new recording (dropped in `assets/`, moved over the old file; single copy stays under `web/ui`). Now 398x292 (was 398x218); CSS and test only pin the 398px width, so no layout edit.
- Secondary copy in `MacTrayTipScreen.js` is now "Click the Aurora icon for Launch UI, Pause / Resume, or Stop." (user's wording); the tray has had Pause / Resume since Aurora-5ipy.14. `mac-tray-tip.test.mjs` asserts all three item names.
- Windows balloon text (`app/windows/src/main.cpp`, "Launch UI or Stop") left alone; not asked for.

## Verified

- `node web/ui/styles/mac-tray-tip.test.mjs` passes.

## Not verified

- The new GIF on the screen in a `--fresh` run (the height change is untested visually), and in a rebuilt embedded webroot.
