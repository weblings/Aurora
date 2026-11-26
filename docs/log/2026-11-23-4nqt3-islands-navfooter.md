# Main page loads a built bundle, NavFooter is the first island

Id: 4nqt3-islands-navfooter

`Aurora-4nqt.3` (closed, P3; 1.2.1). The Dashboard page loads `islands.js` from the graph editor's Vite project, and NavFooter is the first piece drawn by Grille `mountIsland` in Aurora.

- Build: `vite.config.ts` gains a second input, `src/islands/main.tsx`, with the fixed name `islands.js`. The entry adds its own links for Grille's `tokens.css` and `ui.css` (`?url`), and sets `window.auroraIslands`. CMake embeds it with the rest of `dist`, no change there.
- Loading: `web/ui/index.html` and `web/demo/index.html` load `islands.js` before the app script, so the global exists when a screen renders. `pages.yml` checks `_site/graph-editor/islands.js`.
- NavFooter: `web/ui/NavFooter.js` mounts `islands/NavFooter.tsx` (Grille `Button size="action"`, `arrowLeftIcon`). With no bundle it logs one console error and draws plain buttons. `renderNavFooter` gains `continueDisabled`, and EntertainmentZoneSelect and ModeDevice re-render the footer instead of editing its DOM.
- Look: Grille's, as is. Same size (150 by 36) and colors. Radius 6 to 5px, label 14 to 13px, icon gap 8 to 6px, disabled opacity 0.5 to 0.4, a different arrow glyph. `.nav-footer-back`, `.nav-footer-continue` and `.nav-footer-back-icon` rules are gone from `forms.css`.
- Owner decision (2026-11-23): the bundle is mandatory for app builds from here. [[react-dashboard-delivery]] records it and the load mechanism.
- Left alone: `icons/back-arrow.svg` is unused by `web/ui` but still listed in `GraphEditor.cmake` and the demo manifest.

## Verification
- `tsc --noEmit` clean, `vitest run` 378 passed (3 new), all `web/ui` node tests and the demo seams and vendor checks pass.
- The Release app was built (`aurora-app-windows`) and run on the devstack. `/graph-editor/islands.js` and its chunk and CSS returned 200. The owner looked at the footer on the change bridge screen and approved the buttons. The demo build (`build-editor.py`) produced `graph-editor/islands.js` and the web CI node test loop passed. Browser checks `dashboard-shell`, `shell-cap`, `effect-panel` and the editor set (17 of 17) passed against the Vite dev server. Not run: the embedded editor variant.

## Lessons
- [[lesson-build-toolchain]]: a Vite entry with no HTML page gets no stylesheet links.
- [[lesson-layout-css]]: Grille's `ui.css` is in `@layer ui`, so unlayered Aurora CSS wins.
- [[lesson-components]]: pass state into the render call, do not poke an island's DOM.
