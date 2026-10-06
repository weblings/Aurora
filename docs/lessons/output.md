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

---

## A cloud discovery service resolves the real world, never a localhost stub -- a dev-mode fake must replace discovery results, not merge into them
Tags: output, hue, discovery, dev-fake
Applies-when: faking bridge discovery for bridgeless development

With the tier-1 fake running on localhost, NUX "checking" asked discovery.meethue.com, which returned the real LAN bridge (.154) -- pairing then registered against it while the console "button press" went to the fake, and Continue silently never advanced (the 101 wait-state re-render, by design). Merging the fake into cloud results would still be wrong: two bridges drops the NUX to the entry form instead of auto-advancing to pairing.

**Fix:** when `AURORA_DEV_FAKE_HUE` is set, `/api/hue/discover` returns only the fake (address precedence: flag value > `AURORA_HUE_BRIDGE_ADDRESS` > default `127.0.0.1:18443`); unset is the production path byte-for-byte. General principle: substitute the discovery source in dev mode rather than unioning it -- a union preserves the real world's ambiguity while adding a fake entry nobody asked to choose between.

**Restated live, the hard way (`Aurora-zx4`):** this var was documented right here, and still got missed -- launching the fake-lights-viz recipe on Mac, `AURORA_HUE_BRIDGE_ADDRESS`/`_USERNAME`/`_CLIENTKEY` were set by hand (enough for `registerOutputs()`'s own backend fallback to work), but `AURORA_DEV_FAKE_HUE` wasn't, because `app/mac` had no `--fake-hue` flag to set it automatically the way `app/linux` does -- only `app/linux/include/Aurora/App/FakeHue.hpp` existed. The backend pipeline ran fine; the WebUI's own discovery step stayed stuck, since it's gated on this var specifically, not the bridge-address one. Now fixed at the source: `FakeHue.hpp` ported to `app/mac`/`app/windows` too, so `--fake-hue` sets all five vars (this one included) identically on every platform -- see `docs/log/2026-09-28-fake-hue-flag-portability.md`.

---

## Saved Hue credentials silently beat `AURORA_HUE_*` env vars -- a stale pairing streams empty frames at full rate
Tags: output, hue, dev-fake, credentials, env
Applies-when: pointing a dev run at the fake bridge (or any bridge) via env vars

`registerOutputs()` loads `CredentialsStore` first and only falls back to `AURORA_HUE_*` when nothing is saved ([main.cpp:149-167](../../app/linux/src/main.cpp#L149-L167)). A Linux box with an old real-bridge pairing in `~/.config/aurora/hue-credentials.json` ignored `AURORA_HUE_BRIDGE_ADDRESS=127.0.0.1:18443` entirely: config selection failed, `zoneIds()` came back empty, `profiles/hue.json` was rewritten to `[]`, and the DevLightTap streamed `{"zones":[]}` at 60 fps -- every liveness signal green, zero content. Same trap inside a `--fresh` run: pairing through the WebUI writes credentials that then beat the env var's config id (picked `conf-office`, 1 channel, over `conf-living-room`).

**Fix:** run fake-bridge sessions with `--fresh` and don't pair through the WebUI mid-run; check `profiles/hue.json` / zone count before trusting output. General principle: when a persisted store outranks env vars, an env-var dev override is a request, not a guarantee -- verify the effective source.

---

## A platform stub that compiles to a no-op is indistinguishable from a healthy idle pipeline -- grep the `_WIN32` branch before debugging downstream
Tags: output, dev-tap, windows, stub, light-viz
Applies-when: a dev tool (light-viz relay, frame dump) shows "waiting for frames" while every other liveness signal is green

`DevLightTap` had a real POSIX body and a `#else` branch on Windows with empty constructor/`publish()` -- fine while Linux/Mac were the only targets, invisible once someone ran the light-viz recipe on Windows. Symptoms: the fake bridge logged `stream conf-room-4zone -> active`, `/api/hue/channels` listed 4 channels, `hue` was registered, the relay listened and the app burned CPU at full frame rate -- and the relay's SSE stayed silent. Hours of "is it pairing? the zone map? the config id?" were spent on the wrong layer; the only tell was `AURORA_DEV_LIGHT_TAP` being read nowhere in the Windows build. `DevFrameDump` (`AURORA_DEV_FRAME_DUMP`) had the identical stub and got the same port (`Aurora-gj0.11`).

**Fix:** implemented the Winsock twin (`WSAStartup`/`SOCKET`/`ioctlsocket(FIONBIO)`/`closesocket`); the member became `std::intptr_t` because a Win64 `SOCKET` doesn't fit the POSIX `int`. General principle: when a dev tap is silent and everything upstream is green, grep for `#ifdef _WIN32`/`#ifndef _WIN32` around the emitter first -- and prefer a startup log line ("dev light tap: disabled on this platform") over a silent empty body, so the stub announces itself.

---

## Bridge-loader failure paths need fault injection -- a stalled endpoint on the threaded fake bridge reproduces curl timeouts
Tags: output, hue, testing, fake-bridge, huenicorn, timeouts
Applies-when: verifying how Hue API loading code (huenicorn's or Aurora's `ApiTools`) handles a failed or timed-out per-resource request

Upstream finding 7 in [[upstream-findings]] (`Aurora-h45.8`) needed one light
lookup to fail while the rest succeeded. `tools/fake-hue-bridge` serves the
right CLIP v2 endpoints but has no latency or failure knobs. A ~40-line
Python fake did it: `ThreadingHTTPServer`, a throwaway
`openssl req -x509 -nodes` cert (the client disables peer verification for
the self-signed bridge), and one `/light/<id>` handler that sleeps 3s, past
curl's 1s `CURLOPT_TIMEOUT`. It must be threaded, or the stall blocks the
next request. A driver linking the real `ApiTools.cpp` plus `CurlClient`,
`Logger`, `Channel` and the platform selector showed `develop` throwing
`bad_optional_access`. Tracing that throw upward found no catch between
`Runtime::start()` and `main`, so the real impact is termination at
startup, not the "aborted load" the write-up assumed.

**Fix:** for timeout/failure behavior, stall or error one endpoint in a
threaded fake instead of hoping for a flaky LAN. When sizing an uncaught
exception's impact, follow it to the first `catch` (or `main`) before
describing the symptom. `tools/fake-hue-bridge --stall-light <id>` now does
the stall (`tools/huenicorn-checks/hue.sh` uses it); the first fake was
scratch and got lost. Its entertainment configs also list `light_services`
now, which huenicorn's loader requires.

---

## Home Assistant's login flow accepts a LAN `host:port` client_id, and its refresh tokens only work with the client_id they were issued to
Tags: output, home-assistant, auth, oauth, indieauth
Applies-when: designing Aurora's Home Assistant login, or storing and refreshing HA tokens

The IndieAuth spec forbids IP-address hosts in a `client_id` except loopback.
HA's `components/auth/indieauth.py` says it allows "any internal network IP".
In practice it is more lenient than that: it calls `ip_address()` on the
whole netloc, so `192.168.1.5:8080` fails to parse, falls through as a
"domain name" and passes. A `redirect_uri` with the same scheme and
`host:port` as the `client_id` is accepted without fetching anything, and
plain `http://` is allowed. So Aurora can use its own WebUI URL as
`client_id` and redirect back to itself. The catch is in
`components/auth/__init__.py`: a refresh is rejected when its `client_id`
differs from the one the token was issued to. Opening the WebUI at
`127.0.0.1` one day and at the LAN IP the next would break refreshes.
Normal refresh tokens expire 90 days after last use, so a running client
never hits that expiry. Read from core `f66cbe4`; not yet run against a live
HA.

**Fix:** store the `client_id` alongside the refresh token and always refresh
with it. Don't rebuild it from whatever URL the browser is using now.
Confirm against a real HA (Docker) before relying on the netloc leniency,
which is an implementation accident, not documented behavior.

---

## Home Assistant's WebSocket `call_service` replies only after the service finishes, and HA disconnects clients that read replies slowly
Tags: output, home-assistant, websocket, rate-limiting, backpressure
Applies-when: designing a sender, rate limiter or reader thread for the Home Assistant output

`websocket_api/commands.py` runs `call_service` with `blocking=True`, so the
result message arrives only once the light's service call has completed.
That reply is a free per-light "command done" signal: no `state_changed`
subscription is needed to keep one command in flight per light. The flip
side is in `websocket_api/http.py`: HA cancels the connection at 4096 queued
outgoing messages, or when the queue stays above 1024 for 10s. Every command
produces a reply, so a client that sends fast but drains its socket slowly
gets disconnected. HA also closes the socket if `auth` isn't sent within 10s
of connecting.

**Fix:** run a dedicated reader thread that always drains replies, separate
from the sender. Gate each light on its previous command's reply (matched by
message id). Send `auth` immediately after connecting.

---

## Re-running Hue pairing to "peek" at the app key mints a brand-new, unrelated bridge user
Tags: output, hue, credentials, pairing, testing
Applies-when: a script or test needs the real `hue-application-key` Aurora is already streaming with

A bridge-side verification script for Aurora-jwcd needed the
`hue-application-key` Aurora's running session uses, which
`GET /api/hue/connection` deliberately withholds (see this file's
resource-id entry and `PairingRoutes.cpp`). The first instinct -- "re-run
pairing to see it once" -- is wrong: the bridge's `POST /api/0`
registration (`ApiTools::registerNewUser`) always mints a fresh
username/clientkey pair; it can't hand back a credential that already
exists. Every call the script made with that fresh key got CLIP v2's
`403` (an HTML "refused key" page, confirmed by web research, not a JSON
error), while Aurora's own, separately-stored session kept streaming
correctly the whole time -- two valid-looking but entirely unrelated
credentials, one working, one not, with no overlap between them.

**Fix:** read the real key straight from `CredentialsStore`'s file
(`<configRoot>/hue-credentials.json` -- `%APPDATA%\Aurora` on Windows,
`~/Library/Application Support/Aurora` on Mac, `~/.config/aurora` on
Linux), never by re-pairing. General principle: when a credential is
withheld from an API by design for security, "regenerate it" and "read the
existing one" are different operations with different results whenever
the underlying system treats registration as always-additive rather than
idempotent -- check which one a recovery method actually performs before
trusting its output.

---

## A Hue application key commonly starts with `-`, which breaks a naive `--flag value` CLI arg
Tags: output, hue, credentials, cli, argparse
Applies-when: writing a command-line tool that takes a Hue `username`/`hue-application-key` as a flag value

`tools/hue-pause-resume-check/pause_resume_check.py --hue-key -WwOi...`
failed with argparse's "expected one argument" -- not a bad value, a
parsing ambiguity. The real bridge-issued key begins with `-`, so the
space-separated form reads as two flags (`--hue-key` with no value,
followed by an unrecognized `-WwOi...` flag) rather than one flag and its
value. Nothing about the key is malformed; this is purely how `argparse`
(and most getopt-style parsers) resolve a bare leading-dash token.

**Fix:** accept the value via `--flag=value` (the `=` form bypasses the
ambiguity) or an env var, and say so in the tool's own `--help`/usage text
before anyone hits it. General principle: any CLI flag whose value is an
opaque bridge/API-issued token should be documented as accepting `=` or an
env var by default, since nothing guarantees such tokens won't start with
`-`.

---

## A dead Hue bridge cannot fail a pipeline resume — inject resume failures through the input config
Tags: output, hue, testing, resume, failure-injection
Applies-when: testing a failure path that needs `Pipeline::build` to throw, or injecting an output failure by killing the bridge

Aurora-n5ly's plan was "pause, kill the bridge, resume must fail". Live on Windows with the Ethernet unplugged, resume returned 200 `succeeded:true` in 6.3s (timeouts, then success): `loadEntertainmentConfigurations` returns an empty map without throwing when REST is unreachable, `HueOutput::init` ignores the selector's `false`, and the `Streamer` constructor swallows the DTLS failure per this file's `isConnected()` entry — while `PipelineHost::resume` only fails on a `Pipeline::build` throw. Complement, not duplicate, of the two existing entries: those cover a failure being invisible and success signals lying; this one covers a failure being *unproducable* through the output at all.

**Fix:** break the input side instead — set `activeInputName` to a bogus value on disk (`setRunning` reloads from disk on every resume) and restore after. Note the config has separate video/audio input keys, so breaking one leaves the other mode's resume green. Separate product gap, still open: a resume against a dead bridge reports running with no tray/log/Dashboard signal.

---

## Reproducing "No outputs available": an empty `activeOutputNames` does not do it; an unpaired output plus a host with no pipeline does
Tags: output, hue, testing, failure-injection, onboarding, reload
Applies-when: you need a held `reload` error (`No outputs available -- nothing to drive`) to test the banner, the onboarding gate or anything reading `/api/state` errors

Aurora-cj11's onboarding-gate check on the Mac. Setting `activeOutputNames: []` and reloading **succeeds** (the host runs with no output), so nothing fails. Moving `hue-credentials.json` aside with `activeOutputNames: ["hue"]` makes the build throw, but a reload on a *running* host still holds no error (the old pipeline is kept; see architecture-process.md's failed-reload entry). The error only appears when the host has no pipeline: launch it failed first (bogus `activeInputName` at startup), then fix the input and `POST /api/reload` with the credentials still missing. The running app also reads credentials at launch, so after restoring the file it kept failing until a relaunch.

**Fix:** recipe = back up `hue-credentials.json` and `config.json`, move credentials aside, set `nuxCompleted:false` and `activeOutputNames:["hue"]`, launch with a bogus input, fix the input, `POST /api/reload`; restore both files and relaunch. Verify the checksum of the credentials file after restoring.

