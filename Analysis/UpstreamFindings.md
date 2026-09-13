# Findings worth upstreaming to huenicorn

Bugs found while reading/porting huenicorn into Aurora, all present in
huenicorn's own code today, independent of anything Aurora-specific. Checked
against huenicorn commit `ede353ac329ba1922d354aae89adf5fe6ddb03f5`
(2026-08-23). Kept here in PR/issue-ready form in case it's worth sending
upstream later — citations are against huenicorn's own paths, not Aurora's.
Grouped by the module each was found while porting; see that module's own
`Analysis/*.md` for the full porting context each was found alongside.

## Processing (`ImageProcessing`)

Three bugs, none with an observable symptom in huenicorn *today* — see each
entry's "why it hasn't fired" note. All three would matter the moment a
second real capture source with a different `PixelFormat` exists.

---

### 1. `Algorithms::mean()` assumes BGR channel order regardless of `PixelFormat`

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

### 2. `rgbaToRgb()` has no `BGRA` equivalent

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

### 3. `rescale()` and `getSubImage()` never set `outputImageData.format`

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

**Status:** Fixed and covered by tests in Aurora's port (`core/Processing/`,
`core/tests/ProcessingTests.cpp`) — see `ProcessingAnalysis.md`.

## Grabber (`IGrabber`)

### 4. `_divisors()` excludes `number / 2` even when it's a genuine divisor

**Location:** `include/Huenicorn/Grabber/IGrabber.hpp:209`

```cpp
inline static Divisors _divisors(int number)
{
  Divisors divisors;
  for(int i = 1; i < number / 2; i++){
    if(number % i == 0){ divisors.push_back(i); }
  }
  divisors.push_back(number);
  return divisors;
}
```

`i < number / 2` stops one short of `number / 2` itself, even when it's a
valid divisor. Confirmed numerically: `_divisors(6)` returns `{1, 2, 6}`,
missing `3`; `_divisors(12)` returns `{1, 2, 3, 4, 12}`, missing `6`.

**Why it hasn't fired (observably):** not a crash — this only feeds
`subsampleResolutionCandidates()`, so the practical effect is silently
offering fewer valid resample resolutions in the setup UI than there should
be, easy to not notice without checking the math by hand.

**Suggested fix:** `i <= number / 2`. Doesn't break
`_selectValidDivisors()`'s `std::set_intersection` precondition (needs
sorted input) — `number` is always ≥ every other divisor, so appending it
last keeps the vector sorted either way.

**Status:** Fixed and covered by a regression test in Aurora's port
(`Aurora-Input-Linux/tests/LinuxInputTests.cpp`) — see `LinuxCaptureAnalysis.md`.

## Pipewire (`XdgDesktopPortal`)

### 5. `onCreateSessionResponseReceivedCallback` doesn't return on a denied/cancelled session

**Location:** `src/Grabber/GnuLinux/Pipewire/XdgDesktopPortal.cpp:524-532`

```cpp
if(response != 0){
  Core::Logger::warn("failed to create session, denied or cancelled by user");
}

g_autoptr(GVariant) sessionHandleVariant = g_variant_lookup_value(result, "session_handle", NULL);
capture->sessionHandle = g_variant_dup_string(sessionHandleVariant, NULL);

selectSource(capture);
```

Every sibling callback (`onStartResponseReceivedCallback`,
`onSelectSourceResponseReceivedCallback`) returns immediately after logging
this same warning. This one falls through instead, reading `session_handle`
out of a `result` that was never validated (likely null/absent on a denied
response) and proceeding to `selectSource()` on a half-initialized `Capture`.

**Why it hasn't fired (observably):** requires a user to actually deny or
cancel the screen-selection portal prompt — the happy path never exercises
this branch.

**Suggested fix:** add `return;` after the warning, matching the sibling callbacks.

### 6. `getSenderName()` leaks its `strdup`'d buffer

**Location:** `src/Grabber/GnuLinux/Pipewire/XdgDesktopPortal.cpp:115-123`

```cpp
std::string senderName(strdup(g_dbus_connection_get_unique_name(m_connection) + 1));
```

`strdup` allocates a copy solely to hand it to `std::string`'s constructor,
which already copies its input — the `strdup`'d buffer is never freed
afterward. `std::string(const char*)` doesn't take ownership of anything
passed to it, so the copy is both unnecessary and leaked.

**Why it hasn't fired (observably):** a small, slow leak (one call per
portal session negotiation, a handful of times per app run) — never enough
to be noticeable without a leak-detector run specifically targeting this path.

**Suggested fix:** construct directly from the pointer GLib already owns —
`std::string(g_dbus_connection_get_unique_name(m_connection) + 1)` — no `strdup` needed.

**Status (5 and 6):** Fixed in Aurora's port (`Aurora-Input-Linux`'s
`XdgDesktopPortal.cpp`) — see `LinuxCaptureAnalysis.md`. No dedicated
regression test (this file's mechanics need a real Wayland portal session to
exercise either branch at all).

## Hue::Api (`ApiTools`, `EntertainmentConfigurationSelector`)

### 7. `loadEntertainmentConfigurations`'s per-device fetch calls `.value()` on a request that can fail

**Location:** `src/Hue/Api/ApiTools.cpp:41`

```cpp
auto jsonLightData = Network::Http::Client::sendRequest(lightUrl, "GET", "", headers).value().asJson();
```

`sendRequest` returns `std::nullopt` on any transport failure (timeout, DNS,
connection refused — `Network::Http::Client::sendRequest`'s own contract).
Calling `.value()` unconditionally throws `std::bad_optional_access` the
moment one such request fails, aborting the load of *every* entertainment
configuration rather than just leaving that one device's name unresolved.

**Why it hasn't fired (observably):** the Hue bridge is a local, low-latency
device — this only fires on a genuine transient failure (bridge briefly
unreachable, a dropped packet on a 1-second-timeout local request), rare
enough on a home LAN to go unnoticed.

**Suggested fix:** check `has_value()` first; on failure, leave that
device's name empty instead of throwing.

### 8. `EntertainmentConfigurationSelector`'s selection iterator is computed before the map it points into is populated

**Location:** `include/Huenicorn/Hue/Api/EntertainmentConfigurationSelector.hpp:92`
(in-class default member initializer) and
`src/Hue/Api/EntertainmentConfigurationSelector.cpp:16` (constructor body)

```cpp
// EntertainmentConfigurationSelector.hpp
EntertainmentConfigurationsIterator m_currentEntertainmentConfiguration{m_entertainmentConfigurations.end()};

// EntertainmentConfigurationSelector.cpp, constructor body
m_entertainmentConfigurations = ApiTools::loadEntertainmentConfigurations(m_credentials.username(), m_bridgeAddress);
```

The iterator is computed from the empty, default-constructed map via the
in-class default member initializer, then the map's real contents are
assigned afterward in the constructor body. Per the standard,
`std::unordered_map::operator=` invalidates all prior iterators on that
container, including `end()` — so `m_currentEntertainmentConfiguration` is
left dangling by the language's rules the instant real data loads, even
though it happens to keep comparing correctly on libstdc++ (whose `end()`
sentinel is, in practice, stable across rehashing — an implementation
detail, not a guarantee).

**Why it hasn't fired (observably):** libstdc++'s `unordered_map`
implementation happens to make this work reliably; a different standard
library implementation (or a future libstdc++ change) isn't obligated to.

**Suggested fix:** load the map in the constructor's member-initializer
list instead of its body — member initializers run in declaration order, so
by the time `end()` is taken for the current-selection iterator, the map
already holds its final contents.

**Status (7 and 8):** Fixed in Aurora's port (`Aurora-Output-Hue`'s
`ApiTools.cpp`/`EntertainmentConfigurationSelector.cpp`) — see
`HueOutputAnalysis.md`. Finding 7's fix is covered indirectly by
`ApiToolsTests.cpp`'s pure-parsing tests; neither fix has a test exercising
the actual failure path, since both need a live/failing bridge connection to
trigger.

## Not yet sent upstream

This doc is the write-up to send if/when that happens — none of the above
have been reported to huenicorn yet.
