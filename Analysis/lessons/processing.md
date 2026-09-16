# Processing / color-effect-transform lessons

Color/effect transform and zone-mapping specific gotchas. See
[`README.md`](README.md) for how entries get routed here vs. elsewhere.

---

## Generating a periodic test signal fresh per call, instead of continuing its phase, injects broadband noise a relative-comparison test can miss

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
