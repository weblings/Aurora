# Graph editor: top bar shrinks to 400 px

Id: daaa29-1-narrow-top-bar

`Aurora-daaa.29.1`. Top bar shrinks by priority, never wraps (GraphEditorCleanup.md, Decisions, narrow windows). Before: Test on lights ran 92 px off the window at 400 px.

- `useMedia.ts` (matchMedia via `useSyncExternalStore`) holds the thresholds: 649 (compact), 519 (tight), 599 (desktop note). Compact: Undo and Redo are `↶` `↷` buttons with accessible names, Unsaved is a dot on the title (name gains "unsaved changes"). Tight: arrow-only back link, `BarMoreMenu` holds Undo and Redo, Test on lights reads Test.
- `DesktopNote.tsx`: dismissible line below 600 px, dismissal in guarded `localStorage`.
- Status text is not hidden when narrow (it carries live status); it shrinks with an ellipsis and the check still passes.
- `graph-editor-narrow.mjs` now asserts at 400 px too, drags one node so Undo is enabled, and tabs to Undo or opens More to find both items at every width.

## Verification

- `npm run graph-editor:narrow` passes at 1100, 900, 700, 520, 400 px, closed and with each drawer; typecheck and Vitest (121) pass; 400 and 700 px screenshots checked by eye.
- Not checked: touch use, screen-reader output of the new names.

## Lessons

- none
