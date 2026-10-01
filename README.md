# Aurora Demo: Web

A fully self-contained, zero-install browser demo of Aurora's effect —
video in, reactive lights out — running entirely client-side as a Three.js
scene. No native backend, no build step. The zero-install front door for
the project; the native app ([`app/linux`](../../app/linux)/
[`app/windows`](../../app/windows)) is the upgrade path for
anyone who wants it driving real bulbs.

Distilled from [huenicorn](https://gitlab.com/openjowelsofts/huenicorn)
(GPL-3.0) by way of [Aurora core](../../), so this repo carries the same
license forward — see `../../LICENSE`.

See [[browser-analysis]]
and [[implementation-plan-phase-3]]'s
Milestone 1 for the full scoping and reasoning behind this repo's
shape and its split from Aurora core.

## Status

The bundled sample video now actually drives the scene: a real `<video>`
element plays `assets/168273-838673780.webm` as the plane's texture, each
frame is sampled to a small offscreen canvas, run through the real
hand-ported `composeFrame`/`Smoother` pipeline, and used to color the 8
lights/markers live. The plane rebuilds to the video's real aspect ratio
once its metadata loads, rather than assuming exactly 16:9.

- `index.html` / `main.js` — the scene, video wiring, and per-frame sampling loop.
- `zonemap.js` — the 9-slice zone definitions, shaped to match Aurora
  core's `ZoneMapStore` JSON exactly (`zoneId`/`uvs.min`/`uvs.max`/`active`/
  `gamma`) so a real exported profile could drop in with no reshaping.
- `processing.js` / `smoother.js` / `audioFeatures.js` / `colorModel.js` —
  copied verbatim from [`web-processing/`](../../web-processing) (not consumed
  as a package). Don't edit them here: fix upstream and recopy; see
  [`CLAUDE.md`](CLAUDE.md) for the sync rule.
- `viz.html` + `viz.js` — the standalone light-viz page (Aurora-gj0.6): the
  room rig on the shared `scene-core.js`, no WebUI/video/audio DOM. Its color
  source is `live-data-source.js` (an `EventSource` against the relay in
  [`tools/light-viz-relay`](../../tools/light-viz-relay)), the third provider
  beside `video-source.js` / `audio-source.js` (contract documented on
  `main.js`'s `animate()`). Channel id -> `ROOM_ZONE_MAP` order is fixed
  (0/1/2/3 = front-left/front-right/back-left/back-right). The page stays dark
  until the first mappable frame, by design. Full live run: that README's
  "End-to-end viz run".
- `vendor/webui/` — an intentional GitHub-Pages-targeted fork of `web/ui`, not
  a mirror. Do not "sync" it (decision recorded in Aurora-4jl).
- `assets/` — bundled sample media. See "Media credits" below.

## Not yet built

- A user-upload option for the video (currently only the bundled sample plays).
- Real end-to-end visual confirmation in an actual browser (built and
  smoke-tested via a local static server; the render itself hasn't been
  eyeballed yet).

## Media credits

`assets/168273-838673780.webm`: video by
[Rehan Ali](https://pixabay.com/users/rehanali4233481-13764965/) via
[Pixabay](https://pixabay.com/), used under the
[Pixabay license](https://pixabay.com/service/license-summary/).

`assets/TV_Room.glb`: composed from two [polygone.art](https://polygone.art/) models —
[Living Room](https://polygone.art/#filter=tv&page=model&guid=cI9YQFHd5Ua) by Alex "SAFFY"
Safayan, and [Standing Lamp](https://polygone.art/#filter=lamp&page=model&guid=aZyMp9TEk0I) by
Danny Bittman.

`assets/Electro Cabello.mp3` / `assets/ElectricCabello.jpg`: "Electro Cabello" by
[Kevin MacLeod](https://incompetech.com/), licensed under
[Creative Commons: By Attribution 4.0](http://creativecommons.org/licenses/by/4.0/).

## Running

No build step — any static file server works:

```
npx serve .          # or: python3 -m http.server
```

Tests: `node <name>.test.mjs`, no build step.
