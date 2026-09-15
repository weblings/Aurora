# Aurora Demo: Web

A fully self-contained, zero-install browser demo of Aurora's effect —
video in, reactive lights out — running entirely client-side as a Three.js
scene. No native backend, no build step. The zero-install front door for
the project; the native app ([`Aurora-App-Linux`](../Aurora-App-Linux)/
[`Aurora-App-Windows`](../Aurora-App-Windows)) is the upgrade path for
anyone who wants it driving real bulbs.

Distilled from [huenicorn](https://gitlab.com/openjowelsofts/huenicorn)
(GPL-3.0) by way of [Aurora](../Aurora), so this repo carries the same
license forward — see `LICENSE`.

See [`Aurora/Analysis/BrowserAnalysis.md`](../Aurora/Analysis/BrowserAnalysis.md)
and [`Aurora/Analysis/ImplementationPlan.md`](../Aurora/Analysis/ImplementationPlan.md)'s
Phase 3 (Milestone 1) for the full scoping and reasoning behind this repo's
shape and its split from Aurora core.

## Status

First scaffolding step only: the Three.js scene (16:9 video plane, 9-slice
grid, 8 point lights positioned around the edges) driven by fake, cycling
per-zone colors — no real video or processing yet, deliberately, to prove
out the scene/light layout in isolation first.

- `index.html` / `main.js` — the scene itself.
- `zonemap.js` — the 9-slice zone definitions, shaped to match Aurora
  core's `ZoneMapStore` JSON exactly (`zoneId`/`uvs.min`/`uvs.max`/`active`/
  `gamma`) so a real exported profile could drop in with no reshaping.

- `processing.js` / `smoother.js` — copied verbatim from
  [`Aurora/web-processing/`](../Aurora/web-processing) (not consumed as a
  package, for now — see that repo's `CLAUDE.md` for the sync rule). Not yet
  wired into the scene.

## Not yet built

- File input (bundled WebM sample + upload) driving real video into the scene.
- Wiring `processing.js`/`smoother.js` in to replace `fakeZoneColor` in `main.js`.

## Running

No build step — any static file server works:

```
npx serve .
```
