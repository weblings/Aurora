# Audio-reactive color — findings, not a decision

Prompted by a phase-3-adjacent idea, general to the whole architecture, not
web-specific: an audio-driven default `Processing` behavior — a vibrant,
contrasting color pair (e.g. cyan + magenta) that zones bounce between on
the beat, while the pair itself slowly HSV-lerps to a new contrasting,
vibrant pair over time. **Status: not aligned on shape or direction yet**
— same spirit as `BrowserAnalysis.md`, context for a future decision, not
the decision itself.

## Nothing for this exists yet

No audio input, no audio processing, no HSV support in `Contracts::Color`.
This doc is groundwork, same as `BrowserAnalysis.md` was before any browser
code existed.

## Audio doesn't fit `IInput`'s shape — a parallel branch, not a variant

Checked `Aurora/core/Input/include/Aurora/Input/IInput.hpp` directly: its
whole contract is image-specific — `displayResolution()`,
`displayRefreshRate()`, `grabFrameSubsample(ImageData&)`, monitor
selection. There's no honest way for a PCM stream to implement this (no
resolution, no monitor). Audio wants its own interface (`IAudioInput`) and
its own contract type (raw samples + sample rate + channel count — call it
`Contracts::AudioBuffer` for now), a separate pipeline arm from the image
one, not a third grabber alongside `WindowsGrabber`/a future
`VideoFileGrabber`.

Both arms would still converge at `Contracts::Frame` before
`Orchestrator`/`Smoother`/`IOutput`. This is the first *concrete* exercise
of a principle `DistributedArchitecturePlan.md` already established but
only had hypothetical cases for (a VJ console, an authored cue track):
*"`Output` doesn't care where a `Frame` came from."* Audio-driven color is
a real instance of that, not a new argument for it.

## The default effect, as scoped so far

Two independently-tunable processes, matching `ImageProcessing`'s own
style of small composable pure functions rather than one monolith:

1. **Palette drift (slow).** Generate a vibrant, contrasting color pair;
   HSV-lerp to the next such pair over time. Genuinely new code either
   way — `Contracts::Color` (`core/Contracts/include/Aurora/Contracts/Color.hpp`)
   is `uint8` RGB only today, no HSV representation or RGB↔HSV conversion
   exists anywhere in Aurora yet. Trivial math, no library, but not
   written.
2. **Beat-driven bounce (fast).** On each detected beat, a zone's position
   between the current pair's two endpoints gets an impulse, then decays/
   settles back — a spring- or exponential-decay-style curve, not a direct
   loudness-to-position map. Likely close in shape to `Smoother`'s existing
   RGB easing (`core/Runtime/src/Smoother.cpp`), just triggered by a beat
   event instead of a new-tick arriving.

**Settled for this default:** zones move together (one global bounce), not
independently per frequency band. A per-zone/per-band variant (bass zone,
mid zone, treble zone) is a plausible later customization, not part of the
default.

### Refined motion model

**Contrasting pair = true complements (180° apart on the hue wheel).**
First choice to try, not yet listening-tested. A nice side effect: since
the pair is always exactly opposite, there's only one drifting value to
track (an anchor hue), with the second color always `anchor + 180°` —
palette drift never needs to manage two independently-moving endpoints.

**Both drift and bounce interpolate along the hue arc, not straight RGB.**
Avoids passing through desaturated/muddy midpoints — chosen specifically
so the in-between colors never look "off" the way an RGB lerp between
complements can.

**Real wrinkle this introduces:** at exactly 180° apart, the two arcs
connecting the pair are equally short — genuinely ambiguous, unlike a
120°-apart pair (e.g. the original cyan/magenta example) which always has
one clearly shorter side. **Resolved:** bounce sweeps one fixed rotational
direction, drift creeps the other — a deliberate rule, not just a
tie-break, that also keeps the two motions visually distinct. In practice,
continuous shortest-arc damping toward an alternating pair of exact
opposites doesn't even produce a literal back-and-forth oscillation on its
own — once the first beat resolves the initial tie, "current" position
sits close enough to the last target that subsequent beats keep resolving
the same rotational direction, producing one continuous sweep around the
wheel rather than a reversal. Assigning bounce and drift opposite *fixed*
directions makes that emergent behavior deliberate rather than accidental.

**Bounce motion: continuous exponential damping, not a discrete tween.**
A beat-driven target is a continuously-shifting one (each beat re-targets
the opposite complement), the same shape of problem RockyRoad's XR yaw
tracking already solved
(`RockyRoad/Analysis/lessons/engine/xr-3d-rendering.md`: *"A
continuously-moving target needs continuous damping, not a discrete
from/to/duration tween"*). The actual code, not just the lesson
(`RockyRoad/v2/src/xr/index.ts:287-291`), handles the circular-wraparound
case hue will need too:

```js
let delta = target - current;
delta = ((delta + Math.PI) % twoPi + twoPi) % twoPi - Math.PI; // shortest-path normalize
current += delta * (1 - Math.exp(-dt / smoothTime));           // continuous damping
```

Directly reusable with degrees/360° swapped in for radians/2π. Applying
the damping unconditionally (not gated on "a beat is currently happening")
is also what makes silence/cold-start need no special-cased logic — see
below.

**Palette drift gets nudged by spectral centroid, not replaced by it.**
Drift keeps its fixed-direction base rotation (see above); the audio's
spectral centroid (its perceptual "brightness"/timbre center — see the
audio-analysis glossary below) adds a bias on top — speeding up, slowing
down, or offsetting that rotation based on content — rather than becoming
the sole driver of drift's position. Exact scaling of the nudge is a
tuning question, not derived here.

**Two different signals do two different jobs — not one "loudness" doing
double duty:**
- **Onset strength/salience** (the detected onset's own peak magnitude in
  the onset-detection function, not a separately-computed value) → scales
  bounce swing amplitude per beat. A hit's own strength is a purpose-built
  "how hard did this land" value; RMS is the wrong tool for this because
  it's a continuous average, not a per-event quantity.
- **RMS envelope** (continuous, windowed) → drives brightness. The right
  tool here precisely because it's continuous, unlike onset strength which
  is only defined at discrete onset moments. Peak level is deliberately
  not used for either job — too spiky/twitchy off individual transients.
- **Practical bonus:** gating onset detection below an RMS floor is a
  standard technique for suppressing false triggers in near-silence, and
  it's also *why* "silence could be a calmer lerp" happens for free — no
  onsets fire, so the damped bounce just relaxes toward the ambient drift
  color, no separate silence-handling code needed.

**Starting parameter suggestions (not listening-tested, tune by ear):**
- **Vibrancy:** fix S≈90–100%, V≈90–100% on every generated pair, constant,
  never varied. Kept deliberately separate from actual output intensity —
  RMS-driven brightness scales the `Frame`'s brightness channel downstream,
  so "how vivid the color is" and "how bright the light is right now" stay
  two different concerns, mirroring the onset-strength/RMS split above.
- **Damping `smoothTime`:** start around **120–150ms**. At `t = smoothTime`
  the exponential closes ~63% of the gap, ~95% by roughly 3× that
  (~400–450ms) — reactive even at brisk tempos (180 BPM ≈ 333ms/beat)
  without reading as an instant snap.
- **Minimum-dynamism floor:** `swing = floor + (1 − floor) ×
  normalizedOnsetStrength`, floor ≈ **0.2–0.25**. Keeps quiet passages from
  going visually flat while still letting strong hits reach full swing.

**Centroid→hue-nudge: rate-bias, decided.** The fixed-direction base
rotation never reverses; centroid only speeds it up or slows it down:
`driftRate = baseRate × (1 + strength × normalizedCentroidDelta)`, clamped
so the sign can't flip. Preserves the one property the direction
assignment above was chosen for — drift and bounce staying visually
distinguishable by consistently opposite directions. `normalizedCentroidDelta`
is measured against a **rolling per-track average**, decided — more robust
across genres than a fixed reference (e.g. 1kHz), since a whole track/album
that's consistently bright or dark won't just permanently peg the nudge to
one extreme. Needs a warm-up window before the rolling average is
meaningful; behavior during that window (first few seconds) isn't decided.
`strength` itself is still a tuning question, not resolved here.

**Cold-start anchor hue: a curated six-pair rainbow palette, chosen
randomly.** At S=100%/V=100% (illustrative — the real constant sits in the
90–100% range already settled on), twelve hues spaced 30° apart form six
complementary pairs, verified via the standard HSV→RGB sector formula
rather than recalled from memory:

| Anchor | RGB | Complement (+180°) | RGB |
|---|---|---|---|
| Red (0°) | (255, 0, 0) | Cyan (180°) | (0, 255, 255) |
| Orange (30°) | (255, 128, 0) | Azure (210°) | (0, 128, 255) |
| Yellow (60°) | (255, 255, 0) | Blue (240°) | (0, 0, 255) |
| Chartreuse (90°) | (128, 255, 0) | Violet (270°) | (128, 0, 255) |
| Green (120°) | (0, 255, 0) | Magenta (300°) | (255, 0, 255) |
| Spring Green (150°) | (0, 255, 128) | Rose (330°) | (255, 0, 128) |

Startup picks one of these six pairs uniformly at random, rather than
either a single hardcoded default or a fully continuous random hue.
Named and discrete on purpose — doubles as a UI-friendly list later (a
dropdown of six recognizable pairs) the same way `activeMonitorName`
became a persisted, user-facing `Config` field instead of a build-time
constant.

**`AudioProcessing`'s output contract, sketched:**

```cpp
namespace Aurora::Contracts
{
  struct AudioFeatures
  {
    bool onsetDetected = false;    // true only on the tick a new onset fires
    float onsetStrength = 0.0f;    // onset-detection function's peak magnitude; only meaningful when onsetDetected
    float rms = 0.0f;              // continuous windowed loudness envelope
    float spectralCentroid = 0.0f; // Hz, continuous
  };
}
```

`IAudioInput` hands back raw `Contracts::AudioBuffer`; a new
`AudioProcessing::extractFeatures(AudioBuffer) -> AudioFeatures` wraps
aubio, mirroring `ImageProcessing::getDominantColor`. Separate pure
functions then consume `AudioFeatures` for the color logic —
`updateDrift(AudioFeatures, driftState) -> anchorHue` and
`updateBounce(AudioFeatures, bounceState) -> Contracts::Color`, each
independently unit-testable the way `rescale`/`dropAlpha`/`getSubImage`/
`getDominantColor` already are. Keeps feature extraction (aubio-dependent)
cleanly separable from the color math (pure, no aubio dependency at all)
even though both live in the same module.

**Still open:** the exact `strength` value and the rolling-average's
warm-up behavior, and everything still needing a real listening test
against actual music rather than reasoned-through defaults — the
vibrancy/`smoothTime`/dynamism-floor numbers above, and now this formula's
own constants too.

### Three provenances for audio input, and a build-order recommendation

"Audio-Input" turns out to cover three genuinely different shapes of
thing, not one interface with three interchangeable backends:

1. **Standalone audio file** (no video) — an `AudioFile-Input` plugin,
   pull-based, decoding via a library the plugin itself owns. No sync
   partner to coordinate with; can be paced to wall-clock or even
   pre-scanned faster than real time.
2. **Audio track embedded in a video file** (the phase-3 video-upload
   idea) — needs the video and audio tracks demuxed jointly from one
   shared read/seek position, or the two can drift out of sync even if
   both are polled on the same tick (a shared tick alone doesn't guarantee
   alignment if two decoders are still independently free-running against
   the same file). This is a different *component* — a combined
   demuxer — not a variant of `AudioFile-Input` glued to `VideoFile-Input`
   after the fact.
3. **Live capture** (WASAPI loopback on Windows, a Pipewire/PulseAudio
   monitor source on Linux) — an independent real-time stream with no file
   to synchronize against; its own loop at its own natural cadence is
   fine, since there's no shared timeline to preserve in the first place.

**Recommended build order — revised.** Originally (1) first, on shape-
confidence grounds alone. Revisited once the actual near-term need
surfaced: tuning the color/motion model by ear requires *hearing* the
audio, and (1) without also building playback doesn't provide that — it'd
mean manually playing the same file in a second app and hoping it stays
roughly in sync, which doesn't really work. (3) solves this for free: the
user just plays music in whatever app they already use, and Aurora taps
the OS's existing output stream — zero new playback scope, and arguably
the more realistic end-user feature besides ("react to whatever I'm
listening to," not "upload a file to Aurora specifically").

**Decided: (3) first**, even though it's more implementation effort
(genuinely OS-specific, two platform implementations) than (1). (1)
resequences to a secondary role it's well-suited for: a fixed,
reproducible test fixture for automated correctness testing (feed a known
file, assert `AudioFeatures`/`Frame` output against expected values) —
the same role `DummyGrabber` plays for video, deterministic in a way live
capture inherently can't be. (2) stays deferred until phase 3's
video-upload idea is actually being built, since it needs a genuinely
different component and phase 3 itself is explicitly not aligned on shape
yet.

**The tick-rate question, resolved — simpler than first framed.** The
mismatch only matters when video and audio cadences must be reconciled
*within one run*, which only actually happens for provenance 2 (already
deferred, already answered by joint demux above). For provenances 1 and 3,
audio is the *only* input active — there's no competing video rate to
reconcile against at all. `Orchestrator`'s tick rate was never inherently
a video concept, it's just "how often the active input gets polled,"
currently derived from `Config::refreshRate()` only because video's been
the sole input built so far. An audio-only run derives that same tick rate
from whatever suits audio instead (e.g. aubio's hop cadence) — no new
reconciliation mechanism needed, because nothing needs reconciling when
only one input is active at a time. The "buffer multiple hop-chunks per
video tick, or run a second independent thread" framing floated earlier
was solving a problem that doesn't actually arise for the two provenances
being built first.

**Dependency split, sharpened:** Core's aubio stays detection-only — no
`libsndfile`/`libav` in Core at all, even though aubio could technically
cover file decode too. That decode dependency belongs entirely inside the
`AudioFile-Input` plugin, keeping Core's existing dependency-isolation
exception (see above) as narrow as it was originally justified to be
rather than quietly widening it once file support arrives.

**Push vs. pull delivery model — deliberately deferred, not unresolved.**
Only matters for provenance 3 (live capture) — now first in the build
order above, so this needs addressing sooner than originally framed, but
it's still the same "WebSockets stretch goal" already sitting in
`ImplementationPlan.md`'s deferred section, and a second concrete instance
of the one-seam-vs-double-seam fork `DistributedArchitecturePlan.md`
leaves open — not a fresh unknown to design from scratch.

**Sample rate is just a runtime-variable field.** `AudioProcessing`
configures aubio from whatever `AudioBuffer::sampleRate` says on a given
buffer rather than assuming a fixed constant — a requirement to state
explicitly, not an open design question.

### Closing six small gaps before a scoped plan is attemptable

1. **Audio playback/output is out of scope.** `AudioFile-Input` (and live
   capture) decode/capture for analysis only — no speaker output. Hearing
   the song is solved by provenance 3 riding on whatever app the user
   already has playing it, not by Aurora itself gaining a playback feature.
2. **Live/streaming, not offline whole-file analysis, for the first cut.**
   A file's entire content being available up front does make one-pass
   analysis (e.g. normalizing onset strength against the file's *actual*
   observed max) a real future option — noted, not built now. First cut
   stays live/streaming, consistent with how the video pipeline already
   works.
3. **Mono downmix happens in `AudioProcessing`, not per-plugin.** aubio's
   onset/pitch functions expect mono; keeping `IAudioInput`'s contract
   genuinely raw (undownmixed) and centralizing the downmix in Core means
   one implementation instead of one per plugin.
4. **Onset-strength normalization: a rolling max/percentile**, for
   consistency with the rolling-average approach already chosen for
   centroid, rather than a fixed threshold.
5. **`Contracts::AudioBuffer`, sketched:**
   ```cpp
   namespace Aurora::Contracts
   {
     struct AudioBuffer
     {
       std::vector<float> samples; // interleaved if channelCount > 1
       unsigned sampleRate = 0;
       unsigned channelCount = 1;
     };
   }
   ```
6. **`AudioFile-Input`'s decode library: [libsndfile](https://github.com/libsndfile/libsndfile).**
   Checked directly: LGPL-2.1-or-later (permissive, no complication
   alongside Aurora's GPLv3), available on both
   [vcpkg](https://vcpkg.io/en/package/libsndfile.html) and apt, supports
   WAV/AIFF/AU/FLAC/**Ogg Vorbis**/**Opus** — a good fit with this
   project's existing open-format preference (the same reasoning behind
   the Ogg-vs-WebM discussion in `BrowserAnalysis.md`). Doesn't cover MP3.

### Live-capture library research (provenance 3, now first in build order)

**Linux: native pipewire, not a third-party cross-platform library —
because it's already a dependency, not a new one.**
`Aurora-Input-Linux/CMakeLists.txt:50-61` already links `libpipewire-0.3`
+ `glib` for the existing `PipewireGrabber` (video capture via XDG desktop
portal). Audio loopback capture reusing that exact dependency is the same
"OpenCV already a Core dependency" story that kept `VideoFileGrabber`
lean, just at the Linux-plugin level. References, checked directly rather
than assumed:
- [PipeWire's own official `audio-capture.c` example](https://github.com/PipeWire/pipewire/blob/master/src/examples/audio-capture.c)
  — authoritative, from the project itself.
- [obs-pipewire-audio-capture](https://github.com/dimtpap/obs-pipewire-audio-capture)
  — real, actively-maintained (800+ stars), doing exactly this in a
  shipping app. Caveat, checked not assumed: its README documents *what*
  it does, not *how* — the actual API shape would need reading its
  `/src` directly, not just this page, before it's usable as a reference.
- `tinyPipeWire` (a small C wrapper over PipeWire's stream API) exists but
  is probably unnecessary — this codebase already has working raw-pipewire
  experience (`PipewireGrabber`/`XdgDesktopPortal.cpp`).

**Windows: miniaudio, not the Microsoft sample originally found — they
solve different problems.** Checked both directly:
- [Microsoft's `ApplicationLoopbackAudio` sample](https://learn.microsoft.com/en-us/samples/microsoft/windows-classic-samples/applicationloopbackaudio-sample/)
  uses the newer `ActivateAudioInterfaceAsync`-based **per-process**
  loopback (capture one process/tree, or everything *except* it) —
  requires **Windows 10 build 20348+**. A good reference *if*
  "only react to this one app" ever becomes a wanted customization, but
  not the shape needed for the default "react to whatever's playing
  system-wide" effect.
- [miniaudio](https://github.com/mackron/miniaudio)'s
  [`examples/simple_loopback.c`](https://github.com/mackron/miniaudio/blob/master/examples/simple_loopback.c)
  does the classic **whole-system default-playback-device** loopback —
  the actual shape wanted, ~30 lines of real setup, no Windows-version
  floor beyond WASAPI itself (available since Vista). License confirmed
  public domain / "MIT No Attribution." Also ships its own internal
  resampler/format-conversion, saving WASAPI's fiddly format-negotiation
  work regardless of a device's native format.
- **Decided: miniaudio**, not hand-rolling from the Microsoft sample —
  that sample solves a narrower, different problem than the one being
  built.

### Repo/target structure for live capture

Fold into the existing `Aurora-Input-Windows`/`Aurora-Input-Linux` repos,
as a **new, separate CMake target within each** — not a new repo, and not
merged into the existing video-grabber target.

- **Same repo**, because the boundary that actually matters is platform,
  not sense (sight vs. sound) — the same axis these repos are already
  organized around. Linux audio capture reuses the exact pipewire
  dependency already linked there; a separate repo would mean re-declaring
  it. App repos also need zero new `FetchContent_Declare` this way — just
  one more target linked from a repo they already fetch.
- **Separate target** (`AuroraInputWindowsAudio`, `AuroraInputLinuxAudio`),
  because `IAudioInput` is a structurally unrelated interface from
  `IVideoInput`, not a variant of it. Not a new pattern — `Aurora-Input-Linux`
  already toggles `X11Grabber`/`PipewireGrabber` independently within one
  target via `AURORA_INPUT_LINUX_ENABLE_X11`/`_PIPEWIRE`, and Aurora core
  itself is already organized as multiple independent targets
  (`AuroraContracts`, `AuroraInputInterface`, `AuroraOutputInterface`, …)
  in one repo — this just applies the same "one repo, multiple targets"
  shape one level further, gated by its own new CMake option per platform.

### Audio-analysis vocabulary used above

Looked up rather than recited from memory:

- **FFT** — the base transform everything below is derived from; turns a
  windowed chunk of raw PCM into per-frequency energy.
- **Frequency bands** — FFT bins grouped into ranges (commonly bass
  ~20–250 Hz, mids ~250 Hz–4 kHz, treble ~4–20 kHz, or a finer six-band
  split) because pitch perception is logarithmic
  ([source](https://visualizers.novusstreamsolutions.com/blog/how-music-visualizers-work)).
  Not used by the default effect (which is intentionally single-scalar),
  but the standard lever for a future per-band/per-zone variant.
- **RMS vs. Peak** — RMS averages energy over a short window and tracks
  perceived loudness; Peak is the single highest instantaneous sample and
  is spiky
  ([source](https://athina-b.medium.com/audio-signal-feature-extraction-for-analysis-507861717dc1)).
  RMS, not Peak, is what feeds brightness above.
- **Onset detection** — "something just hit," computed via a named
  function (spectral flux, HFC, superflux, RMS-energy-based, etc.) whose
  output is a continuous strength curve; a detected onset is a peak in
  that curve crossing a threshold, and the peak's height is the onset
  strength used above.
- **Beat tracking / tempo estimation** — a heavier second stage on top of
  onset detection: finding which onsets recur with consistent periodicity
  to estimate BPM and phase. Not needed for the current design (which only
  needs "a beat just happened," not "what's the BPM") — would only matter
  if palette drift ever wanted to sync to bars/measures instead of a
  clock/centroid-driven pace.
- **Spectral centroid** — the spectrum's "center of mass"; perceptually,
  this *is* what's meant by a sound's "brightness" (treble-heavy = high
  centroid, bass-heavy = low)
  ([source](https://athina-b.medium.com/audio-signal-feature-extraction-for-analysis-507861717dc1)).
  Worth flagging as a real naming collision with Aurora's own "brightness"
  (light intensity, driven by RMS) — a different concept sharing the same
  word; pick unambiguous names in code/docs.

## Where "detect the beat" lives — resolved

The image pipeline draws a clean line: `IInput` hands back raw,
uninterpreted pixels; all interpretation (crop, average) happens in
`Processing`. Audio doesn't split this cleanly on its own, because a real
beat detector doesn't naturally separate into "decode" and "detect" stages
at two different architectural layers — it's one integrated pass over raw
audio that emits onset/beat events directly.

**Decided: keep Input/Processing symmetric with the image arm.**
`IAudioInput` hands back raw PCM only; a new core `AudioProcessing` module
(mirroring `ImageProcessing`) owns beat detection itself. `AudioProcessing`
is the piece that decides the actual colors — palette drift and
beat-driven bounce both live here, not in the input plugin.

This is a deliberate, conscious exception to `ModuleSplitPlan.md`'s
"core stays dependency-light, heavy dependencies isolated to plugins"
rule — not a case that rule already accounted for. Whatever detection
library core ends up using (aubio, most likely) becomes core's first
non-pure-math dependency. Worth remembering as a precedent the next time a
similar boundary question comes up, not re-litigating each time.

## Naming: `IVideoInput`/`IAudioInput`, `IOutput` unchanged

Checked both existing interfaces directly against this question rather
than reasoning abstractly:

- **`IOutput` doesn't change.** Read `core/Output/include/Aurora/Output/IOutput.hpp`:
  its entire surface (`send(Contracts::Frame&)` plus `init`/`isConnected`/
  `shutdown`/`name`/`zoneIds`) is already modality-agnostic — no
  video-specific concept anywhere in it. That's the direct payoff of
  `DistributedArchitecturePlan.md`'s "`Output` doesn't care about `Frame`
  provenance" finding; audio-driven `Frame`s need nothing new from it.
  Renaming it to `IVideoOutput` would be wrong — there's no such thing as
  a video-specific output today.
- **`IInput` becomes `IVideoInput`.** Re-checked `IInput.hpp`: past
  `name()`, essentially everything on it — `displayResolution()`,
  `displayRefreshRate()`, `selectMonitor()`, `monitors()`,
  `subsampleResolutionCandidates()`, `grabFrameSubsample(ImageData&)` — is
  screen/resolution-shaped. A genuinely generic common base above both
  `IVideoInput` and `IAudioInput` would be left holding just `name()` and
  a virtual destructor — not enough of an abstraction to justify manufacturing
  a shared parent. `IAudioInput` is a wholly independent sibling interface
  with its own contract (raw PCM + sample rate + channel count), not a
  subclass of anything `IVideoInput` also derives from.
- **Nothing structural forces a shared base either.** Checked
  `Aurora-App-Linux/include/Aurora/App/Registry.hpp`: it isn't polymorphic
  over one common interface today — it's two independently-typed factory
  maps (`InputFactory`→`IInput`, `OutputFactory`→`IOutput`), each with
  their own `register*`/`create*`/`*Names()` trio. Adding `IAudioInput` is
  just a third factory map (`AudioInputFactory`, `registerAudioInput`,
  `createAudioInput`, `audioInputNames()`) — mechanical, no restructuring
  of `Registry` required.

**Rename cost, worth deciding on purpose:** `IInput`→`IVideoInput` isn't
core-only. It ripples through `Aurora-Input-Windows` (`WindowsGrabber`),
`Aurora-Input-Linux` (`X11Grabber`/`PipewireGrabber`/`DummyGrabber`),
`MonitorSelector`/`Orchestrator`, both App repos' `Registry`/`main.cpp`,
and `RuntimeTests.cpp`'s fixtures — three already-working,
hardware-verified repos, not a contained edit.

**Decided: deferred, not immediate.** The rename lands as part of this
same refactor pass when `IAudioInput` work actually starts, not before —
one pass touching the interface layer once, rather than a preemptive rename
now followed by a second pass later to add the audio side.

## Library candidates

Looked up rather than assumed, per the "verify a library's real behavior
before designing around it" habit already established (`OpenFormatsResearch.md`,
`WindowsInputAnalysis.md`).

### [aubio](https://aubio.org/) — native/general candidate

**Pros:**
- GNU/GPL licensed — no new licensing question; Aurora already carries
  GPLv3 end to end from huenicorn.
- C, causal, real-time onset/beat/tempo detection — built for live use
  with low delay, not just offline analysis of a whole file. Matches
  Orchestrator's tick-based polling model.
- No *required* dependencies as of 0.4.0; optional `libsndfile`/`libav`
  cover file decode. Meaning aubio could plausibly satisfy **both** new
  dependency needs raised in the video-file discussion (file decode *and*
  beat detection) in one library, rather than two separate ones.
- Several onset-detection methods (energy, HFC, spectral difference,
  complex domain, etc.) and tempo tracking beyond just "beat happened,"
  giving room to grow past the simple default effect later.
- Same cross-platform story already proven with OpenCV this project (one
  C library, packaged for both Windows and Linux) rather than something
  new to figure out.

**Cons:**
- **Packaging checked — available both places, but with a real staleness
  caveat.** [vcpkg](https://vcpkg.link/ports/aubio): available
  (`vcpkg install aubio`), port last published Jan 2026, pinned to a
  `2024-01-03`-dated snapshot. [apt](https://packages.ubuntu.com/src:aubio):
  available on current Ubuntu releases (`libaubio-dev`/`libaubio5`/
  `aubio-tools`). But aubio's own [last official tagged release is 0.4.9,
  from February 2019](https://github.com/aubio/aubio/releases) — over
  seven years old, even though the repo itself keeps getting commits and
  issues into 2026. The vcpkg port's newer snapshot date suggests it
  actually builds a post-0.4.9 commit rather than that old tag, while
  Debian/Ubuntu's apt package most likely still repackages 0.4.9 itself
  (their usual convention) — meaning Windows and Linux builds may not even
  be running the same underlying aubio without checking further.
- Real DSP library API surface (buffer size, hop size, choice of onset
  method, sample-rate handling) — meaningfully more setup than "call
  `isOnBeat()`," even though the underlying detection is more capable.
- If only used for beat detection (not decode), it's a fairly heavyweight
  dependency for one feature — worth weighing against a small,
  hand-rolled energy-based onset detector in a new `AudioProcessing`
  (a well-known, compact technique) instead of taking on a full library.
  Not evaluated in depth this pass; flagged as a real alternative, same
  reuse-vs-hand-port question `native-logic-reuse-decision.md` already
  frames generally.
- No decay/bounce animation included (expected — that part is always
  Aurora's own code either way).

**Real API verified (not assumed) once implementation started — two
findings that changed the design:**
- The onset output vector isn't a strength value. `aubio_onset_do` writes
  `0` (no onset) or `1 + a` (a ∈ [0,1), sub-sample timing offset) — the
  actual onset-strength signal is a separate call,
  `aubio_onset_get_descriptor()`, returning the raw unbounded detection-
  function magnitude. Confirms the rolling-normalization decision above was
  necessary, not optional — aubio never hands you a pre-normalized value.
- Spectral centroid needs three aubio objects chained, not one:
  `aubio_pvoc_t` (raw samples → FFT spectrum) → `aubio_specdesc_t` (method
  `"centroid"`, spectrum → a bin number) → `aubio_bintofreq()` (bin → Hz).
  Onset detection does its own separate internal spectral analysis — the
  FFT is genuinely computed twice per hop, a known first-cut inefficiency.
- aubio's objects are **stateful** (constructed once with samplerate/buf_size/
  hop_size, fed hops repeatedly — onset detection inherently needs history).
  This meant `extractFeatures` couldn't stay a pure free function as
  originally designed; the real onset/centroid logic lives in a new
  `AudioFeatureExtractor` class instead. `extractFeatures` itself survives
  unchanged as the genuinely stateless RMS-only piece, reused internally.
- **vcpkg-specific:** aubio's default `tools` feature pulls in
  ffmpeg/libflac/libogg/libsndfile/libvorbis — installing with `aubio[core]`
  (default features disabled) took 9.5s instead of a from-source ffmpeg
  build, and keeps Core's dependency-isolation exception as narrow as
  originally decided rather than silently widening it.
- Verified against real synthetic signals, not just "it compiles": a
  continuous pure 1000Hz tone's measured centroid lands within 100Hz of
  its true frequency; a sudden full-amplitude transient after silence
  reliably triggers `onsetDetected`.

### [BeatDetector](https://github.com/stasilo/BeatDetector) (stasilo) — browser candidate

**Pros:**
- MIT licensed — no license question of any kind.
- A single small file, not a framework — its entire API is `isOnBeat()`,
  meant to be polled from a render loop. About as close as it gets to
  "simple bouncing waveform, might be enough."
- Zero new dependency in a browser context — rides entirely on the Web
  Audio API's built-in `AnalyserNode`/FFT, already shipped by every
  browser.
- Very low integration cost for a self-contained browser demo — fits
  `BrowserAnalysis.md`'s Option B spirit directly (JS-side logic, no
  backend involved).

**Cons:**
- Browser-only — inherently tied to the Web Audio API's `AnalyserNode`.
  Doesn't serve the native/general need at all; the native app driving
  real Hue bulbs from audio still needs a separate solution regardless of
  whether this is picked for the browser demo.
- Small single-maintainer project, far less proven/tested than aubio at
  scale — no tempo tracking, narrower scope, same-purpose but not a
  research-grade tool.
- Detection-quality robustness across genres isn't established from the
  README alone — worth an actual listening test against varied music
  before trusting it as a shipped default, not just assumed to work well
  everywhere.

### Does aubio's staleness bring the browser candidate back? No — but it's a fair prompt to widen the native search

[BeatDetector](https://github.com/stasilo/BeatDetector) doesn't come back
into consideration for the native side — it's fundamentally tied to the
Web Audio API's `AnalyserNode`, a browser runtime, not something aubio's
staleness changes. It was never a candidate for native use to begin with.

The original library search did surface a real native C++ alternative
that never got a fair look, though:
[Essentia](https://essentia.upf.edu/) (MTG/UPF) — real-time onset
detection and beat tracking, actively documented. Checked it now rather
than assume it's simply better:

- **License is a real, different trade-off, not a clean win.** Essentia is
  [AGPLv3, with a separate commercial license available](https://github.com/MTG/essentia).
  AGPLv3 is compatible with Aurora's existing GPLv3 for a combined/linked
  work, but AGPLv3's extra network-use clause (source must be offered to
  users interacting with the software *over a network*) would then apply
  to the combined binary — directly relevant since phase 3 plans an
  httplib server. Aubio's plain GPLv3 doesn't carry that clause.
- **Also not cleanly better on staleness.** Essentia's own docs reference
  a `2.1-beta6-dev` in-progress version while its
  [latest actual tagged release is 2.0.1](https://github.com/MTG/essentia/releases)
  — the same "active repo, stale official tag" pattern aubio has, not an
  improvement on it.

Net: not an obvious swap. Recorded here so it isn't silently dropped as an
option, not as a recommendation to switch.

### Emerging shape (still not decided)

Likely **not** a single shared library across native and browser — the two
runtimes probably end up as two separate integrations (aubio native-side,
something Web-Audio-API-based browser-side) that each just need to produce
the same conceptual "beat happened" event for the same decay-curve/Frame
logic downstream. Consistent with `StackComparison.md`'s finding that the
capture/input boundary is exactly the kind of thing that legitimately
varies per platform while everything downstream of it stays shared.

### Orchestration shape — resolved, informed by real VJ software

A different question from the tick-*rate* one above: not *when* a tick
happens, but *what code runs inside it*. `Orchestrator::update()` is built
entirely around image-cropping (`rescale`/`dropAlpha`/`composeFrame`/
`ZoneMap`/`Smoother`) — audio's tick has none of that, it's
`extractFeatures` → `updateDrift`/`updateBounce` → one `Frame` broadcast to
every zone. The only genuinely shared step between the two is "send this
`Frame` to each configured `IOutput`" — a few lines, not a real
abstraction.

**Decided: a separate `AudioOrchestrator`, no shared base with
`Orchestrator`** — the same reasoning that gave `IAudioInput`/
`IVideoInput` no shared base applies identically here: forcing one class
to generalize over two pipelines that share almost no real steps would
recreate an abstraction holding next to nothing, for the sake of sharing a
three-line loop. Zero risk to `Orchestrator`'s existing, well-tested
behavior either, since it stays untouched.

**Checked against real VJ software rather than left as an internal-only
argument** — it holds up, and more strongly than expected:
- **TouchDesigner** keeps audio and video in genuinely separate operator
  families — CHOPs ("motion, audio, animation, control signals") vs. TOPs
  (2D image/video) — and **"only operators of the same family can be
  Wired together."** A CHOP can't connect directly to a TOP at all; the
  bridge is a distinct, explicit mechanism ("Exporting flows numeric data
  from CHOPs to all operators" — a scalar becomes another operator's
  *parameter*, not a native same-shaped connection).
  ([source](https://docs.derivative.ca/Operator_Family))
- **Resolume** confirms the same split from the other side: FFT-derived
  frequency bands *modulate* existing video parameters (scale, color,
  opacity, effects) — audio doesn't produce its own competing output that
  gets merged with video's, it feeds numbers into video's own pipeline.
  BPM sync is kept as a separate mechanism from FFT-band modulation too,
  mirroring Aurora's own onset/RMS/centroid split into distinct signals
  for distinct roles rather than one blended value.
  ([source](https://resolume.com/software/avenue-arena))

For today's audio-only scope (no video running at all), this changes
nothing — the equivalent of a TouchDesigner network running CHOPs straight
to output with no TOP involved, a normal supported shape there, not an
edge case.

**Forward note for later, now evidence-based rather than speculative:**
when Aurora eventually wants video *and* audio together (provenance 2's
video-embedded audio, or any future combined live effect), both real
tools point the same direction — audio's role becomes feeding derived
values (onset, RMS, centroid) as **modulation inputs into the
video-driven pipeline's own parameters**, not running two independent
orchestrators that each produce a competing `Frame` to somehow merge. Not
designed now — phase 3's video-upload idea is still unscoped — but a
concrete, precedented shape to reach for then instead of inventing a merge
strategy from scratch.

### Making the tunable constants genuinely UI-editable later

The numeric knobs scattered through this doc (cold-start pair,
`smoothTime`, dynamism floor, centroid `strength`, vibrancy S/V) should
become `Config`/`ConfigStore` fields from the start — the same mechanism
`activeMonitorName` already established (a `ConfigData` field, a `Config`
getter/setter, field-by-field defaulting in `toJson`/`fromJson` so an old
config file degrades gracefully) — rather than retrofitted once a settings
UI exists.

The part that actually makes this work rather than just gesture at it:
**`AudioProcessing`'s pure functions take these as parameters, not as
hardcoded constants in the function bodies.**

```cpp
struct AudioEffectSettings
{
  std::optional<float> fixedAnchorHue; // unset = random pick among the six pairs, matching activeMonitorName's "empty means auto"
  float bounceSmoothTime = 0.14f;
  float dynamismFloor = 0.22f;
  float centroidStrength = 0.5f;
};
```

`AudioOrchestrator` reads these from `Config` once and passes the struct
into `updateDrift`/`updateBounce` each tick. Keeps the functions pure and
testable with literal values in tests, no `Config` dependency inside
`AudioProcessing` at all — while every number is already swappable via
`config.json` today. A future settings UI just needs to read/write the
same `Config` fields; zero changes to `AudioProcessing` itself when it
arrives, the same shape `activeMonitorName` already proved out.

## Related docs

- `DistributedArchitecturePlan.md` — the "`Output` doesn't care about
  `Frame` provenance" finding this whole doc's convergence point builds on.
- `ModuleSplitPlan.md` — the repo-split/dependency-isolation rule the
  boundary question above bears directly on.
- `BrowserAnalysis.md` — the Option B (browser-native, no backend) pattern
  the `BeatDetector` candidate fits into.
- `../../RockyRoadImport/SongConverter/docs/native-logic-reuse-decision.md`
  — the same reuse-vs-hand-port framework already applied to
  `Processing`/`Smoother` could apply again to aubio vs. a hand-rolled
  onset detector.
