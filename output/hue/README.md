# Aurora Output: Hue

Philips Hue entertainment-streaming output plugin for [Aurora core](../../) —
implements `Aurora::Output::IOutput`.

Distilled from [huenicorn](https://gitlab.com/openjowelsofts/huenicorn)
(GPL-3.0), so this repo carries the same license forward — see `../../LICENSE`.

## Status

Full plugin: the pure logic (Huestream wire-format byte-packing, CIE xyY
colorimetry, channel gamma/UV math, bridge-address sanitizing, credential
byte-conversion and file persistence) plus the I/O layer -- bridge REST
over HTTPS (`HttpClient`, `ApiTools`: discovery, pairing, entertainment
configurations, devices, lights), entertainment-config selection, the
PSK-DTLS entertainment stream (`Streamer`, UDP 2100), the `HueOutput`
itself, and the daemon pairing routes (`PairingRoutes`, `/api/hue/*`).
The I/O half is one toggle (`AURORA_OUTPUT_HUE_ENABLE_IO`, default ON;
needs libcurl + Mbed TLS) -- a Hue plugin isn't useful with only one half
of it. Background analysis lives in
[`docs/HueOutputAnalysis.md`](../../docs/HueOutputAnalysis.md).

## Developing without a bridge

Pairing and NUX flows can be rehearsed with no physical lights via the
dev-only stub in `../../tools/fake-hue-bridge/` (see its README for the
copy-paste loop) plus the `AURORA_DEV_FAKE_HUE`-gated dev routes in
`src/PairingRoutes.cpp` (link-button passthrough, discover override),
covered by `tests/PairingRoutesTests.cpp`. Append `--fresh` to the app
binary for a guaranteed-empty config root. Production behavior with the
env var unset is unchanged.

## Building

Depends on Aurora core (`Contracts`, the `Output` interface), pulled in
via FetchContent pointed at this monorepo's own `core/` tree, and on
nlohmann_json (system copy or fetched automatically). The I/O sources
additionally need libcurl and Mbed TLS (2.28.x or 3.x).

```
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```

Full-app builds use the presets at the repo root (`linux-app`,
`windows-app` -- see [`docs/Building.md`](../../docs/Building.md)); the root
superbuild toggles this slice with `AURORA_ENABLE_OUTPUT_HUE`.
