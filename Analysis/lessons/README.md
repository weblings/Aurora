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
Aurora's own module boundaries instead of RockyRoad's.

## Index

- [`engineering-hygiene.md`](engineering-hygiene.md) — general design/build-tooling
  principles: CTest's `enable_testing()` scoping, why not to build on a
  Windows-mounted drive from WSL2 (and the git safe-directory corollary),
  `using namespace` not resolving a sibling namespace's own name (recurred
  once already — treat as a checklist item), relative-path casing across
  Windows/Linux, `FetchContent`-ed subproject CACHE variable collisions,
  environment-selected variants (X11 vs. Wayland) being one plugin with
  backends rather than separate plugins, not porting a logger early costing
  real diagnostics twice over, `FetchContent_Declare(... URL ...)`
  needing `DOWNLOAD_EXTRACT_TIMESTAMP` (plus checking sibling fetch blocks
  for the same gap, since an unexercised fetch path hides it), classifying a
  "generic vs. plugin-specific" field by where it's authored rather than
  where its formula is applied (the gamma-storage gap), a distro dev package
  lacking the `.pc` file its own `pkg_check_modules` call assumed (Mbed TLS
  2.28 vs. 3.6.5), an interface method's return value silently doubling as a
  persisted file path (`IOutput::name()` → `profiles/<name>.json`, case
  included), and distrusting a run's own evidence once it contradicts the
  real-world outcome rather than re-reading the same artifact.
- [`output.md`](output.md) — streaming/protocol gotchas: a bridge having more
  than one entertainment configuration over the same lights being normal,
  not an edge case (empty-ID auto-select isn't "the only one"), and
  `DtlsClient`'s handshake failure being swallowed by design so a clean
  `HueOutput::init()` isn't proof a connection exists.

Buckets below are anticipated based on [`ModuleSplitPlan.md`](../ModuleSplitPlan.md)'s
module boundaries but don't exist yet — a file only gets created once it has a real
entry, not pre-emptively.

- `input.md` — capture/grabber/platform-adapter gotchas (screen capture APIs, pixel
  format quirks, per-OS capture backends).
- `processing.md` — color/effect transform gotchas (colorimetry, zone mapping,
  sampling/interpolation).

## Where a new lesson goes

1. About *my own* verification/reliability habits, not code/design? → persistent
   memory (`feedback_*`), not the repo.
2. General software-design principle, demonstrated by a real bug here? →
   `engineering-hygiene.md`.
3. Capture/grabber/platform-adapter specific? → `input.md`.
4. Color/effect transform or zone-mapping specific? → `processing.md`.
5. Streaming/protocol/wire-format specific (Hue or any other target)? → `output.md`.
6. Cross-cutting entry? File under whichever module *constrains the fix*, not
   whichever exhibited the symptom — e.g. a `PixelFormat` tag being ignored crashing
   an Output-side assumption files under `processing.md` (that's where the tag is
   produced/consumed), not `output.md` (where the symptom showed up). Cross-list in
   the other file's entry if genuinely two-sided.
7. Destination file too long to skim (rough proxy: 15+ entries)? Split along a finer
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

No skills route to this tree yet (Aurora has no `.claude/skills/` yet). Once real
work starts, add skills mirroring RockyRoad's per-bucket lesson skills so this
actually gets checked during work, not just archived after the fact.
