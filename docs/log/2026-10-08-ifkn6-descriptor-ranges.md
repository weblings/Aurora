# Aurora-ifkn.6 closed: gen-descriptors.py emits Tuning slider ranges

Id: ifkn6-descriptor-ranges

2026-10-08. Vendor step 6 of the demo re-vendor (parent bead `Aurora-ifkn`,
child `Aurora-ifkn.6`). `vendor/webui/gen-descriptors.py` now emits the
backend's full `/api/descriptors` payload shape -- `{key, kind, description}`
plus `param: {label, min, max, step, unit, default, allowsUnset}` for the
twelve core video/audio sliders -- instead of key/description pairs, and
`descriptors.json` was regenerated (29 entries, 12 ranged). Param defaults
resolve from `Config.hpp` in-class initializers, the same single source the
C++ tables read via `defaults()`; floats serialize in float32-shortest form
mirroring the backend's `shortestDecimal`, so `0.01f` goes out as `0.01` and
integral values keep the backend's trailing `.0` (`8000.0`).

## Verification (independent oracle, not self-comparison)

- Compiled a throwaway probe against the real C++ sources (core tables + Hue
  + both Input tables through `DescriptorRegistry::toJson`, the exact merge
  `app/linux` serves): all 29 keys match and **0 entries differ** between the
  native dump and the regenerated fixture -- kinds, descriptions, labels,
  ranges, steps, units, defaults, `allowsUnset`.
- `AuroraControlDescriptorTests` green (75 assertions, 6 cases; no C++
  changed, confirms the backend side of the contract).
- Extended `web/demo/demo-shim.test.mjs`: params ride only on sliders
  (backend precedent -- `zones.gamma` is slider kind with no param), shape
  invariants (numeric min/max/step/default, `min < max`, default in range
  unless `allowsUnset`), and every Tuning slider the demo renders resolves to
  a ranged param. Mutant-checked (deleted `param` fails the suite).
- Full web loop green (27 suites); regen is byte-deterministic (re-ran, same
  diff); `demo-tuning` mapping tests pass.

## Surprises

- The float pattern missed `2.f`-style literals (trailing dot, no decimals):
  all twelve sliders silently fell through to the plain parse and the regen
  wrote 17 param-less entries with no error. New entry in
  [[lesson-language-cpp]] (accept empty fractions; assert parsed counts).
- A per-source accumulator reset (`short = {}` inside the file loop) wiped
  the float-shortening table on the last (param-less) source -- same silent
  shape: valid JSON, wrong numbers. Caught by eyeballing the regen before
  trusting it.
- `zones.gamma` is `slider` kind with no `param` in the real backend, so the
  first draft's slider-implies-param invariant failed against a legal
  fixture; the test now asserts param-implies-slider instead.
