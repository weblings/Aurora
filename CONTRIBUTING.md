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
in the root `CMakeLists.txt`, matching the hand-written top entry of
`CHANGELOG.txt` by convention (the apps compile it into their
`/api/version` route). `CHANGELOG.txt` is the maintainer's own notes --
agents and contributors bump the version only when asked and never touch
the changelog; nothing enforces the mirror.

## Quality gates

- Build and test per [docs/Building.md](Building.md); `ctest` for the
  touched preset/slice must pass before finishing.
- Non-obvious gotchas worth saving future time go in `docs/lessons/` with
  `Tags:` / `Applies-when:` lines (enforced by `docs/check-lessons.sh`);
  check the matching skill area before changing it.
- Milestone detail (closed or paused) goes in a dated `docs/log/` file plus
  an `INDEX.md` row on close. Planning docs carry decisions, status, and
  pointers only — no task lists, no build play-by-play.

## Platform notes

### Mac (experimental, tier 1 as of 1.0.3)

Terminal-only app with video + audio capture; no tray. Regular builds are
single-machine (ad-hoc signed); a notarized build needs the maintainer's
Developer ID. Scoping and design decisions live in
[[mac-video-capture]]/[[mac-audio]] (shipped) and
[[mac-tray-parity]] (still open) and [[mac-notarization]] (partly shipped).

Supported target: macOS 27 on Apple silicon. Building from source on macOS 14.2-26 should work (the code's own floor is 14.2, the process-tap API) but is untested below 27, and Intel Macs are not supported (Aurora-pyo). A normal build needs no Apple account. Setup:

```sh
xcode-select --install  # Xcode CLT (confirm even if Xcode.app is installed)
# Homebrew: https://brew.sh
brew install cmake opencv curl aubio mbedtls@3 pkg-config
# mbedtls@3 is keg-only, and plain `mbedtls` is v4 (incompatible API) — point
# pkg-config at v3 and make it the active one (pitfall details in
# docs/lessons/build-toolchain.md):
export PKG_CONFIG_PATH="$(brew --prefix mbedtls@3)/lib/pkgconfig:$PKG_CONFIG_PATH"
brew link mbedtls@3 --force
brew install steveyegge/beads/bd  # then `bd import` from the repo root
# A first-ever `bd` command failing with "issue_prefix config is missing" is a
# beads first-run quirk: run any other bd command once, then retry.
```

```sh
cmake --preset mac-app
cmake --build build/mac-app
ctest --test-dir build/mac-app --output-on-failure
```

## Dev tools

- Fake-lights viz: validate capture/output color with no Hue hardware via
  `tools/light-viz-relay/README.md` ("End-to-end viz run") — fake bridge →
  relay → app with `--fake-hue` → `viz.html` in a served `web/demo/`.
  Agent notes live in `web/demo/AGENTS.md`.
