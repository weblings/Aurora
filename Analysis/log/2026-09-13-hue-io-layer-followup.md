# Hue follow-up: I/O layer (2026-09-13)

Moved out of HueOutputAnalysis.md — HueOutputAnalysis.md — the analysis keeps the design, this file keeps the follow-up build record.

---

# Follow-up pass: the I/O layer deferred above

Full read of `Network::Http::Client` (`Client.hpp`/`CurlClient.cpp`),
`Stream::DtlsClient`/`DtlsConfig` + its MbedTLS impl, `Stream::Streamer`,
`Hue::Api::ApiTools`, `Hue::Api::EntertainmentConfigurationSelector`,
`EntertainmentConfiguration.hpp`, `Device.hpp`. This is the biggest single
piece ported so far — two new heavy native dependencies, five REST
endpoints, and a real DTLS-PSK handshake — so it's staged rather than done
in one pass, same reasoning that split X11 from Pipewire.

## New native dependencies

- **libcurl** (`libcurl4-openssl-dev` on Debian/Ubuntu) — `Network::Http::Client`
  is a thin wrapper around `curl_easy_*`. Needed by `ApiTools` and nothing else.
- **Mbed TLS** (`libmbedtls-dev`) — `Stream::DtlsClient`'s only implementation.
  Note huenicorn itself branches on `MBEDTLS_VERSION_MAJOR` (3 vs. 4, separate
  impl headers) — worth checking which major version Ubuntu's package
  provides before assuming either branch compiles as-is.
- **nlohmann_json** — `Aurora-Output-Hue` needs its own declaration of this
  (Aurora core's own use of it, added for `Runtime`, is a private
  implementation detail that doesn't propagate to consuming plugins).

## What each piece needs, and what's genuinely pure inside it

| Piece | Depends on | Pure sub-logic worth extracting |
|---|---|---|
| `Network::Http::Client` | libcurl | None — it's the I/O primitive everything else calls. |
| `ApiTools::matchDevices` | nothing (already pure) | The whole function — `std::copy_if` over a members-id set, ports and tests verbatim. |
| `ApiTools::load*` (configurations/devices/channels) | HTTP client, JSON | **The JSON→struct shape-mapping**, once separated from the `sendRequest` call around it — e.g. "given this bridge's `/clip/v2/resource` JSON, extract the entertainment devices" is a pure function of a `Json` blob, testable with a canned fixture string, no live bridge needed. This wasn't separable in huenicorn (the parsing is inlined right after each `sendRequest` call) — splitting it is new value from this port, not just a mechanical copy. |
| `ApiTools::setStreamingState`/`streamingActive`/`autodetectedBridge`/`registerNewUser` | HTTP client, JSON | Request URL/body construction is pure and testable (given known inputs, assert the URL string and JSON body); the actual `sendRequest` call stays I/O. |
| `EntertainmentConfigurationSelector` | `ApiTools` | `validSelection()`/`currentEntertainmentConfigurationId()` are pure given the selector's current state; `selectEntertainmentConfiguration()` itself calls out live (fetch + activate). |
| `Stream::DtlsClient` | Mbed TLS | Nothing — a real PSK-DTLS handshake and socket, inherently I/O. |
| `Stream::Streamer` | `DtlsClient`, already-ported `HuestreamHeader`/`HuestreamPayload` | The buffer-building loop (header bytes + one `HuestreamPayload` per channel) is pure given a `ChannelStreams` list — same shape as `HuestreamHeader`'s own byte-packing tests already passing today, just not separated from the `send()` call in huenicorn's version. |

## A real behavioral note carried forward, not a bug

`ApiTools::loadEntertainmentConfigurations` does one HTTP request per device
to fetch its metadata (an N+1 pattern) — not a bug, Hue bridges are local
and unthrottled, but worth documenting rather than silently replicating
without comment, in case it ever needs revisiting for a bridge with many
lights. `Network::Http::Client`'s hard-coded 1-second total request timeout
(`CURLOPT_TIMEOUT, 1`) is similarly aggressive but ported as-is — a real
tunable worth reconsidering later, not silently changed now.

## Bugs found while porting

**`ApiTools::loadEntertainmentConfigurations`'s per-device fetch used
`.value()` unconditionally** on a request that can fail (`sendHttpRequest`
returns `std::nullopt` on any transport failure) — a single transient
failure fetching one device's display name would throw
`std::bad_optional_access` and abort loading every entertainment
configuration, not just skip that device's name. **Fix:** check
`has_value()`; on failure, that device just keeps an empty name.

**`EntertainmentConfigurationSelector`'s dangling-iterator risk.**
huenicorn computes `m_currentEntertainmentConfiguration` from the (empty,
default-constructed) map via an in-class default member initializer, then
reassigns the map's real contents afterward in the constructor body.
Reassigning a `std::unordered_map` invalidates all of its prior iterators,
including `end()` — so that iterator is left dangling by the standard's
rules the moment the real data loads, even though it happens to keep
comparing correctly on libstdc++ (whose `end()` sentinel is stable across
rehashing in practice, but that's an implementation detail, not a
guarantee). **Fix:** load the map in the constructor's member-init list
instead of the body — member initializers run in declaration order, so by
the time `end()` is taken for the current-selection iterator,
`m_entertainmentConfigurations` already holds its final contents. No
behavior change when it happened to work; removes a real UB dependency.

## Concrete port plan (staged) — all five steps done and verified

1. **`Network::Http::Client`** → `HttpClient`. Mechanical port, builds
   against real `libcurl` (8.18.0).
2. **`ApiTools`** — five pure JSON-shape-parsing functions extracted and
   tested against canned fixtures (`parseEntertainmentConfigurationShell`,
   `parseLightName`, `parseDevicesFromResource`,
   `parseEntertainmentConfigurationsChannels`, `matchDevices`); the seven
   HTTP-calling wrappers ported mechanically (need a live bridge to verify
   end-to-end, same category as `X11Grabber`). Two real bugs found and
   fixed (see above; also logged in `UpstreamFindings.md`).
3. **`EntertainmentConfigurationSelector`** — mechanical port, with the
   dangling-iterator fix above.
4. **`Stream::DtlsClient` + `Streamer`** → `DtlsClient`/`MbedTlsImpl`/
   `Streamer`. Builds against real Mbed TLS (3.6.5) — only the v3 API is
   ported (huenicorn's v4 branch isn't carried over, since it can't be
   verified in this environment). `buildStreamRequest` (header + one
   payload per channel) pulled out and tested independent of the actual
   `send()` call, as planned.
5. **`HueOutput : IOutput`** — wraps `Streamer` +
   `EntertainmentConfigurationSelector`. `zoneIds()` returns the selected
   entertainment configuration's live channel IDs. `send()` converts each
   zone's already-smoothed RGB `Contracts::Zone` to XYB and gamma-corrects
   the brightness component (`toChannelStream`, pure and tested) — using
   `zone.gamma`, not a per-channel value looked up from the bridge (see the
   gamma-storage decision below, resolved before this step was written).
   Also tracks which zones were streamed last tick so one dropping out of
   the current `Frame` gets exactly one final zero-color entry before being
   dropped from the stream (`justDeactivatedZoneIds`, pure and tested) —
   the generalized replacement for huenicorn's `Channel::State::PendingShutdown`
   one-shot-then-drop behavior, since Aurora's generic `Runtime::ZoneMap`
   doesn't carry that state machine itself.

**Result: 22/22 `Aurora-Output-Hue` tests passing** (10 pre-existing + 5
`ApiTools` + 2 `Streamer` + 5 `HueOutput`). Rebuilt `Aurora` core (24/24)
and `Aurora-Input-Linux` (11/11) against the `Contracts::Zone` change below
to confirm neither was broken.

## Where does a zone's gamma value actually live? (resolved)

Writing `HueOutput::send()` surfaced a real gap: `Runtime::ZoneMap`
(`{zoneId, uvs, active}`) had no gamma field, reasoned at the time as
"Hue-specific, belongs in the Output plugin." But the bridge's REST API
never returns gamma either — it's a value the user configures locally,
persisted in the profile file (`Runtime::ZoneMap`'s job) and merged back in
on load, exactly like `uvs`/`active`. There was nowhere for it to actually
live.

**Decided:** gamma is generic enough for Core to own after all (DMX and
other lighting protocols want the same brightness-curve correction per
zone, not just Hue) — added `gamma` to `Runtime::ZoneConfig` and
`Contracts::Zone` alike, threaded unchanged through `composeFrame`
(zone map → Frame) and `Smoother` (eased color, untouched gamma) so it
reaches `IOutput::send()` on the `Frame` itself. This avoids the
alternative (`IOutput` reading `Runtime::ZoneMap` directly), which would
have created a circular module dependency — `Runtime` already depends on
`Output` (`Orchestrator` needs `IOutput`), so `Output` depending back on
`Runtime` isn't buildable. Extracted `Channel::gammaExponent()`'s formula
into a free function so `HueOutput` can apply it to a raw `zone.gamma`
value without needing a `Channel` object populated with real bridge data
that was never going to carry the user's gamma setting anyway.

**Ported and tested this pass:** `toXYB()` (as a free function, not a `Color`
method — see `ModuleSplitPlan.md`'s gamma decision), `Channel`'s pure
UV/gamma logic, `HuestreamHeader`/`HuestreamPayload` byte-packing,
`sanitizeBridgeAddress()`, `Credentials`'s byte-conversion helpers.

## A naming/placement correction found while doing this

`ModuleSplitPlan.md` called the Processing→Output contract type
`Processing::Frame`. On reflection, doing the actual port: it belongs in
**`Contracts`**, not `Processing` — it's a boundary type Output consumes and
Processing produces, exactly the same relationship `ImageData` has to
Input/Processing. Named `Contracts::Frame`/`Contracts::Zone` instead. Recorded
back into `ModuleSplitPlan.md`.

`Zone.color` carries **generic linear color** (`Contracts::Color`), not a
pre-transformed value — `toXYB()` runs inside `Output::Hue`'s own `send()`,
per zone, using that output's own stored `gammaFactor` for the zone (gamma is
Output-owned config now, not part of the per-tick `Frame` itself).

## Output files

```
Aurora/core/Contracts/include/Aurora/Contracts/Frame.hpp   (Frame/Zone)
Aurora/core/Output/IOutput.hpp
Aurora/core/Output/Hue/include/Aurora/Output/Hue/*.hpp     (Colorimetry, Channel,
                                                              HuestreamHeader,
                                                              HuestreamPayload,
                                                              BridgeAddress, Credentials)
Aurora/core/Output/Hue/src/*.cpp
Aurora/core/tests/HueOutputTests.cpp
```
