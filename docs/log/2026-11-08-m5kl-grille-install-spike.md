# Grille install spike for the graph editor

Id: m5kl-grille-install-spike

`Aurora-m5kl`, feeds [[graph-editor-cleanup]]. Result: a built `npm pack` tarball installs under `ignore-scripts`. Recommend a Grille GitHub release asset as the G1 deliverable.

## State

- Scratch worktree of `web/graph-editor` with the real `.npmrc`, Grille at 61e83a7. Worktree and branch deleted, nothing merged.
- Install: `file:` tarball spec, integrity hash recorded, `npm ci` with `GIT_SSH_COMMAND=false` passed on Windows after deleting `node_modules`. `tsc --noEmit` passes importing `Select`.
- Sizes (raw JS / CSS): baseline 439.37 / 25.77 kB. Plus `ui.css` 32.39 kB CSS. Plus Grille `Select` 613.84 kB JS (194.16 gzip). Plus React Aria `Menu` and `Popover` 625.43 kB JS (197.69 gzip). Grille has no Menu yet.
- Notices gain React Aria, React Stately, `clsx` and Grille automatically. `fonts.css` bundles 6 Inter files (~165 kB) with no OFL entry.
- Numbers, lockfile entry and the G1 recommendation are in the `Aurora-m5kl` notes and "Scoping concerns" of [[graph-editor-cleanup]].

## Verification

- Sizes came from `vite build` output per stage. Notices came from a diff of the generated file.
- Not checked: the https release URL (the sandbox denied a local HTTP server), Mac and Linux builds, `web.yml` on a runner.

## Lessons

- 1 new: `docs/lessons/build-toolchain.md` (Vite license output skips CSS-referenced fonts).
