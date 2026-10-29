# Browser-check tooling for the web screens

Id: pvxx11-browser-check

`Aurora-pvxx.11`, filed during E4: agents were rebuilding a Playwright setup in
their scratchpads each time, and the E6 gate of [[sequence-e-planning]] needs
one anyway.

## Done

- `tools/browser-check/`: its own `package.json` pinning `playwright-core`
  (no browser download), `lib/browser.mjs` reusing a Chromium already in
  Playwright's cache (env override, per-OS default; a clear install hint when
  none), `lib/stack.mjs` `withEditorStack` (devstack `up --input dummy`, the
  editor's Vite dev server proxied to it, teardown in `finally`), and
  `checks/graph-editor-edit-loop.mjs` (see [[pvxx7-test-save-controls]]).
- Not a dependency of `web/graph-editor` or CMake, so offline Linux builds stay
  offline; not wired into CI (CI cannot run the fake-Hue stack's app).
- The no-headless-browser lesson in `docs/lessons/web-testing.md` got a pointer.

## Verification

Mac only: the script ran green end to end and `devstack status` read down
afterwards. Windows and Linux paths in `browser.mjs` (cache dirs, executable
names) and `stack.mjs` (`py`, `npx.cmd`) are untested.

## Lessons

- Addendum to the web-testing no-browser entry (no new entry).
