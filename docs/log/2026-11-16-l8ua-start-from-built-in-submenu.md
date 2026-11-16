# Graph editor: New menu lists Built-in as its first sub-menu

Id: l8ua-start-from-built-in-submenu

`Aurora-l8ua`, stage 9 of [[graph-editor-cleanup]]. The New submenu's Start from list is now Empty, then a Built-in sub-menu, then Custom and Hidden.

## What changed

- `startGroups` returns Built-in first: every built-in, hidden ones included, Music pulse only with an audio input (the `startPoints` rule). `TitleMenu.tsx` renders only Empty flat. Revises stage 8 `.4`, where built-ins were flat.
- The dashboard's Start from is unchanged. Whether Built-in should list only audio-eligible entries was left as the dashboard rule, unconfirmed with the owner.
- The plan doc gains a Stage 9 section for `Aurora-l8ua`, `Aurora-z5y5`, `Aurora-23wu` and `Aurora-1fwk`.

## Verification

- vitest `titleMenu.test.ts` 10/10 (Built-in first, audio rule, empty groups) and editor `tsc --noEmit` clean.
- Browser checks (`graph-editor:title-menu` and others that read the flat built-ins) were not run, so they may still expect the old flat list.

## Lessons

- none
