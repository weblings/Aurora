# Processing / color-effect-transform lessons

Color/effect transform and zone-mapping specific gotchas. See
[`README.md`](README.md) for how entries get routed here vs. elsewhere.

---

## Generating a periodic test signal fresh per call, instead of continuing its phase, injects broadband noise a relative-comparison test can miss
Tags: processing, dsp, testing, test-signals
Applies-when: generating periodic test signals per call

Testing `AudioFeatureExtractor`'s spectral centroid against a pure 1000Hz
tone, the first version of `sineWave()` generated a fresh buffer per call
(`t` always starting at 0). Called in a loop across many hops, this
restarted the waveform's phase at every hop boundary -- a real phase
discontinuity, which is broadband noise, injected once per hop. The
measured centroid came back at 2156Hz, over double the true frequency.
A companion test ("higher tone gives a higher centroid") passed anyway,
since the artifact skewed both tones' measurements in the same direction
-- only the exact-value test caught it.

**Fix:** generate one continuous buffer spanning every sample needed (or
thread a running sample-count offset through repeated calls) so phase
never resets mid-signal. General principle: when synthesizing a periodic
test signal across multiple calls/chunks for spectral or DSP testing,
continuity of phase across the boundary matters as much as the signal's
content within each chunk -- and a relative/comparative assertion can stay
green while an absolute one would have caught the same bug, so prefer
checking an exact expected value somewhere in the suite even when a
looser comparison is what the feature ultimately cares about.

---

## A reference implementation's own missing validation can be harmless there and a real crash risk once the same data reaches different downstream code
Tags: processing, porting, validation, getsubimage
Applies-when: reusing reference data with a different downstream consumer

Porting huenicorn's real `ScreenWidget.js` (`Handle.setPosition`) for the
WebUI's Zone Mapping screen, read in full before porting rather than
summarized: it clamps a dragged corner only to the screen's own pixel
bounds, never against the *opposite* corner. Dragging a corner past its
sibling there just produces a rectangle with negative width/height in SVG
-- visually broken, but not a crash, since nothing downstream in huenicorn
asserts the rect is well-formed before using it. `Processing::
ImageProcessing::getSubImage` (Aurora's own, unrelated to anything
huenicorn-specific) has no such tolerance: it builds a `cv::Range(a, b)`
directly from `uvs.min`/`uvs.max`, and OpenCV requires `a <= b` for a valid
Range -- an inverted UV rect reaching this function is a real crash risk on
the daemon process, not a cosmetic glitch, confirmed by reading
`getSubImage`'s real implementation rather than assuming a UI-only
consequence.

**Fix:** the WebUI's own port of the drag logic clamps every corner to a 2%
minimum rect size measured from the opposite corner, so an inverted UV rect
can never be constructed client-side in the first place -- a deliberate
improvement over the reference implementation's own real behavior, not a
blind port of it. General principle: reading a reference implementation's
real source (this session's own established discipline) verifies it does
what it's *described* to do, but doesn't by itself prove the same behavior
is safe once the data it produces reaches *this* codebase's own downstream
consumers -- a missing bounds/invariant check can be dormant-safe in the
source that never asserts on it, and become a live crash risk the moment
the ported code feeds a different, less forgiving consumer. Worth an
explicit second question when porting a UI interaction that produces
structured data (a rect, a range, an index): "what does *my own* downstream
code assume is always true about this value, and does the reference
implementation actually guarantee that?" -- not just "does this look like
what the reference does."

---

## Two UI elements reported as "one hiding the other" can share the exact same default coordinates rather than suffering a genuine z-order bug
Tags: processing, zonemap, defaults, debugging
Applies-when: diagnosing overlapping zones or elements

A live report that switching entertainment configurations left one zone
("zone 5") visually and functionally hiding another ("zone 4") looked at
first like a z-order or click-target bug in the Zone Mapping canvas. The
actual cause was upstream and data-only: `ZoneReconciler::reconcileZoneMap`
gives any zone with no saved mapping yet the same default `ZoneConfig`
(`{0,0}`-`{1,1}`, the full canvas), so on a freshly-selected entertainment
config with no prior manual dragging, every one of its zones' rects, tags,
and click targets land on the exact same pixels. Only the topmost DOM
element could ever receive a click -- the rest weren't occluded by a
rendering bug, they were genuinely indistinguishable data rendered
correctly.

**Fix:** confirmed directly by reading the real live `hue.json` before
touching any rendering code at all -- every zone at identical default
coordinates, exactly as the theory predicted, no code change needed to
confirm it. General principle: before treating "two elements are visually
or functionally indistinguishable" as a z-order or event-handling bug,
check whether the underlying data actually differs between them at all --
a default/uninitialized-state collision produces the identical symptom to
a genuine rendering bug, and is far cheaper to rule in or out by reading
the persisted data directly than by debugging paint order or hit-testing.

---

## `AnalyserNode`'s frequency-domain getters return dB with internal smoothing baked in, not linear magnitude
Tags: web-audio, dsp, demo-web
Applies-when: feeding AnalyserNode frequency data into DSP math

Hit in `Aurora-Demo-Web` hand-rolling onset/RMS/spectral-centroid extraction
against the Web Audio API instead of aubio-via-WASM (see `AudioAnalysis.md`).
The ported math assumes linear magnitude, same as aubio's own spectrum data —
but `AnalyserNode.getFloatFrequencyData()`/`getByteFrequencyData()` don't
return that. Checked the real spec's own algorithm order, not assumed:
Blackman window → FFT → **smoothing over time** (`smoothingTimeConstant`,
default 0.8) → **convert to dB**. Feeding dB straight into linear-magnitude
math would have produced a nonsensical centroid, and the default smoothing
would have stacked with a hand-rolled onset detector's own rolling-average
history, blunting real transients below its detection threshold.

**Fix:** convert every bin back to linear via `10**(dB/20)` before use, and
explicitly set `smoothingTimeConstant = 0` on the `AnalyserNode` feeding any
hand-rolled temporal smoothing rather than trusting its default. General
principle: a convenience API can bake in several non-obvious processing
steps (windowing, temporal smoothing, unit conversion) before ever handing
back data — check what a "get me the data" method actually returns, not
just that it returns something shaped right.

---

---

## A synthetic test signal needs the same preprocessing the real pipeline applies, or a correct implementation can still fail its own test
Tags: dsp, testing, windowing
Applies-when: writing synthetic-signal tests for DSP code

Testing a hand-ported spectral-centroid function against a synthetic 1000Hz
sine wave (via a small hand-written DFT) initially failed by 3x — not a bug
in the centroid formula, but in the test's own DFT helper: a raw, unwindowed
sine wave over a fixed-length buffer has real spectral leakage whenever the
frequency isn't an exact integer number of cycles within that window,
smearing energy into high bins a magnitude-weighted centroid is highly
sensitive to. The real pipeline (`AnalyserNode`, and aubio's own phase
vocoder) never actually produces unwindowed spectra — both window before FFT.

**Fix:** applied the real Blackman-window coefficients (verified against the
spec, not guessed) to the test's synthetic signal before computing its DFT,
matching what the real pipeline actually hands the function under test.
General principle: a synthetic-signal test for DSP code needs to reproduce
the real pipeline's own preprocessing, not just the mathematically "pure"
input — otherwise a test failure (or worse, a false pass) can reflect the
test's own fidelity gap rather than the code actually being tested.

---

---

## Brightness lag reads as "boring"/unreactive far more than hue lag, when tuning a beat-reactive light response
Tags: demo-web, audio-effects, tuning
Applies-when: tuning beat-reactive smoothing time constants

Building `Aurora-Demo-Web`'s audio-reactive color model, A/B/C testing a
ported `updateDrift`/`updateBounce` against native's own listening-tuned
defaults (`bounceSmoothTime`/`brightnessSmoothTime` both 0.45s, tuned for
real Hue bulbs) showed the ported version reading as noticeably "boring"
on a screen. Uniformly speeding up every time constant wasn't the right
framing — the fix that actually mattered was specifically speeding up
`brightnessSmoothTime` (0.45s → 0.08s) while leaving hue's own smoothing
comparatively slow. A viewer's eye reads a delay between an audible hit
and a visual brightness punch far more readily than it reads a
slightly-lagging color/hue shift, which just naturally reads as smooth
ambient motion instead.

**Fix:** when a beat-reactive visual feels sluggish, check which signal's
damping is actually driving that impression before uniformly speeding up
every time constant — brightness/intensity is usually the more
perceptually load-bearing one for "does this look reactive," while hue can
stay slow without costing the same feeling of responsiveness. Relevant if
this tuning is ever backported to real bulbs (see `BrowserAnalysis.md`'s
A/C follow-up) — worth confirming the same asymmetry holds physically, not
just on a screen.
