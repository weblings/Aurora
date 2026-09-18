# Tooltips plumbing analysis (Aurora WebUI)

Goal: hover tooltips on Dashboard sliders, dropdowns, and (plumbed, low
priority) bools, with identical behavior wherever the same control appears
in NUX. Tooltips scale across a variable set of input/output/processing
modules: each module describes its own controls, the backend aggregates,
the frontend looks up by key.

Deliberately deferred: tooltip *content* (every tooltip initially renders
the literal text `Test`), the renderer beyond the browser default (see
Rendering), and generating controls from descriptors.

## Rendering (phase 1 decision)

Native browser tooltip via the `title` attribute. Zero layout risk, zero
new CSS, works on every screen including NUX with no per-screen work, and
proves the plumbing end to end before any styling investment. Revisit a
custom styled renderer (delays, positioning, touch handling) only after
plumbing + content are verified live.

## Descriptor contract (core, once)

One schema defined in core alongside `Contracts`, with the same stability
expectations as `IVideoInput`/`IOutput`:

- `key`: namespaced `module.setting` (e.g. `video.transitionSmoothing`,
  `audio.bounceSmoothTime`, `input.monitor`, `output.hue.entertainmentConfig`,
  `zones.active`, `app.mode`).
- `kind`: slider | dropdown | bool | text | button (informational; the
  frontend already owns rendering).
- `description`: free text. The literal `Test` until content is authored.
- Optional later (NOT phase 1): min/max/step/unit/label, for eventual
  control generation. Tooltips need description lookup only.

Module kinds implementing the contract: input plugins, output plugins,
video-pipeline processing, audio-pipeline processing, zone runtime, app
shell. "Their own tooltip system" means their own descriptor *content*
through this one contract -- never separate per-module mechanisms.

## Ownership and namespaces

The module that consumes a setting owns its descriptor. Namespaces make
collisions structurally rare; shared concepts get exactly one owner
(`zones.active` belongs to the zone runtime even though two orchestrators
consume it). Known split case: `subsampleWidth` candidates derive from
the input plugin's resolution while semantics belong to video processing
-- processing owns the description; dynamic option lists stay on their
existing fetches and are out of scope for tooltips.

## Aggregation (backend)

Wherever a module registers routes, it also contributes descriptors
(Hue's `registerPairingRoutes` pattern generalized). The app shell
(`main.cpp`, both apps) owns a descriptor registry parallel to the
factory `Registry`. Registration order is deterministic -- core modules,
then input/output plugins, app shell last -- so the app can intentionally
specialize wording per platform (e.g. Linux sink-field text vs. Windows
static text under one `input.sink` key).

Collisions: last registration wins; the aggregator logs a one-line
stderr diagnostic naming key, loser, and winner. Never fatal -- tooltips
are advisory UI and must not affect boot. Rationale and full rule in
session notes 2026-09-18 (missing/collision handling discussion).

## Transport (backend to frontend)

New endpoint serving the merged descriptor set as JSON (NOT folded into
`/api/capabilities`, which is re-fetched at every stage probe;
descriptors are static per build). Fetched once per session, independently
of each screen's data fetches; never gates rendering; fails silent. An
old binary without the endpoint, or a failed fetch, yields exactly
today's UI with no tooltips.

## Frontend lookup

`getTooltip(key)` returns string-or-null. Null (unknown key, module
compiled out, fetch failed, blank description) renders the control
exactly as today with no hover binding -- no empty box, no placeholder,
no user-visible error. Unknown keys log a dev-only `console.warn`
(authoring feedback; typo detection), following the existing
log-don't-swallow precedent. Touch components touched once:
`sliderGroupHtml`/`wireSliderGroup`, `Dropdown`, `ZoneActiveToggleList`,
`DeviceField`, `EntertainmentConfigSelect`, `ZoneCanvas` gamma/active,
Tuning fixed-hue row. NUX coverage falls out free through the shared
components (`DeviceField`, `EntertainmentConfigSelect`, `ZoneCanvas`).

## Control-to-key inventory (today's Dashboard + NUX)

Tuning accordion (Dashboard only): `video.refreshRate`,
`video.subsampleWidth`, `video.interpolation`,
`video.transitionSmoothing`; `audio.bounceSmoothTime`,
`audio.brightnessSmoothTime`, `audio.driftBaseRateDegPerSec`,
`audio.vibrancySaturation`, `audio.vibrancyValue`,
`audio.fixedHueEnabled` (+ `audio.fixedAnchorHue`),
`audio.dynamismFloor`, `audio.centroidStrength`, `audio.referenceRms`,
`audio.brightnessFloor`, `audio.centroidRangeHz`.

Shared Dashboard + NUX: `input.monitor` / `input.sink` (top tier +
Mode+Device), `zones.gamma` + `zones.active` + `zones.select` picker
(zone accordion + Zone Mapping onboarding), `zones.autoArrange` (both),
`output.hue.entertainmentConfig` (Bridge + EZ-Select),
`zones.active` list (Bridge, now also audio mode).

Adjacent, include cheaply once plumbing exists: `app.mode` toggle,
Change-bridge navigation, sink/bridge-address text inputs. Stop needs no
explanation; skip it.

## Phasing (see Sequencing notes below for order and validation)

1. Core descriptor schema + aggregator with collision unit tests.
2. Per-module descriptor content (`Test` text) + endpoint wiring, both apps.
3. Frontend lookup + `title` wiring on the shared components.
4. Live verification (matrix below), then content authoring, then renderer
   revisit. Control generation explicitly out of scope.
