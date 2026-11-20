# View recipes item in the Add node menu

Id: hzjf-view-recipes-menu-item

`Aurora-hzjf`, follow-up from `Aurora-4g4d.3`: users could not find the recipes page from the editor.

## What shipped
- **Menu item**: the Add node group list ends with a separator and View recipes. It opens the hosted page in a new tab with `noopener` and closes the menu. It does not show while searching.
- **URL**: `https://weblings.github.io/Aurora/recipes/` in `web/graph-editor/src/recipesLink.ts`, inferred from the demo's host. No workflow publishes the page yet, so the URL is unconfirmed. Change that one constant once the deploy is up.
- **Not done**: bundling the recipes page into the editor build so local and demo link to their own copy. It would grow the embedded binary and merge two builds, see [[effect-recipes]].

## Verification
- `npx vitest run` passes (25 files, 358 tests).
- `npm run graph-editor:add-menu` passes, extended to expect View recipes last and a new tab opening the URL (routed, so no network).
- Findings: Vitest fails to start (`reading 'config'`) when run from Git Bash with a lowercase `d:` working path. Run it from PowerShell or with `D:`.

## Lessons
- none
