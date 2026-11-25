# 1.2.1 takes the React-free pieces of feat/ReactPort

Id: b665-react-free-port

`Aurora-b665`. The React and Grille port (`Aurora-4nqt`) moved to 1.2.2 and stays on `feat/ReactPort`.

- Reverted the code of `Aurora-4nqt.3` (owner, 2026-11-25): no island bundle on the main page or the demo, and NavFooter is vanilla again. Its log and lessons stay.
- `feat/ReactPort` contains the reverted commit, so merging this branch into it removes the islands unless the revert is undone there.
- Ported by hand: [[atpm-remove-zest-pro-icons]] and [[7p8f-notice-chat-icon]]. No commit cherry-picked cleanly.
- On this branch the Dashboard's error rows are vanilla, so its notice marks are `.shell-mark` at 15px for both open rows and the collapsed bar.
- The Stop icon is `web/ui/icons/power.svg`, copied from Grille's `powerIcon` (OpenMoji, CC BY-SA 4.0) with a new notice. `feat/ReactPort` had not swapped it.
- The editor pins Grille v0.2.2-dev.5, a GitHub tarball. npm 12 refuses those, so SteamOS needs an npm release before 1.2.1 ships.
- `docs/check-close.py` skips beads labelled `on:<branch>` when that branch is not checked out.
- Importing an older beads export does not reopen beads (stale rows are skipped), but restores labels and dependencies removed without any other edit. Tested with bd 1.3.1 in a scratch database. [[lesson-architecture-process]]

## Verification
- 44 web node tests, vendor closure, demo graph and descriptor checks, `check-links.py` and `check-lessons.sh` passed.
- Editor `tsc --noEmit`, `vitest run` (375, the 3 NavFooter tests went with the revert), editor and recipes builds passed.
- On a rebuilt Windows Release app, `dashboard-shell` and `graph-editor:error-shell` passed. Dashboard collapsed and pairing screenshots and the editor open-rows screenshot were viewed.
- The close gate passed after labelling. A scratch copy without the `on:` skip blocked on the branch-only beads.
- Not checked: the onboarding footer in a browser, the demo in a browser, Firefox, Safari, Mac and Linux.

## Lessons
- [[lesson-architecture-process]]: removing a beads label or dependency does not bump `updated_at`.
