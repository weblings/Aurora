# Aurora-5y0: 9ca follow-up — NaN state self-heal, one float→Color cast

Id: 5y0-nan-state-self-heal

Closed `Aurora-5y0` (P2, 1.0.4). A review of [[9ca-fromhsv-nan-guard]]
against [[node-graph-pipeline]]'s fail-state section found three gaps in
that fix.

## Gaps and fixes

- **Poisoned state stuck for the session.** 9ca made the output defined
  but not recovered: a 0/0 in `updateDrift` left `DriftState`'s anchor NaN
  forever (`NaN + x`, `fmod(NaN)`), so lights stayed black until restart —
  and 9ca's own test asserted that black. Fix: `updateDrift` guards the
  divisor (`std::max(centroidRangeHz, 1.0f)`, like `referenceRms`), and
  both `updateDrift`/`updateBounce` reset to cold-start state when any
  field is non-finite (`AudioProcessing.cpp`).
- **Two float→`uint8_t` cast sites, one guarded.** `Smoother.cpp` had its
  own `fromNormalized` (`glm::clamp` passes NaN). Now one
  `Color::fromNormalized` (non-finite → black, clamp, round) in
  `Color.hpp`; `fromHSV` and `Smoother` both use it. Rounding unchanged
  for in-range input (`std::round` vs. the old `+0.5f` truncation agree on
  non-negatives).
- **Load path skipped clamps.** `ConfigStore::load` now re-applies
  `setTransitionSmoothing`/`setAudioCentroidRangeHz` over `fromJson`'s
  output. Stopgap: the real fix is the C++ param schema, prep item 1 in
  [[node-graph-pipeline]].

## Verification

- `AudioProcessingTests.cpp`: 9ca's zero-range test rewritten to expect a
  finite anchor and a lit color; new NaN-seeded drift/bounce recovery
  test; new `fromNormalized` guard/clamp/round-trip test.
- `RuntimeTests.cpp`: `config.json` with range 0 and smoothing 5 loads as
  100 / 0.97.
- `cmake --build build-core-test && ctest --test-dir build-core-test`:
  78/78 pass.

## Also this session

- `bd import` synced the live DB with the committed export (9ca had
  shown OPEN despite being closed in `issues.jsonl`).
- [[node-graph-pipeline]] gained "Prep work before importing libraries"
  and a corrected fail-state section (sanitize at float→`Color`, stateful
  nodes self-heal).
- Lesson: "Guarding a NaN at the output doesn't un-poison the state that
  produced it" (`language-cpp`).
