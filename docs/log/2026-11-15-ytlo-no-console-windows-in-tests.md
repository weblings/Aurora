# Windows tests: no console windows, no stolen focus

Id: ytlo-no-console-windows-in-tests

`Aurora-ytlo` (`Aurora-h67p` was a duplicate create, closed). Sibling of [[q5eb-windows-no-browser-tab]].

## What changed

- `tools/light-viz-relay/devstack.py`: `spawn()` uses `CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP` instead of `DETACHED_PROCESS`.
- `tools/browser-check/lib/stack.mjs`: every `spawn` and `spawnSync` passes `windowsHide: true`.

## Findings

- `devstack up` started children through `py.exe` with `DETACHED_PROCESS`. A console-less `py.exe` makes its `python.exe` child create a console, and Windows Terminal (the default terminal here) opened a window for each. Measured: 3 new windows per `up`, each taking foreground from VS Code.
- `taskkill` in `down` showed no window. `openssl` in `fake_bridge.py` did not run (cert already present), so it is untested.

## Verification

- A watcher polling visible top-level windows every 5 ms (new windows and foreground changes) saw 3 windows during `devstack up` and `down` before, none after the `devstack.py` change.
- `graph-editor:popover-toggle` under the same watcher: passes, no new windows, no focus changes. The `stack.mjs` change was not isolated from the `devstack.py` one.
- Not covered: `check.py`, `perf.py` and the gate scripts still launch without `creationflags`.

## Lessons

- A `DETACHED_PROCESS` parent has no console to hand down, so any console child it starts opens its own window. Use `CREATE_NO_WINDOW` for background helpers on Windows.
