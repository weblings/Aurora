# Aurora Output: Hue

Philips Hue entertainment-streaming output plugin for [Aurora](../Aurora) —
implements `Aurora::Output::IOutput`.

Distilled from [huenicorn](https://gitlab.com/openjowelsofts/huenicorn)
(GPL-3.0), so this repo carries the same license forward — see `LICENSE`.

## Status

This pass ports and tests the pure logic only: HueStream wire-format
byte-packing, CIE xyY colorimetry, channel gamma/UV math, bridge-address
sanitizing, and credential byte-conversion. The I/O layer (bridge REST API,
entertainment-config pairing, the actual DTLS stream) is analyzed but not yet
ported — see [`Aurora/Analysis/HueOutputAnalysis.md`](../Aurora/Analysis/HueOutputAnalysis.md).

## Building

Depends on Aurora core (`Contracts`, the `Output` interface), currently
resolved via a local sibling-directory path in `CMakeLists.txt` — expects
this repo to sit next to `Aurora/` on disk, same as it does in this checkout.

```
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
```
