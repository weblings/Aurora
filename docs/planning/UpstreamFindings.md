# Findings worth upstreaming to huenicorn

Id: upstream-findings

Bugs found while reading/porting huenicorn into Aurora, all present in
huenicorn's own code today, independent of anything Aurora-specific. Checked
against huenicorn commit `ede353ac329ba1922d354aae89adf5fe6ddb03f5`
(2026-08-23). Kept here in PR/issue-ready form in case it's worth sending
upstream later — citations are against huenicorn's own paths, not Aurora's.
Grouped by the module each was found while porting; see that module's own
`docs/*.md` for the full porting context each was found alongside.

Re-verified 2026-09-30 against the `huenicorn-fork` sibling checkout (same
commit): all of 1–8 still present at the cited lines. That pass and the
fix work after it corrected 1's, 2's and 5's premises and added 9 and 10.

## Processing (`ImageProcessing`)

Three bugs, none with an observable symptom in huenicorn *today* — see each
entry's "why it hasn't fired" note. They interlock: 1 depends on 3, and on
the grabbers' tags being corrected in the same change.

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

**Why it hasn't fired:** the swap is compensating for mislabeled tags.
`DummyGrabber` tags `BGR` correctly, but `X11Grabber` tags `RGBA`/`RGB`
(`src/Grabber/GnuLinux/X11/X11Grabber.cpp:166-170`) and `PipewireGrabber`
always tags `RGBA` (`src/Grabber/GnuLinux/Pipewire/PipewireGrabber.cpp:234`),
while the bytes are really BGRA/BGR (little-endian XShm ZPixmap) and usually
BGRx (Pipewire's common negotiated format). Since `mean()` never reads the
tag, the hardcoded BGR read is what keeps colors right. (Corrected
2026-09-30; the original write-up said every grabber tags `BGR`.)

**Suggested fix:** switch on `imageData.format` and pick channel indices
accordingly — `RGB`/`RGBA` read channels 0,1,2 directly; `BGR`/`BGRA` keep
today's swapped read. Must ship with grabber tag fixes (X11 → `BGRA`/`BGR`;
Pipewire maps negotiated `SPA_VIDEO_FORMAT_BGRx` → `BGRA`), or honoring the
tag swaps red and blue for every X11/Pipewire user. Also depends on 3:
`mean()` runs on `getSubImage()`'s output, whose `format` is unset until 3 lands.

Related, not a separate finding: `PipewireGrabber` also offers `RGB`, `YUY2`
and `I420`, which its fixed 4-byte-per-pixel decode can't handle. Screen-cast
producers only offer 4-byte formats, so these never negotiate in practice;
narrowing the list to `RGBA`/`RGBx`/`BGRx` (as Aurora did) is optional hardening.

---

### 2. `rgbaToRgb()` never runs on `BGRA` frames and leaves a stale 4-channel tag

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

The conversion itself is fine: OpenCV defines `COLOR_RGBA2RGB` as an alias of
`COLOR_BGRA2BGR` (both just drop channel 3), so it handles `BGRA` bytes
already. (Corrected 2026-10-01; the original write-up said it assumes an
RGBA layout.) The real gaps are around it: the output keeps its 4-channel
`RGBA` tag on a 3-channel mat, and the only call site
(`src/Core/Runtime.cpp:287-289`) admits `RGBA` alone, so a `BGRA` frame
skips the alpha drop and flows through as 4-channel data.

**Why it hasn't fired:** no huenicorn grabber tags `BGRA` today, and
`mean()` ignores the 4th channel anyway. Once 1's grabber tag fixes land,
X11 32bpp and Pipewire `BGRx` frames are `BGRA` and skip the drop.

**Suggested fix:** tag the output `RGB`/`BGR` from the input's format, and
widen the `Runtime.cpp` guard to `RGBA || BGRA`. No new conversion code needed.

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
`core/tests/ProcessingTests.cpp`) — see `archive/ProcessingAnalysis.md`.

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
be, easy to not notice without checking the math by hand. Measured
2026-10-01: a dropped `n / 2` only matters if it also divides the other
dimension. Across 15 common resolutions (720p to 5120x1440, ultrawide,
16:10, portrait), the candidate list and `Runtime::_initSettings()`'s
default subsample width are unchanged. Only square and 2:1 displays gain
candidates, and those are 2–4 px wide and never picked as the default. A
correctness fix with no practical user-visible effect.

**Suggested fix:** `i <= number / 2`. Doesn't break
`_selectValidDivisors()`'s `std::set_intersection` precondition (needs
sorted input) — `number` is always ≥ every other divisor, so appending it
last keeps the vector sorted either way.

**Status:** Fixed and covered by a regression test in Aurora's port
(`input/linux/tests/LinuxInputTests.cpp`) — see `archive/LinuxCaptureAnalysis.md`.

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

**Why it hasn't fired (observably):** requires the portal to deny or cancel
CreateSession itself — the happy path never exercises this branch, and real
portals usually prompt later (SelectSources/Start). Reproduced 2026-10-01
against a fake ScreenCast portal on a private session bus: on `develop` the
fall-through reads a null `session_handle`, passes it to `SelectSources` as
an object path, and **segfaults**. With the fix the promise settles `false`
and teardown is clean.

**Suggested fix:** `capture->fdReadyPromise.set_value(false);` then
`return;`, matching `onStartResponseReceivedCallback`. A bare `return;` is
not enough: `PipewireGrabber`'s constructor blocks on an unbounded
`fdReadyFuture.wait()`, so returning without settling the promise turns
today's half-initialized session into a permanent startup hang.

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
Confirmed 2026-10-01 with LeakSanitizer over the fake-portal driver: on
`develop` all 4 leaked allocations (16 bytes) are this `strdup`, one per
request/session path built; with the fix, no leaks reported.

**Suggested fix:** construct directly from the pointer GLib already owns —
`std::string(g_dbus_connection_get_unique_name(m_connection) + 1)` — no `strdup` needed.

### 9. `onSelectSourceResponseReceivedCallback` returns on denial without settling `fdReadyPromise`

**Location:** `src/Grabber/GnuLinux/Pipewire/XdgDesktopPortal.cpp:431-434`

```cpp
if(response != 0){
  Core::Logger::error("failed to select source, denied or cancelled by user");
  return;
}
```

Same shape as 5's corrected fix: the return is there, but the promise
`PipewireGrabber`'s constructor is blocked on is never set, so denying the
source picker hangs startup indefinitely instead of surfacing
`GrabberCancelled`.

**Why it hasn't fired (observably):** only a denied or cancelled source
picker reaches it. Unlike 5, this is the prompt users actually see, so it
plausibly has fired as an unexplained startup hang. Reproduced 2026-10-01
with the fake portal answering SelectSources with `Response(1)`: on
`develop` the promise is still unsettled after 5s; with the fix it settles
`false` and teardown is clean.

**Suggested fix:** `capture->fdReadyPromise.set_value(false);` before the `return;`.

### 10. Portal method-call errors leave `fdReadyPromise` unsettled too

**Locations:** `src/Grabber/GnuLinux/Pipewire/XdgDesktopPortal.cpp` —
`onSessionCreatedCallback` (CreateSession call error),
`onSourceSelectedCallback` (SelectSources call error), and both error
returns in `onPipewireRemoteOpenedCallback` (OpenPipeWireRemote / fd lookup).

5 and 9 cover the portal *denying* a request (a `Response` with a non-zero
code). These cover the D-Bus *call itself* failing, e.g. a portal backend
without a working ScreenCast implementation. Each logs and returns without
settling the promise, so `PipewireGrabber`'s constructor hangs.
`onStartedCallback` already does it right (settles `false` unless the error
is `G_IO_ERROR_CANCELLED`, i.e. our own teardown).

**Why it hasn't fired (observably):** needs a broken or partial portal
backend. Reproduced 2026-10-01 with the fake portal returning a D-Bus error
from CreateSession, SelectSources, and OpenPipeWireRemote in turn: on
`develop` each leaves the promise unsettled after 5s; with the fix each
settles `false` and teardown is clean. (The second fd-retrieval branch,
`g_unix_fd_list_get`, isn't reachable from a fake portal; same one-line fix.)

**Suggested fix:** in each, settle `false` in the non-cancelled branch,
matching `onStartedCallback`. The two callbacks that ignore `userData` get
the capture through the `DbusCallData*` passed as `userData`, which the
response callback hasn't freed yet when the call itself failed. Dereference
it only in the non-cancelled branch: on `G_IO_ERROR_CANCELLED`,
`onCancelledCallback` may already have freed it.

**Status (5, 6, 9 and 10):** 6 fixed in Aurora's port (`Aurora-Input-Linux`'s
`XdgDesktopPortal.cpp`) — see `archive/LinuxCaptureAnalysis.md`. 5 and 9 only
half-fixed there: both return on denial but never settle the promise, which
Aurora's 60s-bounded wait turns into a 60s stall rather than a hang. 10 is
unfixed there too (Aurora's port also dropped those branches' logging). No
in-repo regression test, but 5 and 9 are reproducible offline: a small
Python fake of the ScreenCast portal under `dbus-run-session` that answers
CreateSession or SelectSources with `Response(1)`, plus a driver copying
`PipewireGrabber`'s constructor wait and `_stop()` teardown.

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

Worse than "aborting the load": nothing between `Runtime::start()` and
`main` catches it, so the exception terminates huenicorn at startup.
Reproduced 2026-10-01 with a fake HTTPS bridge whose second light stalls
past curl's 1s timeout: on `develop` the loader throws
`bad_optional_access`; with the fix the configuration loads, with only
that light's name empty.

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
Confirmed 2026-10-01 with libstdc++'s own checked mode: the real selector
built with `-D_GLIBCXX_DEBUG` against a fake bridge aborts on `develop` at
the first `validSelection()` ("attempt to compare a singular iterator to a
past-the-end iterator"); with the fix it loads and reports no selection.

**Suggested fix:** load the map in the constructor's member-initializer
list instead of its body — member initializers run in declaration order, so
by the time `end()` is taken for the current-selection iterator, the map
already holds its final contents.

**Status (7 and 8):** Fixed in Aurora's port (`Aurora-Output-Hue`'s
`ApiTools.cpp`/`EntertainmentConfigurationSelector.cpp`) — see
`archive/HueOutputAnalysis.md`. Finding 7's fix is covered indirectly by
`ApiToolsTests.cpp`'s pure-parsing tests; neither fix has a test exercising
the actual failure path, since both need a live/failing bridge connection to
trigger.

## Upstream plan

Status: in progress — all 10 fixes committed in the `huenicorn-fork` sibling
checkout and grouped into the three MR branches below (`fix/hue-api-robustness`,
`fix/portal-failure-handling`, `fix/capture-pipeline`; all 13 branches,
grouped and per-finding, pushed to the fork's `origin` on 2026-10-01). Nothing
reported to huenicorn yet. Tracked as epic `Aurora-h45`; what's left is the
heads-up issue, the hardware check, and sending.

**Decisions:**
- One branch per finding, cut from `origin/develop` (upstream merges
  `develop` into `master`), named `fix/<slug>` to match the fork's
  `feature/<slug>` style. 1 is stacked on 3, and 2 on 1.
- Sent as three MRs grouped by area, not ten, to keep the review load
  manageable for a solo maintainer. Each MR keeps one commit per finding, so
  any one can be reviewed, dropped, or reverted on its own:

  | MR | Findings (commit order) | Notes |
  |---|---|---|
  | Hue API robustness | 7, 8 | Both in the configuration-loading startup path; both reproduced (startup termination, debug-mode iterator abort) |
  | Screencast portal failure handling | 5, 9, 10, 6 | All `XdgDesktopPortal.cpp`, one pattern; reproduced with a fake portal (segfault, hangs, leak) |
  | Capture and image pipeline fixes | 3, 1, 2, 4 | 1 needs 3, 2 needs 1; 4 rides along last (same grabber → downsample path, trivial, no measured effect) |

- A short heads-up issue goes first ("found while porting, MRs to follow,
  happy to restructure"), so the maintainer can ask for a different split.
- MRs go one at a time, in the table's order: smallest and clearest first,
  and the next only after the previous is reviewed. Capture goes last: it's
  the only one that changes behavior on real hardware (grabber tags), so it
  wants a real X11/Pipewire color check before sending. Huenicorn can't be
  fully built on the Linux box here (Mbed TLS 2.28).
- MR descriptions come from each finding's write-up above, trimmed to the
  bug, the evidence, and the fix.
- Fixes stay minimal: the one-line or few-line change each finding suggests,
  no refactoring alongside.
- Verification: touched files compile warning-free, plus scratchpad
  reproductions run before and after each fix. Those are throwaway drivers
  for 1–4; a fake ScreenCast portal on `dbus-run-session` for 5, 9 and 10;
  LeakSanitizer for 6; a fake HTTPS bridge for 7; `-D_GLIBCXX_DEBUG` for 8.
  The fork's `tests/` are stale (pre-reorg paths, off by default via
  `BUILD_TESTS`), so no in-repo tests are added. A full fork build needs
  Mbed TLS 3.x/4.x; `DtlsClient.cpp` fails against 2.28, unrelated to any
  finding here.

**Fork style to match** (observed, not documented upstream):
- 2-space indent; `if(cond){` with no spaces; `}` and `else{` on separate lines.
- Multi-line parameter lists, one parameter per line, closing `)` on its own line.
- Two blank lines between functions; `// Attributes`-style section markers.
- Doxygen `@brief` blocks in headers only; `.cpp` bodies are near-comment-free.
- Logging via `Core::Logger::{log,warn,error}`; `std::optional` checked with
  `has_value()` before `.value()`.

**Related Aurora bug:** Aurora's own port carries 5 and 9 half-fixed and 10
unfixed (see their status above) — tracked separately as `Aurora-p91`.
