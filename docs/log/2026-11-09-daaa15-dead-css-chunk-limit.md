# Graph editor: dead status CSS removed, chunk-size warning settled

Id: daaa15-dead-css-chunk-limit

`Aurora-daaa.15`. Stage 2 removed the status elements but left their rules in `editor.css`, and the 601 kB editor chunk made every `vite build` print the >500 kB warning.

## State

- Removed `.editor-restore`, `.editor-refusal` and `.editor-error` from `web/graph-editor/src/editor.css`; grep of `web/graph-editor` (excluding `node_modules`, `dist`) finds no use.
- `vite.config.ts` sets `build.chunkSizeWarningLimit: 650`, with a comment pointing at "Bundle cost" in [[graph-editor-cleanup]].

## Verification

- `npm run build`: no chunk warning; JS 602.80 / 189.24 kB gzip, CSS 44.75 / 7.89 kB.
- Not run: the app's embedded build or the browser checks (CSS rules were unreferenced).

## Lessons

- Lessons: none.
