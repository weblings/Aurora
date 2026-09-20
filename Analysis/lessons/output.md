# Output — streaming/protocol gotchas

Hue and any later DMX/Art-Net/sACN/OPC targets. See [`README.md`](README.md) for how
entries get routed here vs. elsewhere.

---

## A bridge having more than one entertainment configuration over the same lights is normal, not an edge case — "empty ID selects the only one" doesn't hold
Tags: output, hue, entertainment-config
Applies-when: selecting an entertainment configuration by default

`HueOutput`'s empty-`entertainmentConfigurationId` default picks
`m_entertainmentConfigurations.begin()` on an `unordered_map` — fine if a
bridge only ever has one. The first real bridge tested against had two
("TV" and "TV area"), both with 6 channels over the identical 6 physical
lights but different channel-to-light wiring — an entirely ordinary result
of setting up more than one entertainment area in the Hue app, not a
misconfigured test rig. `begin()`'s hash-order pick is silent and
consistent-per-build, not "the first one created" or "the only one" —
confirmed live by polling both configs' `/clip/v2/resource/
entertainment_configuration/<id>` while the app ran: one showed `status:
active`, the other stayed `inactive`, and it wasn't the one the hand-written
zone map was transcribed from.

**Fix:** added `AURORA_HUE_ENTERTAINMENT_CONFIG_ID` (optional env var, same
stopgap shape as `AURORA_HUE_BRIDGE_ADDRESS`/`_USERNAME`/`_CLIENTKEY`) so the
ambiguity is resolvable without a real picker UI. Once a UI exists (phase 3),
it needs to list all configurations and let the user choose, not assume a
bridge has exactly one.

---

## `DtlsClient`'s handshake failure is swallowed by design — a clean `HueOutput::init()` is not proof a connection exists
Tags: output, hue, dtls, connection
Applies-when: treating a clean init as proof of connection

`Streamer`'s constructor calls `m_dtlsClient->init()` inside a `try/catch`
that deliberately swallows any exception (matching huenicorn: "connection
failure is observable via `isConnected()`, caller decides whether to
retry"). Nothing upstream (`HueOutput::init()`, `Orchestrator::init()`,
`main()`) checks `isConnected()` today, so a full app run printing "Aurora
running" and streaming with no errors is consistent with *either* a working
DTLS session *or* a silently-failed handshake — the log output alone can't
tell them apart.

**Fix:** not changed (retry/surfacing logic is out of scope for this pass,
matching huenicorn) — but verifying a real run needs an explicit check
beyond "no exception thrown": call `isConnected()` directly, or check for a
real socket from the outside (`ss -u -a -n -p | grep <bridge>:2100` against
the running process). Worth revisiting once `Aurora core` gets a logger (see
`engineering-hygiene.md`'s note on that) — this is exactly the kind of
swallowed failure a log line would have surfaced immediately instead of
needing an external probe.

---

## A reference implementation's dead code can look exactly as legitimate as its live code during a port, unless every call site is actually traced
Tags: output, porting, dead-code, hue
Applies-when: porting reference code without tracing call sites

Real hardware comparison (photos of the Hue app's color wheel after a brief
run of each): huenicorn's lights landed vivid and saturated, Aurora's landed
pale and washed out on *every* light, not just one. Every layer that
seemed like the obvious suspect matched byte-for-byte between the two apps
once diffed: identical zone crop UV coordinates (confirmed against
huenicorn's live `profile.json`), identical crop→average color algorithm
(`cv::mean`; huenicorn's own `kMeans` path exists but has zero callers, and
at its hardcoded k=1 it's mathematically identical to a mean anyway),
identical RGB→XY chromaticity formula, identical brightness weights,
smoothing a confirmed no-op at `transitionSmoothing: 0`. The actual cause
was one level up: huenicorn's `Color::toXY()` — read during the original
port as "Hue's own colorimetry" and faithfully ported as
`Colorimetry::toXYB()` — has **zero call sites** anywhere in huenicorn's own
source. Its real live path (`HuenicornCore.cpp`'s streaming loop) sends raw
gamma-corrected RGB straight into the wire payload, and its
`HuestreamHeader::colorSpace` defaults to (and is never changed from) `0x00`
RGB mode. Aurora ported `toXYB()`, wired it into `HueOutput::send()`'s only
path, and defaulted its own header to `0x01` XYB mode — a real protocol
divergence, not a rounding difference. XYB mode requires the bridge to
gamut-map a manually-computed chromaticity point per bulb; a color even
slightly outside that bulb's real gamut gets pulled toward the gamut edge,
which desaturates broadly across content, not just at extremes. RGB mode
instead lets the bridge's own firmware do that conversion, which is
apparently more forgiving. A secondary bug rode along with it: gamma was
applied only to XYB's brightness component (`xyb.z`), never to chromaticity
(`x`/`y`) at all — invisible on 5 of the user's 6 zones (`gamma: 0.0` is a
no-op regardless of where it's applied) and easy to miss without the
protocol-level bug also being found.

**Fix:** switched `HueOutput::toChannelStream()` to RGB mode end-to-end —
gamma applied to the normalized RGB vector before sending (matching
huenicorn's `Channel::gammaExponent()` use exactly), header default flipped
to `ColorSpace::RGB`. `Colorimetry::toXYB()` itself was left in place (correct,
tested math, plausibly useful for a future selectable XY mode) but is no
longer called from the live path, with a comment explaining why — the
principle that caused this bug in the first place (dead code with a
plausible name being assumed live) applies just as much to leaving it
around uncommented. General principle: when porting from a reference
implementation, finding a pure function that *looks* like the right piece
(right name, right math, right domain) is not the same as confirming it's
actually on that reference's live call path — grep every call site in the
reference before trusting that a ported function's presence there implies
it's used there. A written analysis doc that says "ported and tested" can
still describe code nobody ever traced end-to-end.

**Follow-up, confirmed live:** the comparison that surfaced this was
actually run in audio-reactive mode, not screen-capture mode (see
`engineering-hygiene.md`'s entry on that mix-up) — but the fix applies
identically either way, since both `Orchestrator` and `AudioOrchestrator`
end up at the same `HueOutput::send()`. Retested in audio mode after the
fix: confirmed vibrant.

---

## A local success signal doesn't prove a shared external resource is actually in the state you think it's in
Tags: output, hue, verification, streaming
Applies-when: trusting local signals for bridge-side stream state

Distinct from this file's `isConnected()` entry above (that one's about a
*failure* being swallowed at connect time) — this one's about every local
signal reporting *success* while the bridge had already silently diverged.
Live-switching Video→Audio, `isConnected()` read `true` and
`AudioOrchestrator::update()` was computing genuinely different colors
every tick after the switch — every in-process signal said the pipeline was
healthy. The bulb had stopped responding anyway: `PipelineHost::reload()`
builds the new pipeline (new output, new bridge stream already started)
fully before tearing down the old one, and the old output's deferred
`shutdown()` sent an authoritative "stop streaming" REST call for the same
entertainment configuration, which the bridge accepted with no error.
`isConnected()` only reflects the local DTLS socket; it has no way to know
the bridge marked that configuration's session stopped moments later by a
completely different, already-superseded object.

**Fix:** confirmed by logging `setStreamingState()`'s actual HTTP response
(previously discarded entirely — `void`, no return value checked) rather
than trusting `isConnected()`, which let the exact stop call and its timing
show up directly. General principle: when a report is "everything looks
right on this side but the device doesn't respond," check whether some
*other*, possibly already-superseded code path could have since reset the
device's own state — a connected socket and correctly-computed data only
prove your own process's view is self-consistent, not that the external
system still agrees with it.

**Still open, pass 2:** the Dashboard's own live Video↔Audio mode toggle
was reported still not actually switching what the lights do, after the
fix above (`HueOutput::shutdown(isReplacement)` skipping the authoritative
stop on a replacement) had already shipped. Reading the code turned up a
second, independent place the same class of stop can originate:
`EntertainmentConfigurationSelector::selectEntertainmentConfiguration()`
sends its own `disableStreaming()` whenever the bridge reports the target
config already streaming — which it will, every time, on a mode-switch
reload, since the new instance's own `init()` runs before
`PipelineHost::reload()` tears down the old one. Not yet confirmed live
(no logging added yet, no bridge test run) — flagged here rather than
assumed, since "the fix already shipped" was exactly the trap the first
time. If this turns out to be the actual cause, it means fixing
`shutdown()` alone treated the symptom's most visible call site, not the
underlying rule ("never tell the bridge to stop a config another live
instance might still be depending on") everywhere that rule actually needs
enforcing.

---

## A Hue device exposes several different resource ids for the same physical light, and they are not interchangeable
Tags: output, hue, api, resource-ids
Applies-when: passing Hue resource ids to REST endpoints

An entertainment configuration's `channels[].members[].service.rid` is an
*entertainment*-service id; `/clip/v2/resource/light/{id}` (the REST
control endpoint Test Pulse and `parseLightSnapshot` use) only recognizes
*light*-service ids — a different id on the same physical device, sourced
from a different sibling entry in that device's own `services[]` array.
Passing the entertainment-rid straight to the light endpoint 404s with an
empty `data` array; the actual failure this produced was a `.at("data")
.at(0)` throwing uncaught out of an HTTP route handler, which cpp-httplib
turned into a non-JSON 500 the WebUI's own `fetch().json()` then reported
as "couldn't reach the daemon" — masking a request the daemon had actually
handled correctly (rejected it, just not in a way anything downstream
expected). The same mismatch independently broke
`loadEntertainmentConfigurations`'s own per-channel device matching
(comparing entertainment-rids against `light_services`-derived
placeholders, a *third*, unrelated id space for the same devices) — real
channel/light names silently never resolved on an actual bridge. Every
relevant unit test passed throughout, because their fixtures reused one
string for whichever ids a given test happened to need, never modeling
that a real device carries multiple, genuinely different ids at once.
Confirmed correct by reading huenicorn's own real `Runtime.cpp`, which
already resolves entertainment-rid → device via a bulk `loadDevices()` +
`matchDevices()` pass rather than ever comparing across these spaces
directly.

**Fix:** `Device` now carries both `id` (entertainment-rid, for channel-
membership matching) and `lightId` (light-rid, for REST control),
populated in one pass over `/clip/v2/resource`'s own `services[]` array;
every consumer resolves through `loadDevices()`/`matchDevices()` before
touching a resource-type-specific endpoint, never assuming one id works
for another resource type. General principle: when a real-world API models
one logical entity with several distinct resource ids for different
purposes, a test fixture that reuses the same string across all of them
to save typing can hide an id-space mixup indefinitely — write fixtures
with deliberately distinct ids per space the first time, even when nothing
about the parser under test appears to care which string it sees.

---

## A per-request HTTP handle turns every call in a reload burst into a full TLS setup — count the calls, then share the connection
Tags: output, hue, http, tls, performance
Applies-when: making burst REST calls with per-request handles

NUX's lingering Continue→Zone Mapping delay survived two earlier timing
investigations (both compared one PUT's duration against first-frame and
stopped there) because nobody counted what a reload actually sends:
`HueOutput::init` alone makes ~5 sequential bridge HTTPS calls
(entertainment-configs, resource, streamingActive, disable, start), and
Zone Mapping's channels fetch adds 2 more — and `sendHttpRequest()` built
a fresh `curl_easy_init` handle per call with no connection reuse, so all
~7 paid a full TCP+TLS setup each. Verified against a local counting HTTPS
server: 24 sequential requests opened 24 TCP connections before the fix, 1
after, with functional equivalence (method/body/header fidelity, no
cross-call leakage, same nullopt-on-failure contract) confirmed on both
binaries.

**Fix:** one CURL handle per calling thread (`thread_local`, safe for the
HTTP server's pool), `curl_easy_reset()` on every borrow with the full
option set re-applied per call. General principle: when a user-facing delay
is a burst of API calls, count the calls *and* price each one's transport
setup, not just its payload — a "fast" endpoint hit N times with N fresh
TLS handshakes is a slow operation wearing a fast one's name, and no
single-request timing comparison will ever surface it.
