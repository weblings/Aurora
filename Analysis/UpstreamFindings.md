# Findings worth upstreaming to huenicorn

Three bugs found while reading/porting `ImageProcessing` into Aurora's
`Processing` module (see `ProcessingAnalysis.md`), all present in huenicorn's
own code today, independent of anything Aurora-specific. Checked against
huenicorn commit `ede353ac329ba1922d354aae89adf5fe6ddb03f5` (2026-08-23). Kept
here in PR/issue-ready form in case it's worth sending upstream later —
citations are against huenicorn's own paths, not Aurora's.

None of these have an observable symptom in huenicorn *today*, which is exactly
why they went unnoticed — see each entry's "why it hasn't fired" note. All three
would matter the moment a second real capture source with a different
`PixelFormat` exists.

---

## 1. `Algorithms::mean()` assumes BGR channel order regardless of `PixelFormat`

**Location:** `src/Imaging/ImageProcessing.cpp:93-97`

```cpp
Color mean(
  const ImageData& imageData
)
{
  auto mean = cv::mean(imageData.imageMatrix);

  return Color{
    static_cast<uint8_t>(mean[2]),
    static_cast<uint8_t>(mean[1]),
    static_cast<uint8_t>(mean[0])
  };
}
```

`cv::mean()` returns channel averages in whatever order the `cv::Mat` actually
stores them — it has no concept of "red" or "blue". This unconditionally
assumes storage order is BGR (channel 0 = B, channel 2 = R) and never consults
`imageData.format`.

**Why it hasn't fired:** every grabber in huenicorn today tags its output
`PixelFormat::BGR` (confirmed: `DummyGrabber::grabFrameSubsample()`,
`src/Grabber/DummyGrabber.cpp:60`, sets `Imaging::PixelFormat::BGR` explicitly;
the X11/Pipewire grabbers follow the same convention). The `PixelFormat` tag
exists precisely to let this function handle more than one layout, but it's
never actually consulted.

**Suggested fix:** switch on `imageData.format` and pick channel indices
accordingly — `RGB`/`RGBA` read channels 0,1,2 directly; `BGR`/`BGRA` keep
today's swapped read.

---

## 2. `rgbaToRgb()` has no `BGRA` equivalent

**Location:** `src/Imaging/ImageProcessing.cpp:46-52`

```cpp
void rgbaToRgb(
  const ImageData& inputImageData,
  ImageData& outputImageData
)
{
  cv::cvtColor(inputImageData.imageMatrix, outputImageData.imageMatrix, cv::COLOR_RGBA2RGB);
}
```

`cv::COLOR_RGBA2RGB` assumes the 4-channel input is laid out RGBA. There's no
equivalent for `BGRA`, which is what several real capture backends produce
natively (Windows' DXGI Desktop Duplication, and many Wayland/X11 compositor
paths).

**Why it hasn't fired:** the only call site
(`src/Core/Runtime.cpp:287-289`) guards it with
`if(source.format == Imaging::PixelFormat::RGBA)`, so it's never actually
invoked on a `BGRA` frame today — no huenicorn grabber currently produces one.
A `BGRA` frame today just skips the alpha-drop step and flows through as
4-channel data.

**Suggested fix:** branch on format, adding a `cv::COLOR_BGRA2BGR` case for
`PixelFormat::BGRA` (and tag the output `PixelFormat::BGR` to match, per
finding 3 below).

---

## 3. `rescale()` and `getSubImage()` never set `outputImageData.format`

**Locations:** `src/Imaging/ImageProcessing.cpp:8-43` (`rescale`) and
`:55-70` (`getSubImage`)

Neither function writes to `.format` on its output. `PixelFormat` has no
default member initializer (`include/Huenicorn/Imaging/ImageData.hpp:18`), so
a freshly-constructed `ImageData` passed in as the output parameter leaves
`.format` **uninitialized** — reading it afterward is undefined behavior.

**Confirmed this reaches a real read**, not just a theoretical one — in
`src/Core/Runtime.cpp:279-288`:

```cpp
Imaging::ImageData resized;
Imaging::ImageProcessing::rescale(m_frameData, resized, subsampleWidth, m_config.interpolation());

if(resized.hasData()){
  source = std::move(resized);          // source.format is now uninitialized
}

if(source.format == Imaging::PixelFormat::RGBA){   // reads the uninitialized value
  Imaging::ImageProcessing::rgbaToRgb(source, source);
}
```

**Why it hasn't fired (observably):** in practice, the uninitialized stack
value only needs to *not* happen to equal `RGBA` by chance for this to go
unnoticed, and with every current grabber tagging `BGR` there's no working
case that would expose it as visibly wrong. Still genuine undefined behavior
per the language, not something to rely on continuing to look harmless.

**Suggested fix:** both functions should copy `.format` from input to output —
neither operation changes pixel layout, only geometry, so the source format is
always still correct on the output.

---

## Status

Fixed and covered by tests in Aurora's port (`core/Processing/`,
`core/tests/ProcessingTests.cpp`) — see `ProcessingAnalysis.md`. Not yet sent
upstream; this doc is the write-up to send if/when that happens.
