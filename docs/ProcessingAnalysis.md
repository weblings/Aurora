# ImageProcessing / Color / Interpolation / ImageData / UV — Conversion analysis

**Sources:** `huenicorn/include/Huenicorn/Imaging/*.hpp`, `huenicorn/src/Imaging/*.cpp`

Starting the phase 1 port here, not with Input or Output. Reasoning: this section
is the one both future Input plugins (Windows, Spout/Syphon/NDI, ...) and future
Output plugins (DMX, ISF, ...) have to agree on — its shape *is* the
Input↔Processing↔Output contract from `ModuleSplitPlan.md`. Getting it stable and
tested first means every later module is built against something settled, not a
moving target. It's also the only piece that's pure/deterministic, so it's where
real automated tests actually pay off (per the tests discussion in
`ImplementationPlan.md`).

## What each piece currently does

| File | Role |
|---|---|
| `ImageData.hpp` | `cv::Mat` + `PixelFormat` enum (`RGB`/`RGBA`/`BGR`/`BGRA`) + `width()`/`height()`/`hasData()`. The frame contract Input produces and Processing consumes. |
| `UV.hpp` | `UV = glm::vec2`; `UVs{min, max}`, normalized 0–1 rectangle; `UVCorner` enum for authoring. Already the bounding-box shape identified as reusable for detections in `OpenFormatsResearch.md`. |
| `Color.hpp` | `uint8_t` r/g/b wrapper. `toNormalized()` (0–1 floats) and `brightness()` (perceptual-weighted 0–1) are generic. `toXYB()` (CIE xyY conversion) and `XYBBlack` are Hue's own colorimetry — confirmed again on this closer read, not generic. `GamutCoordinates`/`_sign()`/`_xyInGamut()` are dead code today: written, never called (`toXYB()`'s gamut-boundary check is commented out). |
| `Interpolation.hpp/cpp` | `Type` enum (`Nearest`/`Cubic`/`Area`) + a name↔type lookup map. Used by `ImageProcessing::rescale` *and* exposed through `CoreService::availableInterpolations()` to the setup WebUI as a dropdown — it's a shared vocabulary item, not internal Processing plumbing. |
| `ImageProcessing.hpp/cpp` | `rescale` (subsample via `cv::resize`, refuses to upscale), `rgbaToRgb` (alpha drop via `cv::cvtColor`), `getSubImage` (crop by `UVs`), `getDominantColor`/`Algorithms::mean` (average color of a region). The actual transform logic. |

## Two real findings from reading this closely (not just skimming)

**1. `Algorithms::mean()` ignores `PixelFormat` — confirmed exploitable, not just theoretical.**

```cpp
auto mean = cv::mean(imageData.imageMatrix);
return Color{
  static_cast<uint8_t>(mean[2]),  // assumes channel 0 is B
  static_cast<uint8_t>(mean[1]),
  static_cast<uint8_t>(mean[0])   // assumes channel 2 is R
};
```

`cv::mean` returns channel averages in whatever order the `cv::Mat` actually
stores them — it has no idea what "R" or "B" mean. This code unconditionally
assumes storage order is BGR/BGRA. Every grabber in huenicorn today happens to
tag its output `PixelFormat::BGR` (confirmed: `DummyGrabber` sets
`Imaging::PixelFormat::BGR` explicitly), so the bug has never fired — but the
`PixelFormat` tag exists and is checked exactly nowhere in this function. This
was flagged as a latent risk in `FirstScan.md`; reading the actual line
confirms it's real, not speculative. **Fixing now**, not deferring to phase 2 as
originally planned in `ImplementationPlan.md` — writing golden-value tests for
this function across all four `PixelFormat`s makes leaving the bug in place
actively harder than fixing it (a correct test suite can't assert the buggy
behavior on purpose). `ImplementationPlan.md` gets a note updating this.

**2. `rgbaToRgb` doesn't handle `BGRA` — a related, previously unflagged gap.**

```cpp
void rgbaToRgb(...) {
  cv::cvtColor(inputImageData.imageMatrix, outputImageData.imageMatrix, cv::COLOR_RGBA2RGB);
}
```

`cv::COLOR_RGBA2RGB` assumes the 4-channel input is actually laid out RGBA. The
only call site (`Runtime::_update()`) only invokes it when
`format == PixelFormat::RGBA`, so today it's guarded correctly — but there's no
equivalent path for `PixelFormat::BGRA`, which is exactly what DXGI Desktop
Duplication (phase 2's planned Windows capture API) and many Linux compositors
produce natively. A `BGRA` frame today just skips the alpha-drop step entirely
and flows through as 4-channel — not incorrect (once finding 1 is fixed,
`mean()` picks the right 3 of 4 channels regardless), but wasteful, and the
function's name/contract implicitly promises more format-awareness than it
has. Generalizing this alongside finding 1, since it's the same underlying gap
and touching the same code.

**3. `rescale()` and `getSubImage()` never set `outputImageData.format` — found while actually writing the port, not on the initial read.**

Neither function touches `.format` on its output; the field has no default
member initializer, so a freshly-constructed `ImageData` passed in as the
output leaves `.format` **uninitialized**. Confirmed this actually reaches a
real read in `Runtime::_update()`:

```cpp
Imaging::ImageData resized;
Imaging::ImageProcessing::rescale(m_frameData, resized, subsampleWidth, m_config.interpolation());
if(resized.hasData()){
  source = std::move(resized);          // source.format is now uninitialized
}
...
if(source.format == Imaging::PixelFormat::RGBA){ ... }   // reads it
```

Undefined behavior in the strict sense (reading an uninitialized enum), and in
practice likely harmless today only because every current grabber happens to
tag `BGR` and the garbage stack value rarely happens to equal `RGBA` by
chance — not something to rely on once a wider range of formats exist.
**Fixed during the port** by having both functions propagate
`outputImageData.format = inputImageData.format` (neither operation changes
pixel layout, only geometry, so the source format is always still correct).
Added to the test plan below.

## The architectural refinement this analysis surfaced

`ModuleSplitPlan.md` described three modules (Input/Processing/Output) but didn't
name where the *shared types* crossing their boundaries physically live. Reading
this section end to end makes the gap concrete: `ImageData`, `PixelFormat`, `UV`/
`UVs`, `Color` (its generic parts), and `Interpolation::Type` are all things
**Input produces or Output/config consumes, without depending on Processing's
logic at all**. If they lived inside a `Processing` library, every `IInput`
implementation would need to link against `Processing` just to know the shape of
the struct it fills in — a backwards dependency (edges depending on the thing
that consumes their output).

So this port introduces a fourth piece not previously named: **`Contracts`** — a
small library holding only the neutral shared types (no transform logic).
`Processing` becomes the logic library that depends on `Contracts` and
implements `ImageProcessing`'s functions (plus, later, new analyzers — motion,
detection, ISF-input mapping). `Input` implementations depend only on
`Contracts`. `Output` implementations depend on `Contracts` too, plus whatever
target-specific transform they need — which is also why `Color::toXYB()`
doesn't need to survive as a *method on* `Color` at all once it moves to
`Output/Hue/`: it becomes a free function there taking a `Contracts::Color` and
returning Hue's xyY value. `Color` itself stops knowing Hue exists, structurally,
not just by convention. Recorded back into `ModuleSplitPlan.md`.

## What maps directly vs. what needs rework

| Item | Action |
|---|---|
| `ImageData`, `PixelFormat` | Port as-is into `Contracts`. No logic changes. |
| `UV`, `UVs`, `UVCorner` | Port as-is into `Contracts`. |
| `Color`'s `toNormalized()`/`brightness()`, raw r/g/b | Port into `Contracts`. |
| `Color::toXYB()`, `XYBBlack`, `GamutCoordinates`/`_sign()`/`_xyInGamut()` | **Do not port here.** Moves to `Output/Hue/` in the Hue-output port, as a free function — not ported as dead code. |
| `Interpolation::Type`, `availableInterpolations` | Port as-is into `Contracts` (shared vocabulary, needed by config/UI later same as today). |
| `ImageProcessing::rescale`, `getSubImage` | Port into `Processing` with the `.format` propagation fix (finding 3) — otherwise no behavior change. |
| `ImageProcessing::rgbaToRgb` | Port with the `BGRA` case added (finding 2) — generalize to something like `dropAlpha(ImageData, ImageData)` that branches on format. |
| `ImageProcessing::getDominantColor`/`Algorithms::mean` | Port with the `PixelFormat` fix (finding 1) — switch on format instead of hardcoding BGR-order indices. |

## Test plan

No existing usable tests to build on here (see the `tests/` findings already in
`ImplementationPlan.md` — both CMake test targets are stale/non-building). New
Catch2 suite, fixtures generated in-code (no checked-in binary images needed —
these are small synthetic `cv::Mat`s, e.g. solid colors and 2×2 quadrants):

- `rescale`: output dimensions match the requested width at the source aspect
  ratio; refuses to upscale (`outputWidth > sourceWidth` returns unchanged, per
  current documented behavior); spot-check each `Interpolation::Type` doesn't
  crash/produces the right size (not pixel-exact — interpolation kernels are
  OpenCV's to trust, not ours to pin); **output `.format` equals input
  `.format`** — the regression test for finding 3.
- `getSubImage`: a known `UVs` rectangle on a synthetic multi-quadrant image
  crops exactly the expected pixels; boundary clamping at `{0,0}`–`{1,1}`;
  same output-`.format`-propagation assertion as `rescale` (finding 3).
- `dropAlpha` (renamed `rgbaToRgb`): both `RGBA→RGB` and `BGRA→BGR` preserve
  the right channel values (this is the regression test for finding 2).
- `getDominantColor`/`mean`: **the regression test for finding 1** — build the
  same solid-color image tagged as each of the four `PixelFormat`s in turn and
  assert the returned `Color`'s r/g/b is correct for every tag, not just the
  `BGR` case that happened to always be exercised before.
- `Color::toNormalized()`/`brightness()`: known r/g/b in, known values out
  (pure arithmetic, exact assertions).

## Output files

```
Aurora/core/Contracts/
  include/Aurora/Contracts/ImageData.hpp
  include/Aurora/Contracts/UV.hpp
  include/Aurora/Contracts/Color.hpp
  include/Aurora/Contracts/Interpolation.hpp
  src/Interpolation.cpp
  CMakeLists.txt
Aurora/core/Processing/
  include/Aurora/Processing/ImageProcessing.hpp
  src/ImageProcessing.cpp
  CMakeLists.txt
Aurora/core/tests/
  ProcessingTests.cpp
  CMakeLists.txt
```
