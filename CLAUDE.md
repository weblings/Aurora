# Aurora core — agent rules

## Keep `web-processing/` in sync with the C++ it hand-ports

`web-processing/processing.js` and `web-processing/smoother.js` are hand-ported
JS mirrors of `core/Processing/src/ImageProcessing.cpp`'s crop/mean logic and
`core/Runtime/src/Smoother.cpp`'s easing formula, for the `Aurora-Demo-Web`
browser demo (see `docs/BrowserAnalysis.md`'s reuse-vs-reimplement finding
for why this is hand-ported rather than compiled to WASM). There is no
compiler or shared test runner enforcing the two stay identical — this file is
the enforcement mechanism.

- **Editing `ImageProcessing.cpp`'s `getSubImage`/`getDominantColor`/
  `Algorithms::mean`, or `Smoother.cpp`'s easing formula?** Check whether
  `web-processing/processing.js`/`smoother.js` needs the same change, and
  update `web-processing/processing.test.mjs`'s golden values if the C++
  test's expected values changed too (run `node web-processing/processing.test.mjs`
  to check — no build step, no npm install needed).
- **Editing anything in `web-processing/`?** Check it still matches the real
  behavior of the C++ files named in its own header comments before assuming
  a fix belongs only on the JS side.
- **`Aurora-Demo-Web` copies these two files verbatim** (not an npm package,
  by deliberate choice — see `docs/ImplementationPlan.md`'s Phase 3).
  After changing either file here, recopy it into `Aurora-Demo-Web` too, or
  the demo silently drifts from what this repo actually does.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:46cd31e7 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/core-concepts/sync-concepts.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->
