# Aurora-c0g: tuning edits apply to the running pipeline without a reload

Id: c0g-live-tuning-apply

Node prep 7 ([[node-graph-pipeline]]). Every `PUT /api/config` used to rebuild
the whole pipeline, including the Hue DTLS handshake (1-3s on real hardware).
Prerequisite: Aurora-d6i7 ([[d6i7-config-writer-race]]), which made config
writes atomic. Builds on the shared reload path from Aurora-9ig
([[9ig-pipeline-to-core]]).

## Design

- `Pipeline::applyConfig` diffs the Config the running pipeline was built from
  (not disk) against the new one. Video holds the post-derivation values.
- `ConfigApply` (new, `core/Runtime`): one table keyed by persisted field name,
  each field Hot, Reload or NoEffect, plus the mode a Hot field is read in.
  Deviates from the bead, which said to carry it in `ParamSchema`: that only
  describes numeric sliders, not the dropdowns or structural fields. An
  unclassified field reloads; a test checks every key from `configKeys()` has
  a row.
- Hot: `transitionSmoothing`, `interpolation`, `refreshRate`, `subsampleWidth`
  (video) and the 11 `audio*` fields (audio). A hot field in the other mode,
  and `nuxCompleted`, change nothing and do not reload. Any reload field in the
  patch reloads everything. A change to or from 0 on `refreshRate` or
  `subsampleWidth` (0 = derive from the display) reloads.
- Audio: `AudioOrchestrator::setSettings` swaps the struct. Only
  `fixedAnchorHue` is not read fresh each tick (it seeds drift state at cold
  start), so a change to a new hue also resets drift and bounce state and the
  color snaps. Clearing it keeps the current anchor.
- Video: `Orchestrator::setConfig`; `refreshRate` updates the pipeline's tick
  interval (all three tick loops re-read it every iteration);
  `subsampleWidth` calls `setCaptureWidthHint` after the host lock is
  released, since the Mac SCK call can block up to 5s. `m_changeMutex` stops a
  reload swapping out the pipeline while that call runs.
- `applyConfigFromDisk` is the settings PUT callback in all three apps. POST
  /api/reload and Hue pairing keep `reloadPipelineFromDisk` (always rebuild:
  pairing changes credentials, not Config).

## Findings

- `setRefreshRate` clamps to >= 1, so a PUT cannot set it to 0; 0 reaches a
  Config only from a loaded file.
- A PUT that changes nothing, or only `nuxCompleted`, no longer reloads at all.
- Audio drift fields (`driftBaseRateDegPerSec`, `centroidStrength`,
  `centroidRangeHz`) apply correctly but show no output change until
  Aurora-7r3 (bounce never follows the anchor).
- My first mutation check hung: a `std::async` probe in the lock test deadlocks
  when the bug is present. Interrupted, it left both mutations in the source;
  found by grep and restored from backups.

## Verification

- Mac core: 150/150 (17 new: classification and planning, `ConfigStore` key
  diff, three `AudioOrchestrator::setSettings` cases, host cases including
  no re-init, failed-reload retry, and hint-outside-lock). Mutation checks:
  hint called under the lock, and the re-anchor reset removed; both tests
  failed (the lock test in 2s, not a hang).
- Mac app builds; ctest in that tree 60/60.
- Live, fake Hue bridge, `dummy` input at 60 Hz: hot PUTs (`transitionSmoothing`,
  `refreshRate`, `subsampleWidth`) return in ~2ms with no bridge traffic; an
  identical PUT likewise; `activeOutputNames` change returns in ~20ms and the
  bridge sees the stream go inactive then active (7 log lines). `refreshRate`
  60 -> 30 -> 60 moved the SSE frame rate 100 -> 53 -> 100 per 2s. Hot edits
  survive a later reload.
- Not verified: Linux and Windows apps (same one-line change in each; CI runs on
  PRs only); the app log (empty from stdout buffering, so the "Config applied
  live" line was not read); the Mac SCK capture-width path (`dummy` ignores the
  hint); audio mode live; `refreshRate` on real Hue hardware.

## Follow-ups

- Whether sliders PUT while dragging: Aurora-vzz7.
- Real-hardware check of live `refreshRate` and the SCK hint: Aurora-k0sx.
- Aurora-vf1.2/vf1.4 (reuse Hue output across reload): revisit, structural
  reloads still pay the handshake. Aurora-cgr's lock contention is unchanged.

## Docs changed

- [[node-graph-pipeline]]: status note, UX paragraph, prep 6 text, new prep 7.
- `TuningFields.js` header comment; historical note in an
  architecture-process lesson.
- Lessons: "Diff a live change against what the running thing was built from"
  (architecture-process.md); "Range-for over `json.items()` of a temporary
  dangles" (language-cpp.md); the d6i7 test-technique entry extended
  (debugging-method.md).
