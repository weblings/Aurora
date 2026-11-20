# devstack: the Windows app no longer opens a browser tab on `up`

Id: q5eb-windows-no-browser-tab

`Aurora-q5eb`. Windows counterpart of [[my6z-devstack-no-browser-tab]] (Mac used a PATH stub for `open`).

## What changed

- `app/windows/src/main.cpp`: on a first setup, if `AURORA_DEV_NO_BROWSER` is set (presence-only, same convention as `AURORA_DEV_LIGHT_TAP`), the app skips `openWebBrowser` and logs `WebUI: <url> (browser launch skipped, AURORA_DEV_NO_BROWSER)`. The tray and menu launches are unchanged.
- `tools/light-viz-relay/devstack.py`: `no_browser_env()` sets the variable for the app only on Windows. The Mac stub is unchanged. Linux is untouched (`Aurora-5m0p`).
- `tools/light-viz-relay/README.md`: the variable is documented.

## Verification

- `cmake --build build/windows-app --config Release`: ok, 11 s.
- `graph-editor:back-link` passes in 12 s. The app log (`%TEMP%/aurora-fresh/aurora.log`) has the "browser launch skipped" line and no "opening ... in your browser" line.
- `py tools/light-viz-relay/devstack.py --help` parses. No devstack unit tests exist.

## Lessons

- none
