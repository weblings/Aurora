# Lessons learned — index and filing rules

Gotchas, non-obvious findings, and hard-won decisions that aren't obvious from reading
the code or planning docs. Add here whenever something costs more than 30 minutes to
diagnose.

**This directory is the only lessons-learned location in the repo** — for huenicorn
work and for the Input/Processing/Output split alike. Don't start a new
`LessonsLearned.md` elsewhere; if unsure whether one already exists, `find . -iname
"*lesson*"` first.

Modeled on [RockyRoad's lessons structure](../../../RockyRoad/Analysis/lessons/README.md)
(see `Analysis/lessons/README.md` there) — same filing/splitting rules, scoped to
Aurora's own module boundaries instead of RockyRoad's. `rendering-apis.md` vs.
`rendering-internals.md` specifically mirrors RockyRoad's own `engine/runtime-apis.md` vs.
`engine/xr-3d-rendering.md` split (third-party API facts vs. this project's own design calls).

## Index

| File | Scope | Entries | File here when |
|---|---|---|---|
| [engineering-hygiene.md](engineering-hygiene.md) | general design/build-tooling principles | 49 | general principle demonstrated by a real bug here |
| [input.md](input.md) | capture/grabber/platform-adapter | 10 | capture/grabber specific |
| [processing.md](processing.md) | color/effect transform, zone-mapping | 3 | color/effect/zone-mapping specific |
| [output.md](output.md) | streaming/protocol, any target | 6 | streaming/protocol/wire-format specific |
| [rendering-apis.md](rendering-apis.md) | third-party rendering facts | 4 | Three.js/GLTFLoader/Blender behavior, not our design |
| [rendering-internals.md](rendering-internals.md) | own 3D-scene design | 3 | our scene technique, demonstrated by a real bug |
| [web-ui.md](web-ui.md) | WebUI screen/flow/component research | 38 | WebUI design or reuse finding |

Counts as of 2026-09-20 — bump the count when adding entries
(`grep -c '^## '` per file).

## Where a new lesson goes

1. About *my own* verification/reliability habits, not code/design? → persistent
   memory (`feedback_*`), not the repo.
2. General software-design principle, demonstrated by a real bug here? →
   `engineering-hygiene.md`.
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
8. A WebUI screen/flow design or component-reuse-research finding (not a
   rendering fact, not general build/tooling)? → `web-ui.md`.
9. Destination file too long to skim (rough proxy: 15+ entries)? Split along a finer
   cut of the same module (e.g. `input.md` → `input/capture-backends.md` +
   `input/pixel-formats.md`, each directory getting its own `INDEX.md`, same shape as
   RockyRoad's `ui-toolkit/`/`engine/`). Then update: that file's own index if it
   becomes a directory, any other lesson entry or code comment pointing at the old
   filename, and this list.

Tied to now-removed code? Keep the principle if it still applies, drop the dead
specifics, and say the origin is historical.

## Entry format

A `##` headline stating the general, reusable principle, a short paragraph of what
actually happened (root cause), then a bolded **Fix:** line. See RockyRoad's
`engineering-hygiene.md` for worked examples of this shape.

## Skills

Per-bucket skills in `.claude/skills/` (mirroring RockyRoad's) route to
this tree — check the matching skill during work, not just archive after
the fact.
