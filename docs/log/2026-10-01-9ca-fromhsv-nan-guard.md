# Aurora-9ca: NaN/Inf into Color::fromHSV's uint8_t cast — fixed

Id: 9ca-fromhsv-nan-guard

Closed `Aurora-9ca` (P2, 1.0.4). `PUT /api/config {"audioCentroidRangeHz": 0}`
divided in `updateDrift` (`centroidDelta / settings.centroidRangeHz`,
`core/AudioProcessing/src/AudioProcessing.cpp:103`);
NaN survived `wrapDegrees`' `fmod` into `fromHSV`, where every `hPrime < N`
branch is false for NaN and `static_cast<ChannelDepth>(std::round(NaN))` is
UB — before `Smoother` ever sees it, as diagnosed in
`2026-09-30-node-graph-planning.md` ("Bug found along the way:
`Aurora-9ca`" section).

## Fix (two layers)

- Setter: `setAudioCentroidRangeHz` clamps to `[100, 8000]` (Tuning slider
  range), non-finite resets to default — `Config.cpp`, comment on the
  declaration in `Config.hpp`. `std::clamp` alone wouldn't do: it passes
  NaN straight through (see the "`std::clamp` passes NaN straight through"
  lesson in `docs/lessons/language-cpp.md`).
- Consumer: `fromHSV` returns black on non-finite input and clamps each
  channel to `[0, Max]` before the narrowing cast (over-range floats are
  the same UB class) — `Color.hpp:103-135`. Needed because
  `ConfigStore::fromJson` writes `ConfigData` direct, bypassing setter
  clamps — hand-edited `config.json` stays a live path (see the "second
  write path" lesson in `docs/lessons/architecture-process.md`).

## Verification

- New: setter-clamp case in `RuntimeTests.cpp` (0 → 100, negative → 100,
  huge → 8000, NaN → 2250); `fromHSV(NaN/Inf)` → black plus a
  setter-bypassing zero-range drift→bounce → defined black in
  `AudioProcessingTests.cpp`.
- Full core suite via venv cmake (system cmake absent — see the
  "rebuilding after a toolchain loss" lesson in
  `docs/lessons/build-toolchain.md`):
  `ctest --test-dir build/core-tests`, 75/75 pass, incl. existing
  palette round-trip tests covering the touched cast site.
