# Contributing to Aurora

## Tasks: beads, not TODO lists

All task tracking goes through `bd` (beads) — no markdown TODOs or
checkboxes. The live DB syncs over git; `.beads/issues.jsonl` is a passive
export that must be refreshed before staging task state.

```sh
bd ready                    # find available work
bd list --status=open       # all open issues
bd show <id>                # details + dependencies before editing
bd update <id> --claim      # claim work when starting
bd create --title="..." --description="..." --type=task|bug|feature --priority=2
bd close <id> --reason="..."  # only when the work is actually complete
bd export -o .beads/issues.jsonl   # immediately before git add-ing task state
```

## Version + changelog

The app version's single truth is `project(AuroraMonorepo VERSION x.y.z)`
in the root `CMakeLists.txt`, mirrored by the top entry of `CHANGELOG.txt`
(the apps compile it into their `/api/version` route). The maintainer will bump the two
together.

## Quality gates

- Build and test per [docs/Building.md](Building.md); `ctest` for the
  touched preset/slice must pass before finishing.
- Non-obvious gotchas worth saving future time go in `docs/lessons/` with
  `Tags:` / `Applies-when:` lines (enforced by `docs/check-lessons.sh`);
  check the matching skill area before changing it.
- Milestone detail (closed or paused) goes in a dated `docs/log/` file plus
  an `INDEX.md` row on close. Planning docs carry decisions, status, and
  pointers only — no task lists, no build play-by-play.
