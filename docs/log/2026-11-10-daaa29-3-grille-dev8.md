# Graph editor: Grille dev.8 (bottom Drawer, Esc)

Id: daaa29-3-grille-dev8

`Aurora-daaa.29.3`. Consumer-side blocker for the narrow-window bottom dock (`Aurora-daaa.29.4`); Grille side was `Grille-b6b` (Drawer `side='bottom'` with half/full toggle) plus `Grille-g25` (Esc from anywhere, `Aurora-daaa.27.5`).

- `web/graph-editor/package.json` and the lockfile point at the dev.8 release asset. Nothing uses the bottom side yet.
- `npm install --package-lock-only` kept dev.7's integrity hash after the URL edit, then dropped it on a second run. The hash was computed from the release asset (`openssl dgst -sha512 -binary | base64`) and written by hand; `npm ci` accepts it.

## Verification

- `npm ci --ignore-scripts`, `tsc`, Vitest (121) and `vite build` pass.
- Not checked: bottom Drawer and Esc behavior in the editor, browser checks (`Aurora-daaa.29.4`, `Aurora-daaa.27.5`).

## Lessons

- none
