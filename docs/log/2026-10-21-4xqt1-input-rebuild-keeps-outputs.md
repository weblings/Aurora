# Aurora-4xqt.1 (D0a): input-only rebuild keeps outputs, preview owns its extra inputs (paused)

Id: 4xqt1-input-rebuild-keeps-outputs

D0a of [[sequence-d-planning]]. Code and core tests done, core suite 415/415 on
Windows Debug. Bead stays open: per-OS capture recheck and the gate's audio
step are not yet shown (see Resume).

## Built

- `PipelineHost::reloadInputs(registry, config, root, graph*, err)`: builds a new
  `Pipeline` that borrows the running pipeline's outputs, then at the swap
  `adoptOutputsFrom` moves their ownership across. No `init`, no shutdown, so no
  Hue re-handshake. Borrowed only when the requested output list equals the
  running one (`m_outputKeys`), else fresh outputs and the old ones shut down as
  in `reload`. Moves `buildEpoch`, so previews end with `pipeline_gone`.
- `Pipeline::build` takes `PipelineBuildOverrides {graph, outputsFrom}`. `graph`
  runs in place of the Config's effect (test on lights): the summary still names
  the live effect, and a graph that cannot run throws instead of falling back.
- Test on lights: `start` tries `testGraph` in place, else `reloadInputs` with
  the draft. `revert` tries `restoreEffect`, else `reloadInputs` from disk, else
  the old full reload (paused). `LightTest::start` now reads the generation
  after the start hook, since the rebuild moves it.
- Preview: `PipelineHost::openPreview` takes the `Registry`. A source the live
  runner lacks opens for that preview alone (`openPreviewInputs`, outside the
  pipeline lock, `GraphPreview::Inputs`) and closes with it. Any source the
  live runner has is shared, so a same-device double capture never happens. A
  draft edit that adds a source the preview did not open gets `draft_invalid`
  ("reconnect the preview"). `registerPreviewRoutes` gained a `Registry&`
  argument, the three app `main.cpp` files updated (Mac and Linux not rebuilt).
- Gate: the both-input step asserted `409 cannot_test`. It now starts the test,
  checks the state, reverts, then applies as before.

## Decisions

- **Carry-over for test, preview-owned capture for preview.** Test must drive the
  lights, so its graph has to run on the live runner and the inputs must be
  rebuilt. A preview only reads, and rebuilding the live pipeline for it would
  leave the extra capture open after the stream ends and end every other
  session's preview.
- The rebuild holds `m_changeMutex` through the build (apply, pause, reload and
  `setError` wait, ticks do not) so the pipeline whose outputs are borrowed
  cannot be replaced meanwhile. Its failure is returned, not held as a host
  error.
- Apply's fallback reload still re-inits outputs (existing test asserts it);
  moving it onto `reloadInputs` is a one-line change if wanted.

## Findings

- Zone edits landing between the build and the swap are lost to the new runner's
  copy of the zone map (it loaded at build). Window is the capture-init time.
- Gate 5/8 steps run on Windows with the change. `audio reaches the lights`
  fails identically on the unmodified code on this box today (last quiet level
  1.0 and 0.42): the loopback capture hears whatever else is playing.

## Lessons

- none

## Resume

- Gate on a quiet box (nothing else playing): expect 8/8 on Windows, then rerun
  on Mac and Linux.
- Per-OS capture recheck when a preview adds video: Wayland portal prompt on
  Linux, macOS screen permission, Windows second duplication of the monitor.
- Then `bd close Aurora-4xqt.1` with the INDEX row updated to closed.
