# Monorepo reorg (2026-09-21)

Seven donor repos merged into `Aurora/` with history, `Analysis/` renamed to
`docs/`, per-dir agents notes kept, planning sections given Status headers.
README/logo/favicon/top-bar brand work is excluded -- logged separately later.

## Subtree adds (Aurora-2ay, closed)

`git subtree add` from local paths, one commit per donor, history preserved
(second-parent/blame proof; `log --follow` does not cross the prefix, which
is expected, not breakage):

- `input/linux/`, `input/windows/`, `output/hue/`
- `app/linux/`, `app/windows/`
- `web/demo/`, `web/ui/`

Core already lived at root. Monorepo chosen over split repos for atomic
cross-cutting changes with path-filtered CI.

## Fix-up pass (Aurora-kwp, closed)

- Doc/ref pointers updated to new paths; duplicate 674-line LICENSEs
  removed from `app/*` (single root license).
- Root `CMakeLists.txt` superbuild + `CMakePresets.json`
  (`windows-app` preset; slice 14/14 and superbuild 19/19 green).
- Path-filtered CI: `linux.yml`, `windows.yml`, `web.yml`; `CODEOWNERS`.
- Root `AGENTS.md` rewritten as index; the seven per-dir `AGENTS.md` kept
  (local notes stay local).

## Post-merge audit

- Remaining stale path pointers fixed across planning docs.
- Demo vendor fork (`web/demo/vendor/webui`) declared intentional (Aurora-4jl):
  standalone GitHub Pages demo, not a second source of truth.
- CRLF whole-file commits fixed with `.gitattributes` `text=auto` + amend.

## Rename (Aurora-jow, closed)

`Analysis/` -> `docs/` (~198 paths in the pointer-update commit). Done
before the reorg settled so later refs never straddle two names.
`docs/` over `Analysis/` for a public repo: standard location, friendlier
to contributors.

## Status headers (Aurora-jkl, closed)

One `Status:` line per planning section (ImplementationPlan, ModuleSplit,
DistributedArchitecture, WebDemoUIUpdate, DocsAndLessonsPainPoints):
system over courtesy -- headers carry state, `docs/archive/` (future) only
carries retired paper. Chosen over an archive section for live plans.

## Verification

- `cmake --preset windows-app` + build + `ctest`: slice 14/14, superbuild
  19/19 (Windows CI `OpenCV_DIR` still unverified live at log time).
- `python3 docs/check-links.sh` green after rename.
- Donor archival + push + first live CI run remain outside this entry.
