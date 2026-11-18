# Editor links work under a sub-path host

Id: 51nv1-subpath-editor-links

`Aurora-51nv.1`. The editor's links no longer assume Aurora's root, so the demo can serve it under GitHub Pages' `/Aurora/`. `vite build` uses base `./` (the dev server keeps `/graph-editor/` so browser-check URLs hold). `editorHref()` and the Dashboard's probe use `graph-editor/` relative to the page. The Dashboard opens the editor through `app.openEditor(href)` when the host has it, else `location.assign`. The editor's back link is `../`, and when framed it calls `window.parent.auroraCloseEditor()` if defined (`web/graph-editor/src/backLink.ts`). web/ui re-vendored. App behavior at `/` is unchanged. The demo side (iframe, `openEditor`, `auroraCloseEditor`) is `Aurora-51nv.9`.

## Verification
- New `backLink.test.ts` (4 cases), Dashboard test for both `_openEditor` branches, updated `editorHref` assertions.
- Built dist served under `/Aurora/graph-editor/` by the agent: assets load, back link resolves to `/Aurora/`.
- Coordinator re-run: web unit loop with the vendor seams test, editor typecheck and vitest (299 passed), `graph-editor:back-link` in dev and in embedded mode after rebuilding `build/windows-app` (the editor is compiled into the app, so embedded mode needs a rebuild to see editor changes). Agent ran `dashboard-shell`, `effect-panel`, `graph-editor`, all passing.

## Lessons
- none
