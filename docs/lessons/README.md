# Lessons learned — index and filing rules

Gotchas, non-obvious findings, and hard-won decisions that aren't obvious from reading
the code or planning docs. File any non-obvious troubleshooting that can save time
in the future — if it wasn't obvious from the code, it's worth keeping here.

**This directory is the only lessons-learned location in the repo** — for huenicorn
work and for the Input/Processing/Output split alike. Don't start a new
`LessonsLearned.md` elsewhere; if unsure whether one already exists, `find . -iname
"*lesson*"` first.

Modeled on [RockyRoad's lessons structure](https://github.com/weblings/RockyRoad)
— same filing/splitting rules, scoped to
Aurora's own module boundaries instead of RockyRoad's. `rendering-apis.md` vs.
`rendering-internals.md` specifically mirrors RockyRoad's own `runtime-apis` vs.
`xr-3d-rendering` lesson split (third-party API facts vs. this project's own design calls).

## Index

| File | Scope | Entries | File here when |
|---|---|---|---|
| [build-toolchain.md](build-toolchain.md) | CMake, vcpkg, compilers, WSL2, dev deps | 17 | build/tooling specific |
| [windows-env.md](windows-env.md) | processes, installers, ACLs, probing | 12 | Windows-environment specific |
| [debugging-method.md](debugging-method.md) | evidence, verification, oracles, timing | 23 | debugging/verification method |
| [architecture-process.md](architecture-process.md) | splits, duplication, reload, presence | 20 | architecture or process decision |
| [web-testing.md](web-testing.md) | jsdom, live tests, routes, settings | 8 | web testing specific |
| [language-cpp.md](language-cpp.md) | namespace, threads, C-portability | 7 | C++ language gotcha |
| [input.md](input.md) | capture/grabber/platform-adapter | 12 | capture/grabber specific |
| [processing.md](processing.md) | color/effect transform, zone-mapping | 6 | color/effect/zone-mapping specific |
| [output.md](output.md) | streaming/protocol, any target | 8 | streaming/protocol/wire-format specific |
| [rendering-apis.md](rendering-apis.md) | third-party rendering facts | 4 | Three.js/GLTFLoader/Blender behavior, not our design |
| [rendering-internals.md](rendering-internals.md) | own 3D-scene design | 3 | our scene technique, demonstrated by a real bug |
| [planning.md](planning.md) | reuse research, JTBD, doc hygiene | 15 | WebUI planning/design-process finding |
| [components.md](components.md) | behavior, callbacks, data shapes | 8 | WebUI component finding |
| [webui-testing.md](webui-testing.md) | jsdom limits, mocks, fixtures | 7 | WebUI testing finding |
| [navigation-flow.md](navigation-flow.md) | Back/Continue, gating, NUX | 9 | WebUI flow finding |
| [layout-css.md](layout-css.md) | responsive, pseudo-elements, flex | 9 | WebUI layout/CSS finding |

Counts as of 2026-09-24 — bump the count when adding entries
(`grep -c '^## '` per file).

## Where a new lesson goes

1. About *my own* verification/reliability habits, not code/design? → persistent
   memory (`feedback_*`), not the repo.
2. Build/tooling, Windows env, debugging method, architecture/process,
   web testing, or C++ language? → the matching query-coherent file
   (`build-toolchain`, `windows-env`, `debugging-method`,
   `architecture-process`, `web-testing`, `language-cpp` — see index).
3. Capture/grabber/platform-adapter specific? → `input.md`.
4. Color/effect transform or zone-mapping specific? → `processing.md`.
5. Streaming/protocol/wire-format specific (Hue or any other target)? → `output.md`.
6. A third-party rendering fact (Three.js/GLTFLoader/Blender-export behavior), not this
   project's own design? → `rendering-apis.md`. This project's own 3D-scene design/technique,
   demonstrated by a real bug? → `rendering-internals.md`.
7. Cross-cutting entry? File under whichever module *constrains the fix*, not
   whichever exhibited the symptom — e.g. a `PixelFormat` tag being ignored crashing
   an Output-side assumption files under `processing.md` (that's where the tag is
   produced/consumed), not `output.md` (where the symptom showed up). Cross-list in
   the other file's entry if genuinely two-sided.
8. A WebUI finding? → the matching query-coherent file (`planning`,
   `components`, `webui-testing`, `navigation-flow`, `layout-css`).
9. A file's query vocabulary getting muddy (entries answering different
   questions)? Subdivide along the queries, not a count. Then update this
   index; file-level pointers live only here and in `.claude/skills/`.

Tied to now-removed code? Keep the principle if it still applies, drop the dead
specifics, and say the origin is historical.

## Entry format

A `##` headline stating the general, reusable principle, immediately
followed by `Tags:` and `Applies-when:` lines (the retrieval contract —
`check-lessons.sh` enforces placement), then a short paragraph of what
actually happened (root cause), then a bolded **Fix:** line. See RockyRoad's
`engineering-hygiene.md` for worked examples of this shape.

Cite entries by headline, never by filename — headlines survive splits,
filenames don't.

## Skills

Per-bucket skills in `.claude/skills/` (mirroring RockyRoad's) route to
this tree — check the matching skill during work, not just archive after
the fact.
