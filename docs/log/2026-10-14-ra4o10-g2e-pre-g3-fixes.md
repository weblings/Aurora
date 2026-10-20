# G2e pre-G3 review fixes (Aurora-ra4o.10)

Id: ra4o10-g2e-pre-g3-fixes

Closed 2026-10-14. Review of G2a-G2d before G3 makes a host run the graph.

## Done

- `image.dropAlpha` caches by input identity. Windows and Mac deliver BGRA,
  so it reconverted every tick on a static desktop (the Aurora-igwa cost the
  legacy prepared-image cache avoids). Covered in `VideoNodesTests`.
- Node param schemas for `audio.drift`, `audio.bounce` and `frame.smooth`
  now come from `paramSchema(<config key>)`, so range, label and default
  have one source with Config. The built-in graph docs no longer repeat
  defaults (the loader fills them), and `nodeDoc` overlays only named
  tunable params. `image.rescale` width max raised to 7680 (UI hint only).
- Live-edit parity: new `video_live_edits` and `audio_pcm_live_edits`
  scenarios change Tuning fields mid-run. Legacy runs `setConfig` /
  `setSettings`, graph runs rebuild + `adoptStateFrom` + swap (G3's
  mechanism). Removing `adoptStateFrom` fails both (6 assertions each).
- Full core suite 247/247 (Windows MSVC Debug).
- Lessons: 3 (per-stage identity caches when splitting a cached step, node
  schemas read Config tables, hot-edit parity in architecture-process and
  debugging-method).

## Carried forward (Aurora-ra4o.8 notes)

- G3 scope not in its description: `Orchestrator::init` work (monitor
  select, refreshRate / subsampleWidth derivation, capture width hint,
  zone-map reconcile + save, `updateZone`) needs a new owner.
