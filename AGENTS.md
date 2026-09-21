# Aurora core — agent notes

Core repo: shared `Contracts`, `Processing`, `Input`/`Output` interfaces,
`Runtime`, and `web-processing/` JS mirrors. Concrete plugins live in
`input/`, `output/`, `app/`, `web/` directories in this repo — keep that layout.

- Build/test: `cmake -S . -B build`, `cmake --build build`,
  `ctest --test-dir build --output-on-failure` (`BUILD_TESTS` defaults ON).
  Full-app builds: `cmake --preset <linux-app|windows-app>` (per-slice
  presets in `CMakePresets.json`); core tests alone via `cmake -S core`.
- `web-processing/` JS mirrors are hand-ports of C++ (`processing.js`/
  `smoother.js` <- `ImageProcessing.cpp` crop/mean, `Smoother.cpp` easing;
  see `docs/BrowserAnalysis.md` for why hand-ported, not WASM): editing
  either side means checking the other, updating golden values in
  `web-processing/*.test.mjs` (`node web-processing/<name>.test.mjs`, no
  build step), and recopying into `web/demo/` (verbatim copies, no npm
  package — else the demo silently drifts).
## Where things go

- Tasks (open, blocked, deferred): `bd` (`bd ready`, `bd list`), not markdown
  TODOs or checkboxes. Auto-export is debounced — run
  `bd export -o .beads/issues.jsonl` immediately before `git add`ing task state.
  Sync rides git, not the Dolt remote (unused here): after `git pull`, run
  `bd import` to upsert the tracked export into your live DB — never `--reinit-local`.
- Non-obvious gotchas worth saving future time: `docs/lessons/`, with `Tags:`/`Applies-when:`,
  routed by the matching `.claude/skills/` skill — check it before changing
  that area, file per `docs/lessons/README.md`.
- Milestone detail (closed or paused): dated file in `docs/log/` + `INDEX.md`
  row on close — every material fact, stated once and tightly; paused work logs
  state + resume pointer. Findings over narration.
- Planning docs: decisions, status, pointers only. No task lists, no build play-by-play.
- References: cite lessons by headline/topic, files by markdown link, external
  lessons by topic + directory (URLs live under Related directories).

## Related directories to be aware of

- This family, all in this repo: `input/linux`, `input/windows`,
  `output/hue`, `app/linux`, `app/windows`, `web/demo`, `web/ui` --
  core interfaces in `core/`, resolved by relative path. Per-slice notes in
  each directory's own `AGENTS.md`; tasks and lessons live here at the root.
- [RockyRoad](https://github.com/weblings/RockyRoad) — reference for Three.js/WebXR
  scenes, design tokens, and UI components (checked directly during WebUI design).
- [RockyRoadImport](https://github.com/weblings/RockyRoadImport) — import-pipeline
  reference (tab bar, forms page, layout tokens reused in WebUI).
- [huenicorn](https://gitlab.com/openjowelsofts/huenicorn) — the original
  Hue-entertainment reference (`Runtime::_update`, `ScreenWidget.js`); ported
  from, not depended on.

Cite reference lessons by topic name, never by path — layouts differ per machine.

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
