# Hue::Api / Auth / Stream — Conversion analysis

**Sources:** `huenicorn/include/Huenicorn/Hue/**`, `huenicorn/src/Hue/**`,
`huenicorn/include/Huenicorn/Stream/**`, `huenicorn/src/Stream/**`

## What each piece currently does

| File | Role | Pure or I/O-bound? |
|---|---|---|
| `Channel.hpp/cpp` | Channel state, UV zone, `gammaFactor`/`gammaExponent()`. Already analyzed in `FirstScan.md`/`ModuleSplitPlan.md`. | Pure |
| `Color::toXYB()` (in huenicorn's `Imaging::Color`, not ported to `Contracts`) | CIE xyY conversion — Hue's own colorimetry. | Pure |
| `BridgeAddress.hpp/cpp` | `sanitizeBridgeAddress()` — strips protocol/trailing slashes from a user-typed bridge address. | Pure |
| `Credentials.hpp/cpp` | Username/clientkey storage + `usernameBytes()`/`clientkeyBytes()` (hex→bytes) for DTLS auth. | Pure (the byte conversion) / the credentials themselves are obtained via I/O (`registerNewUser`) |
| `HuestreamHeader.hpp/cpp`, `HuestreamPayload.hpp` | The HueStream v2 binary wire format — magic bytes, colorspace flag, 36-byte config ID, per-channel 16-bit RGB fields. | Pure (byte-packing) |
| `Device.hpp`, `EntertainmentConfiguration.hpp` | Plain data structs (id/name; name+devices+channels). | Pure (no logic) |
| `ApiTools.hpp/cpp` | REST calls to the Hue bridge: load entertainment configs/devices/channels, set/query streaming state, bridge auto-discovery, new-user registration. | **I/O** — every function is an HTTP request |
| `EntertainmentConfigurationSelector.hpp/cpp` | Orchestrates `ApiTools` calls to load configs and select/activate one. | **I/O** — wraps `ApiTools` |
| `Streamer.hpp/cpp`, `DtlsClient.hpp` | Builds the HueStream binary buffer and pushes it over DTLS to the bridge on port 2100. | **I/O** — real network socket |
| `Network::Http::Client` | Thin wrapper returning JSON from an HTTP(S) request. **Not yet analyzed or ported at all** — a whole separate dependency this section relies on. | **I/O** |

## A security-relevant constraint worth carrying forward explicitly

`Network::Http::Client.hpp`'s own doc comment: *"the related implementations
must disable SSL verification for both peer and host [...] this HTTP client
should not be trusted for any other use."* Hue bridges use self-signed certs,
so this is a deliberate, correct tradeoff for talking to a Hue bridge
specifically — but it means this client must never get reused for anything
else (a future non-Hue REST target, or even `discovery.meethue.com` in a
context expecting real cert validation) without a hard second look. Recording
this now so it doesn't get carried forward silently when `Network::Http::Client`
itself gets ported.

## Scope decision for this pass

Same split as `ProcessingAnalysis.md`: port and test everything pure now;
everything I/O-bound needs a live bridge (and, for `ApiTools`/`Streamer`, a
`Network::Http::Client` port that doesn't exist in Aurora yet) — genuinely a
separate, larger effort, not shrunk to fit this pass. Deferred, not skipped:
`ApiTools`, `EntertainmentConfigurationSelector`, `Streamer`/`DtlsClient`,
`Network::Http::Client`.

---
*Follow-up build record moved to [log/2026-09-13-hue-io-layer-followup.md](log/2026-09-13-hue-io-layer-followup.md) — not repeated here.*
