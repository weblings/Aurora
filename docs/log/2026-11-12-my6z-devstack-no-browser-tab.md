# devstack stops opening a browser tab on Mac

Id: my6z-devstack-no-browser-tab

`Aurora-my6z`. Agents running the graph editor browser checks kept opening
Aurora tabs in the user's browser and stealing focus.

## Done

- Cause: the checks run headless Chromium, but `devstack.py up` starts the app
  with `--fresh`, which counts as a first setup, so the Mac app runs
  `open <url>` (`openWebBrowser` in `app/mac/src/main.cpp`). `restart` has a
  `config.json` and does not.
- `tools/light-viz-relay/devstack.py`: `no_browser_env()` writes a no-op `open`
  into `<state dir>/stubs/` and puts it first on the app's PATH (Mac only;
  `up` and `restart`). The bridge, relay and viz get the plain environment.
  `down` removes the stubs directory.
- Not done: Linux `xdg-open` (`Aurora-5m0p`) and Windows `ShellExecuteA`
  (`Aurora-q5eb`, needs an app-side switch; PATH cannot intercept it).

## Verification

- `up` with a logging stub recorded exactly one call, `open http://127.0.0.1:8215/`.
- `npm run graph-editor:top-bar` passed all 12 checks with the real stub, and
  `devstack down` left no processes and no stubs directory.
- Not observed directly: the user's screen. The evidence is that the only
  `open` call went to the stub.

## Lessons

- Filed in [[lesson-web-testing]]: a `--fresh` dev stack is a first setup, so the app opens the browser.
