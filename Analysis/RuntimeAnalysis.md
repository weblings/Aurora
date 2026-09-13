# Runtime / Config — Conversion analysis

**Sources:** `huenicorn/include/Huenicorn/Core/{Runtime,CoreService,Config}.hpp`,
`huenicorn/src/Core/{Runtime,CoreService,Config}.cpp`,
`huenicorn/include/Huenicorn/Serialization/{Config,Channel}.hpp`.

## What Runtime actually orchestrates

`Runtime::start()` is the entire app lifecycle in one method:

1. `CoreService::ensureInitialSetup()` — if `Config` is missing required fields
   (bridge address, credentials), spins up a one-shot setup web server and
   blocks until the user completes it through a browser.
2. `_initGrabber()` — asks `Platform::adapter` for a grabber (this is the
   session-dispatch logic `SessionDispatch` already extracted and tested).
3. `_initSettings()` — fills in `refreshRate`/`subsampleWidth` from the
   display if unset, selects an `EntertainmentConfigurationSelector`, then
   `_enableEntertainmentConfiguration()` using whatever
   `entertainmentConfigurationId` the saved profile names (empty string if
   there isn't one — `selectEntertainmentConfiguration("")` presumably picks
   a default/first).
4. `_initWebUI()` — starts the persistent management REST server
   (`CoreService` is its command surface), auto-opening a browser only if
   there's no saved profile yet (first-run UX).
5. `_startStreamingLoop()` — a plain `while(m_keepLooping)` loop calling
   `_update()` at `Config::refreshRate()` Hz via `LoopRegulator`, until
   `stop()` flips the flag; then `_shutdown()` disables bridge streaming and
   joins the web server thread.

## The per-frame pipeline (`_update()`)

This is the part every module ported so far (Input, Processing, Output-Hue)
already exists to serve — Runtime is just the glue that calls them in order:

1. `grabber->grabFrameSubsample()` → skip the tick entirely if no frame yet
   (async grabbers, e.g. Pipewire, can lag behind the loop's rate).
2. `ImageProcessing::rescale()` to `subsampleWidth` if the raw frame is wider.
3. `ImageProcessing::rgbaToRgb()` if the source is RGBA (matches Aurora's
   already-generalized `dropAlpha()`).
4. **Per channel:** skip if `Inactive`; if `PendingShutdown`, zero the stream
   entry once and stop; otherwise `getSubImage()` by the channel's `uvs`,
   `getDominantColor()`, convert to XYB, optionally ease toward the previous
   XYB value by `transitionSmoothing` (skipped entirely if `0`, reproducing
   pre-smoothing behavior exactly), then gamma-correct just the `z`
   (brightness) component by `channel.gammaExponent()`.
5. Push all channel stream entries to `Streamer::streamChannels()` under a
   mutex (the mutex exists because `_enableEntertainmentConfiguration()` can
   replace `m_streamer` from the web UI thread mid-loop).

Nothing here is new logic — it's the exact sequence Aurora's already-ported
pieces (`IInput::grabFrameSubsample`, `Processing::rescale/getSubImage/
getDominantColor`, `Output::Hue::Channel::gammaExponent`, `toXYB`) were built
to be called in. Runtime's job is purely the per-tick orchestration + the
config that tells it *which* zones to crop and *how* to correct them.

## The two-file persistence split (answers the standing question)

Confirmed by tracing `profileName`/`profilePath()`/`getProfile()`/
`saveProfile()`: huenicorn does **not** keep one config file. `Config`
(`config.json`) holds only app-level settings — bridge address, credentials,
`profileName`, REST port, bound IP, refresh rate, subsample width,
interpolation type, transition smoothing, the Wayland restore token. It has
**no screen-mapping fields at all**.

The screen→light mapping lives in a second file named by `profileName`
(default `profile.json`), written by `CoreService::saveProfile()` as
`{entertainmentConfigurationId, channels: [{channelId, active, uvs,
gammaFactor, devices}, ...]}`.

**The reconciliation on load is the important part, not just the file
split.** `Runtime::_initChannels()` doesn't trust the saved profile as the
source of truth for *which channels exist* — every startup it re-fetches the
live entertainment configuration's channel list and device membership from
the bridge (`ApiTools::loadDevices`/`loadEntertainmentConfigurationsChannels`/
`matchDevices`), then walks the saved profile only to recover `active`/`uvs`/
`gammaFactor` per channel, matched by ID. A channel present on the bridge but
missing from the saved profile silently comes back `Inactive` with no
mapping. So "the profile" is really a UV/active/gamma overlay on top of
authoritative, always-live device data — not a standalone save file that
fully describes the setup by itself.

(Minor asymmetry, not a bug: `Serialization::Channel.hpp` defines `to_json`
for `Channel`/`Channels` but no `from_json` — the read path in
`_initChannels()` pulls fields out of the parsed JSON by hand instead of
using the generic deserializer. Works correctly either way; just means the
serializer isn't actually round-trippable through `nlohmann::json`'s usual
`get<T>()`, only through this one handwritten loop.)

## `CoreService`: the REST-facing command surface

`CoreService` is a thin façade Runtime hands to `WebUIBackend` — every
setting the web UI can change (bridge address, credentials, entertainment
config selection, channel UV/gamma/activity, subsample width, refresh rate,
interpolation, transition smoothing) and every read it needs (available
entertainment configs, available interpolations, subsample candidates,
current channels) goes through here, not directly through `Config`/`Runtime`.
It's the natural seam for Aurora's own future REST/web control layer (phase
3+), but the state it wraps — Config settings, channel UV/active/gamma,
current entertainment-configuration-equivalent — is squarely Config/Runtime
scope now, independent of when a web layer gets built on top of it.

## The real architectural finding: `Hue::Api::Channel` conflates two concerns

`Channel` currently carries both:
- **Screen-mapping data** — `uvs`, `active` — which region of the screen
  feeds this zone. Nothing about this is Hue-specific.
- **Hue-specific data** — `gammaFactor`/`gammaExponent()`, `devices` (actual
  bridge light IDs), `previousXyb` (transition-smoothing state, kept in
  Hue's own XYB colorspace).

Aurora's `Contracts::Frame` (`std::vector<Zone{id, Color}>`, already ported)
is the **output** of a per-tick zone crop — but nothing in Aurora yet owns
the **input** to that step: which zone IDs exist and which screen UV rect
each maps to. Modeling that as Hue-specific (mirroring huenicorn's `Channel`
as-is) would be wrong the moment a second output plugin exists — a DMX
fixture or a browser preview needs the exact same "zone ID → screen UV rect,
active or not" concept, with completely different per-zone extras (a DMX
universe/address instead of gamma+bridge device IDs).

**Decided split for the Runtime/Config port** (design settled; not yet
implemented — same status the X11-vs-Wayland split had before being built):

- **Generic, Core-owned:** a zone map — `{zoneId, uvs, active}` — plus the
  crop/dominant-color loop that turns `IInput`'s frame into a `Contracts::Frame`
  by walking it. This is what actually replaces `_update()`'s middle section
  and belongs in Aurora core, not any plugin.
- **`IOutput`-owned:** which zone IDs exist right now (Hue: fetch the live
  entertainment configuration's channels; a future DMX plugin: fixture
  addresses from its own config) — mirrors `ApiTools::loadEntertainmentConfigurationsChannels`,
  needs an interface method like `zoneIds()` alongside the existing
  `init()`/`send()`. Also owns whatever per-zone correction its protocol
  needs (Hue: XYB conversion + gamma, applied inside `send()` on the
  already-generic `Frame` it receives) — gamma/colorspace has no business
  being generic.
- **Decided: `transitionSmoothing` lives in Runtime, in plain RGB.** Runtime
  keeps one persistent previous-color map, keyed by `(outputId, zoneId)` —
  per-output, not just per-zone, since two concurrent outputs could each
  define a "zone 1" with unrelated meanings once multiple outputs are active
  (see the per-plugin profile decision below). Eases toward the newly
  measured RGB color before handing the `Frame` to `IOutput::send()`; each
  output plugin converts/gamma-corrects whatever color it receives, already
  smoothed. **Consequence for already-ported code, done:**
  `Aurora-Output-Hue`'s `Channel::previousXyb`/`hasPreviousXyb` (ported from
  huenicorn's Hue-space smoothing state) were dead weight under this design —
  smoothing no longer happens in Output-Hue at all. Removed, along with the
  now-unused `<glm/vec3.hpp>`/`Colorimetry.hpp` includes their type pulled
  in; no test changes needed, since the existing state-transition test only
  ever covered the `State` enum. Rebuilt, 10/10 tests still passing.
- **Decided: one profile file per active output plugin**, not one shared
  file. Replaces huenicorn's single free-form `profileName` setting (which
  only ever needed to name one file) with a fixed convention instead of a
  user-configurable name — simpler, and avoids one plugin's profile
  clobbering another's: `<configRoot>/profiles/<outputPluginName>.json`,
  each holding that plugin's own zone map (`{zoneId, uvs, active}`, plus
  whatever plugin-specific extras it wants alongside — Hue: `gammaFactor`,
  no `previousXyb` per the smoothing decision above). `Config` drops
  `profileName()`/`setProfileName()` entirely; Runtime derives each active
  plugin's profile path from its name instead of a stored setting.

## What's testable here — built and verified

All five generic pieces below are built in `Aurora/core/Runtime` (target
`AuroraRuntime`) and tested in `core/tests/RuntimeTests.cpp`. **16/16 core
tests passing** (8 pre-existing Processing tests + 8 new). Also confirmed
`Aurora-Output-Hue` and `Aurora-Input-Linux` still build and pass their own
tests against this updated core (the `IOutput::zoneIds()` interface addition
doesn't break either, since neither has a concrete `IOutput` implementation
yet).

- **`Config`/`ConfigStore`** — generic app settings (`refreshRate`,
  `subsampleWidth`, `interpolation`, `transitionSmoothing`,
  `restServerPort`, `boundBackendIP`), matching huenicorn's own clamping
  (`refreshRate` ≥ 1, `transitionSmoothing` ∈ [0, 0.97]). Persists as
  `<configRoot>/config.json`, field-by-field defaulting so a partial or
  missing file loads sensibly rather than failing outright.
- **`ZoneMap`/`ZoneMapStore`** — the generic `{zoneId, uvs, active}` list,
  one JSON file per plugin at `<configRoot>/profiles/<pluginName>.json`,
  per the per-plugin-profile decision.
- **`reconcileZoneMap`** — saved zone map ∩ an output's live zone IDs, pure
  and tested: known IDs keep their saved `uvs`/`active`, new IDs default
  inactive, stale saved IDs (no longer live) are dropped. Same shape as
  `SessionDispatch`.
- **`composeFrame`** — the generic crop/dominant-color loop: given an
  already-prepped `Contracts::ImageData` and a `ZoneMap`, produces the
  `Contracts::Frame` an `IOutput` consumes. Inactive zones are omitted
  entirely (each plugin's own `send()` decides how to react to a zone
  disappearing — e.g. Hue's `PendingShutdown` one-final-zero-frame behavior
  stays inside Output-Hue's own `Channel` state machine, not duplicated
  here).
- **`Smoother`** — the RGB-space easing keyed by `(outputId, zoneId)`, per
  the smoothing-lives-in-Runtime decision. Tested: `0` reproduces instant
  behavior exactly, a zone's first-ever tick is never smoothed (no previous
  color to ease from, matching huenicorn's `hasPreviousXyb == false`
  behavior), and two outputs sharing zone id `1` stay independent.

**`IOutput` gained `zoneIds()`** (live zone discovery, feeding
`reconcileZoneMap`) — pure virtual, not yet implemented anywhere, since
Hue's live discovery needs `ApiTools`/`EntertainmentConfigurationSelector`,
still deferred.

## Scope decision for this pass

Built and tested the five generic, testable pieces above. **Deliberately
not built this pass:** the actual orchestrating lifecycle class (the
huenicorn-`Runtime`-equivalent setup flow, threading, main loop) — there's
no second real `IOutput` yet to wire it against (Hue's `ApiTools`/`Streamer`
are still deferred), so writing that shell now would sit on top of other
unverifiable code with nothing concrete to build/test against. When it is
built, it shouldn't be named `Runtime` given the `Aurora::Runtime` namespace
these pieces already live in (e.g. `Aurora::Runtime::Orchestrator` instead)
to avoid a class colliding with its own enclosing namespace's name.

## Follow-up pass: `Orchestrator` — built and tested against fakes

Built `Aurora::Runtime::Orchestrator`, the piece deferred above, plus a
small pure helper it needed:

- **`pickDefaultSubsampleWidth`** — ported huenicorn's inline
  `_initSettings()` search (smallest subsample candidate that's still
  ≥ 1% of the real display width) as its own pure, tested function.
- **`Orchestrator`** — ties one `Input::IInput&` to any number of
  `Output::IOutput*` per tick. Deliberately has **no threading/timing of
  its own**, unlike huenicorn's `Runtime` (no `LoopRegulator`, no
  `std::jthread`) — `update()` is a single synchronous tick a future real
  app entry point calls at `Config::refreshRate()`. This is what makes it
  testable at all: `init()` (fills in unset `refreshRate`/`subsampleWidth`
  from the display, reconciles + persists each output's zone map against
  its live `zoneIds()`) and `update()` (grab → rescale/`dropAlpha` →
  `composeFrame` → `Smoother` → `send()` per output, no-op if the input
  hasn't produced a frame yet) are both exercised with a `FakeInput`/
  `FakeOutput` test-only pair (`core/tests/OrchestratorTests.cpp`, same
  fake-fixture pattern as `Aurora-Input-Linux`'s `TestInput`) — no real
  display, bridge, or threading involved. This is the first proof that
  `Config`/`ZoneMap`/`reconcileZoneMap`/`composeFrame`/`Smoother`, so far
  only unit-tested in isolation, actually compose into a correct per-tick
  loop matching huenicorn's `_update()` semantics (confirmed with a
  synthetic split-color frame: two zones crop out the two known colors
  correctly even after a real rescale step in between).

**Result: 23/23 core tests passing** (8 Processing + 8 Runtime pieces + 3
`pickDefaultSubsampleWidth` + 4 `Orchestrator`). Rebuilt `Aurora-Output-Hue`
(10/10) and `Aurora-Input-Linux` (11/11) against this core too — both still
clean, since `Orchestrator`'s new dependency on `AuroraInputInterface`/
`AuroraOutputInterface` only affects `core/CMakeLists.txt`'s
`add_subdirectory` ordering (`Runtime` now added last, after `Input`/
`Output`), not either interface's own shape.

**Still not built:** a real app entry point that constructs a real
`IInput`/`IOutput` pair, calls `Orchestrator::init()` once, and drives
`update()` in an actual timed loop — that's `Aurora-Output-Hue`'s I/O layer
plus a small `main()`, not `Orchestrator` itself.
