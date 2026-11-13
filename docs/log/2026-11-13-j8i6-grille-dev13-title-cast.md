# Graph editor: Grille 0.1.0-dev.13, the MenuSection title cast is removed

Id: j8i6-grille-dev13-title-cast

`Aurora-j8i6`. Grille `0.1.0-dev.13` ships Grille-ahg: `MenuSection` (and ListBox `Section`) `title` is typed `ReactNode`. Confirmed in the package's `dist/Menu.d.ts` before the bump.

- `web/graph-editor/package.json` and the lockfile point at `0.1.0-dev.13`; the README's Grille version mention follows.
- `TitleMenu.tsx` `headingOf` returns `ReactNode` and the `as unknown as string` cast (6d's workaround) is gone.
- Older log entries still say `dev.12`; they record what was true then.

## Verification

- `npm run typecheck`, `npm test` (182 passed) and `npm run build` in `web/graph-editor`: pass.
- `graph-editor:refused-save` (browser-check): all passed, including the `Not saved yet` heading ending with the dot.

## Lessons

- none
