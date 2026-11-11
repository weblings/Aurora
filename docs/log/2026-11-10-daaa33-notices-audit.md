# Icon audit, third-party notices, and what the build ships

Id: daaa33-notices-audit

`Aurora-daaa.33` audit pass and the licence follow-ups it led to. Docs, comments and one new root file; no editor code changed. The mock work from the same bead is in [[daaa33-mock-icons]]. The audit table is in `web/graph-editor/README.md` ("Icon audit").

## Audit findings

- Icon sources: files in `web/ui/icons`, Unicode glyphs (`↶ ↷ ⋯ ⚠ ● ◆ ↑ ↓ ✕ −`), and Grille's own (`×` Drawer close, `▾` Select). No shared module.
- Diffed path data against `media-icons@0.10.0` (npm, MIT, "Copyright (c) 2023 Rahim Alwer"): `play`, `pause`, `chevron-down`, `chevron-up` identical; `back-arrow.svg` is `arrow-left`. The RockyRoad credit in the play/pause file comments is wrong. RockyRoad's `public/` holds the same paths.
- Vidstack has `menu-horizontal`, `x-mark`, `arrow-up/down`, `play`, `stop`, `fullscreen-arrow(-exit)`. It has no undo/redo, warning, minus or diamond: those are drawn new (Aurora's `warning.svg` for the warning mark).
- `power-svgrepo-com.svg` is credited in the root README as Zest (MIT) via SVG Repo. The Zest Free License text (Copyright 2019-2021 32pixels, LLC) was fetched from `32pixelsCo/zest-icons`.
- I first called the power icon's licence unknown and Vidstack's names "proposed": both came from not reading the root README's Art section and not unpacking the npm package. Checked before claiming either.

## Licence findings and changes

- The root README credited Vidstack and Zest by link only; neither had its copyright line or MIT text in the repo. Added `THIRD_PARTY_NOTICES.md` with an Incorporated or Reference-only tag per entry.
- Huenicorn: README and `LICENSE.txt` say GPLv3 with no "or any later version", and no source file has a header. Treated as GPL-3.0-only; the README no longer says "or later". Compared the 12 ported files against `huenicorn-fork`: UV, Interpolation and ImageData are verbatim (2 differing statements each), the Linux grabbers and Color are adapted. No Huenicorn web code in Aurora. Added an upstream-licence line to 11 ported headers; three Linux capture files already had one.
- `XdgDesktopPortal` also adapts `metamuffin/xdg-dp-start` and OBS; the metamuffin licence is unchecked.
- Hyperion: no source file names it. Used as a design reference (external control, error display, Home Assistant output, the 1.1.1 Mac grabber ideas in `Aurora-wqzp`). Recorded as reference only; the README bullet moved into the notices file.
- Windows HDR (`Aurora-wqzp.12`): read RustDesk PR #16033 (`hdr.rs`, `mod.rs`, AGPL-3.0) and OBS `d3d11-duplicator.cpp` and `d3d11-subsystem.cpp` against `ScRgbConversion.cpp` and `sdrWhiteScale`. Shared: the `DuplicateOutput1` format list (same in both), the DisplayConfig call sequence, the sRGB constants, the once-a-second recheck (RustDesk). Different: a CPU half-float lookup table vs a GPU shader, advanced-colour detection, structure. No code copied. GStreamer not read. The OBS "or later" wording is from its usual file header, not checked on these two files.
- Node-editor prior art (Unity, ComfyUI, Blender, Unreal, Houdini, TouchDesigner, n8n, Node-RED) in [[graph-editor-cleanup]] and [[node-graph-pipeline]] is behaviour and layout, not code, assets or screenshots; no notice needed.

## What the build ships

- Vite already emits a hyphenated third-party notices file for bundled npm packages (`vite.config.ts`, `license.fileName`); CMake embeds it and installs it (Mac `Contents/Resources/Licenses/graph-editor/`, Linux and Windows beside the copyright file with a `graph-editor-` prefix). A `vite build` run into the scratchpad produced 23 packages (React, React Flow, Grille, React Aria and the d3 modules) and none of Vidstack, Zest or Huenicorn.
- Nothing in any `CMakeLists.txt` references the root `THIRD_PARTY_NOTICES.md`, so a built app carries the npm notices but not the Vidstack, Zest or Huenicorn ones. Filed as `Aurora-b7ai`. No full app build or install was run.

## Verification

- Path data diffs and the `vite build` output above. No tests run (docs and comments only); the pre-commit link and lesson checks passed.

## Lessons

- none
