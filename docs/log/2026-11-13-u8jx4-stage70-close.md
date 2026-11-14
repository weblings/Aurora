# Graph editor: stage 6 edge cases left after close-out are fixed

Id: u8jx4-stage70-close

`Aurora-u8jx.4` (P2): edge cases found reviewing stage 6 ([[graph-editor-cleanup]]) after it closed ([[u68h7-close-out]]). This is stage 6 follow-up work. It is filed under the stage 7 epic `Aurora-u8jx` and titled "Stage 7.0" only because it was done first in that sequence. Stage 7's own scope (problems in people's words, 7a-7c) is untouched. Closes with its six children, done 2026-11-13 by Sonnet subagents in one shared tree and checked by the coordinator before each commit.

## Children

- 7.0a `Aurora-u8jx.4.1`: the refused-save callout stays clear of the title and Add node. The late-mount step was shown to fail without the h55g fix. [[u8jx41-callout-clear-of-title]]
- 7.0b `Aurora-u8jx.4.2`: test-ended outcomes are announced only and the Test menu line is gone. A lost heartbeat is a toast, read out once. [[u8jx42-test-ended-toast]]
- 7.0c `Aurora-u8jx.4.3`: the Test menu opens in place, and menu items pad like the bar's buttons. [[u8jx43-bar-menu-motion-padding]]
- 7.0d `Aurora-u8jx.4.4`: node param number fields have no native spin buttons and no float noise. [[u8jx44-number-field-spinners]]
- 7.0e `Aurora-u8jx.4.5`: the dead open-failure detail is removed and the reload row's unit-test coverage is recorded. [[u8jx45-status-detail-reload-coverage]]
- `Aurora-uds2`, found in 7.0e and added by the owner: `Status` drops `detail` and `where`, which were never drawn. The Take over tooltip now names the holder, as the plan's rank 5 row always said. [[uds2-status-undrawn-fields]]

## Verification

Each child's checks ran while other children's edits were in the tree. After the last commit, these ran once more on the combined head (unit tests, typecheck, build, and the browser checks `refused-save`, `test-outcome`, `top-bar`, `error-shell`, `failed-save`, `title-menu`, `add-menu`, `narrow`, `control-count`, `context-menus`, `undo-toast`) on head `1d9a37ae`: all pass.

Still unverified:
- The callout's "drop under Add node" branch: no tested width reaches it.
- The server's own 6 s heartbeat timeout: the check mocks its answer.
- The number fields in Firefox and Safari.

## Lessons

- "The browser-check stack is one per machine, so parallel agents need a lock and a free port 8215, not worktrees" (web-testing). Two agents' first runs all failed on a non-stack Aurora holding 8215.
- "The editor's Toast is already a live region; announcing the same text through the Announcer speaks it twice" (components), found reviewing 7.0b.
- "A right-anchored popover slides in while its content wraps and re-measures" (layout-css), from 7.0c.
