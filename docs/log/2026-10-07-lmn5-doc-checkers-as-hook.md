# Aurora-lmn.5: check-links.sh/check-lessons.sh wired into the pre-commit hook

Id: lmn5-doc-checkers-as-hook

2026-10-07. Un-defers the git-hook half of Aurora-lmn.4 ("honor over hooks" —
see `docs/log/2026-09-20-docs-system-overhaul.md` and
`docs/archive/DocsAndLessonsPainPoints.md` item 3). lmn.4 stays deferred for
CI specifically (still flaky here); a local git hook doesn't depend on CI
and was lumped into that deferral without its own reason.

## Done

- `.beads/hooks/pre-commit` (tracked, `core.hooksPath` already points here)
  gets a new section appended below bd's own `# --- END BEADS INTEGRATION
  ---` marker — per `bd hooks install --help`, content outside bd's markers
  survives future `bd hooks install` upgrades. Gated on
  `git diff --cached --name-only` touching `docs/`, `.claude/skills/`, or a
  README/CLAUDE.md, so an unrelated commit (pure C++, etc.) pays nothing.
  Runs `check-lessons.sh` then `check-links.sh` unpiped (debugging-method.md's
  "piping hides exit status" lesson), `git add`s the regenerated
  `docs/_ids.md` on success so it lands in the same commit, and prints a
  `--no-verify` escape hatch in its failure message.
- `docs/check-links.sh`: added `encoding='utf-8'` to all three `open()`
  calls (was relying on `PYTHONUTF8=1` being set by hand on Windows — a hook
  invocation can't rely on that) and `newline=''` on the `docs/_ids.md`
  write (was round-tripping through `\r\n` on Windows, turning every run
  into a ~100-line whitespace diff). Verified: `python docs/check-links.sh`
  now runs clean on Windows with no env var, and a rerun only diffs real
  content, not line endings.
- Found and fixed along the way: a lesson entry I'd just added to
  [components.md](../lessons/components.md) had a blank line between its
  heading and `Tags:`, which `check-lessons.sh` correctly flagged — first
  real catch from this exact hook, during its own rollout.
- Found and fixed two pre-existing dead `[[windows-env]]`/`[[macos-gui]]`
  wikilinks in `docs/log/2026-10-07-k73j-tray-see-error.md` (lesson files
  carry no `Id:` line, so a wikilink to one never resolves). These would
  have blocked every docs-touching commit on this branch once the hook
  went live. First converted to plain markdown-path links — later judged
  the wrong fix (reintroduces the exact move-proofing problem `Id:`/`[[id]]`
  exists to solve) and re-filed properly as Aurora-lmn.7 (see Follow-up).
- `docs/README.md`'s reorg-checklist step 3 now notes the hook covers the
  "run after every move" case automatically, while keeping the mid-pass
  manual-run advice (the hook only fires at commit time).

## Verified

Invoked `.beads/hooks/pre-commit` directly (no real commit made, to keep
this session's staging under the user's control): no-ops with nothing
staged, no-ops with only a non-doc file staged, correctly caught and
blocked on the two pre-existing dead links with a real docs change staged,
then passed and re-staged `docs/_ids.md` once those were fixed.

## Not done

Did not rename `check-links.sh` to `.py` or convert lesson files onto
`Id:`/`[[id]]` in this bead — both filed separately (see Follow-up) since
each touches more living docs than this bead's own scope.

## Follow-up (same day)

- Filed **Aurora-lmn.6**: rename `check-links.sh` → `.py`. Confirmed
  low-risk (its own link-checking regex only looks at paths ending in "md",
  so it would never match itself; not invoked by shebang anywhere since
  this bead's hook already calls it through an
  explicit interpreter variable) but touches `docs/README.md`, `AGENTS.md`,
  and two `docs/lessons/architecture-process.md` mentions, so kept separate.
- Filed **Aurora-lmn.7**: give `docs/lessons/*.md` files `Id:` lines,
  prefixed `lesson-` (e.g. `lesson-windows-env`) rather than a bare topic
  slug. `docs/_ids.md` is one flat global namespace with no per-directory
  scoping — and can't have one, since a bare `[[id]]` citation carries no
  directory context for a scoped resolver to use. `log/` ids already get
  free namespacing this way via their bead-id prefix (`98pr-...`,
  `cj11-...`); lessons have no equivalent, hence the explicit prefix.
  Scope (just the 2 files touched here, or all 20) left open.
- Corrected the now-partly-stale entry in
  [build-toolchain.md](../lessons/build-toolchain.md) on `check-links.sh`'s
  `.sh`/Python mismatch: the `PYTHONUTF8=1`/line-ending
  advice it gave is exactly what this bead's `encoding='utf-8'`/`newline=''`
  fix made unnecessary — same treatment as a stale `Status:` line, not left
  as history since it's a living gotcha list.
- 2 new lessons in [architecture-process.md](../lessons/architecture-process.md): the `bd hooks install`
  marker-preservation contract this bead relied on, and "turning on
  enforcement for a long-dormant checker surfaces a real backlog
  immediately" (both catches from this bead's own rollout, above).
- Added a "Where error copy lives" pointer map to
  `docs/planning/ErrorOverlay.md` (file/function references, not copied
  strings, so it can't drift the way a transcript would) — requested
  separately, while Aurora-ijus's shell-copy audit was still fresh context.
