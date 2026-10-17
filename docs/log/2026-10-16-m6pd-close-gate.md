# Pre-commit close gate (Aurora-m6pd)

Id: m6pd-close-gate

Closed 2026-10-16. The AGENTS.md close ritual (log, INDEX row, lessons, export) was advisory, and agents skipped it.

## Done

- `docs/check-close.py`: for each bead closed in the staged `.beads/issues.jsonl` and not in HEAD's, requires a `docs/log/` entry naming the id, a lessons record (`## Lessons` section or `- Lessons:` line, "none" counts) and an `INDEX.md` row. Also blocks closes present in the working-tree export but unstaged. On failure it prints the close checklist, so any agent running `git commit` gets the prompt.
- Wired into `.beads/hooks/pre-commit` ahead of the doc-lint block, gated on the export differing from HEAD. Bypass: `AURORA_SKIP_CLOSE_GATE=1` or `--no-verify`.
- Id match is exact (`Aurora-x.1` does not match `Aurora-x.10`). Logs are read from the index via `git grep --cached`, so a log from an earlier commit counts.
- `AGENTS.md` close rule describes the gate.
- Fixed three dead bare-filename citations in [[5ipy1-ec0-decisions]] to `[[id]]` links (they blocked `check-links.py`).

## Verification

- Scratch repo: clean, unstaged export, no docs, wrong id, empty lessons, both lessons forms, bypass.
- Replay of the last 30 export-changing commits: 8 blocked, all real gaps (lessons or log added in a later commit, epics no log names).

## Lessons

- None.
