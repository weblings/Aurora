# Save-as-new check expected the wrong copy title

Id: xr4c-save-as-new-check-title

`Aurora-xr4c`, unblocks `Aurora-daaa.10`. The `graph-editor-save-as-new` check asserted `Browser check fork source copy`; the editor titles the fork `Browser check fork source (Copy)`.

## State

- The `(Copy)` form is the app-wide rule: `duplicateTitle` in `web/ui/EffectPanelModel.js`, covered by `EffectPanelModel.test.mjs` and used by the effect panel. The check was the stale side, so only its assertion changed.
- The ids stay `-copy`; only the title text differs.

## Verification

- `npm run graph-editor:save-as-new` in `tools/browser-check` passes all four steps. Needed `npx playwright-core install chromium-headless-shell` first; the machine had no Chromium.

## Lessons

- Lessons: none.
