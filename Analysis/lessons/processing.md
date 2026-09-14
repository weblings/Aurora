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
