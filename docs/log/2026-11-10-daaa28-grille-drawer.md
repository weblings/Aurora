# Graph editor: Grille dev.7 (Drawer)

Id: daaa28-grille-drawer

`Aurora-daaa.28`. Consumer-side blocker for stage 4's Details and Dashboard controls drawers (`Aurora-daaa.27.3`); Grille side was `Grille-vxt`.

- Pushed GrilleDS branch and tag `v0.1.0-dev.7`; the Release workflow built the tarball. The tag existed only locally when the bead started, so the asset URL was a 404 until the push.
- `web/graph-editor/package.json` and the lockfile point at the dev.7 asset. The package ships `Drawer.d.ts`. Nothing uses Drawer yet.

## Verification

- `npm ci --ignore-scripts`, `tsc`, Vitest (118) and `vite build` pass; bundle 651 kB.
- Not checked: the Drawer's behavior (non-modal, Esc, focus return); that is `Aurora-daaa.27.3`. Browser checks not rerun.

## Lessons

- none
