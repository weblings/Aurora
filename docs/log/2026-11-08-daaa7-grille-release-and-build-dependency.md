# Grille releases and the editor's first Grille dependency

Id: daaa7-grille-release-and-build-dependency

`Aurora-daaa.7` (Grille G1) and `Aurora-daaa.8` (Grille G2 + G3a) closed in `weblings/GrilleDS`; `Aurora-daaa.9` is in progress here.

## State

- **daaa.7 / `Grille-251`:** a `v*` tag runs a workflow that does `npm ci`, build and `npm pack`, then uploads the tarball as a release asset. `v0.1.0-dev.1` was the first prerelease. The tarball URL installs with `npm ci` under `ignore-scripts`, and the integrity hash was stable across two installs.
- **daaa.8 / `Grille-48x`:** `v0.1.0-dev.2` carries Aurora's popup surface and shadow, Popover at a point, Menu, Dialog, and Button size and icon. The owner chose dev prereleases through the epic; the final `v0.1.0` comes at the end.
- **Deferred to end-of-epic review:** a WebXR check of `Select` with the new shadow, Save opening the title menu with Name focused (needs the Aurora consumer), and `v0.1.0`.
- **daaa.9 (open):** `web/graph-editor/package.json` depends on `https://github.com/weblings/GrilleDS/releases/download/v0.1.0-dev.2/weblings-grille-0.1.0-dev.2.tgz`. `src/main.tsx` imports `@weblings/grille/ui.css` after `tokens.css`; no `fonts.css`. `ui.css` has no global element selectors; it declares `@layer reset, app, ui` and `.ui-*` rules, so the editor's unlayered CSS still wins.

## Verification

- Local `typecheck` and 98 tests pass.
- Bundle, raw / gzip. JS: 441.18 / 139.49 kB before and after, since nothing imports a Grille component yet. CSS: 34.41 / 6.11 before, 42.08 / 7.35 after. The 25.8 kB CSS baseline in the cleanup doc is stale.
- The generated third-party notices file lists Grille 0.1.0-dev.2 (MIT). React Aria, React Stately and `clsx` appear once `daaa.10` imports a component.
- Not yet run: `web.yml` and the Mac, Windows and Linux builds with the release URL. They run on pull requests, so this waits for a draft PR later in the epic.

## Lessons

- Lessons: none.
