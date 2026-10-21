# Aurora-4xqt.1 (D0a): input-only rebuild keeps outputs, preview owns its extra inputs (paused)

Id: 4xqt1-input-rebuild-keeps-outputs

D0a of [[sequence-d-planning]]. Code and core tests done, core suite 415/415 on
Windows Debug, then 420/420 on the WSL tree after the input carry-over below.
Bead stays open: the Mac and Linux capture rechecks and gate runs are not yet
shown (see Resume).

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
- Input carry-over (second pass): `reloadInputs` also reuses an input the running
  pipeline has open, so a test start or revert reopens no screen capture (a
  Wayland picker, a Mac stream start). `PipelineBuildOverrides::inputsFrom`;
  `build` borrows a video input only when input name, monitor, a non-zero
  subsample width and the audio sink all match the running pipeline's applied
  Config, else opens a fresh one. A borrowed video input skips `init`, monitor
  selection and the width hint (`GraphRunner::init(videoReady)`). `adoptInputsFrom`
  moves ownership at the swap, like outputs.
- Parking: a test (`graph != nullptr`) keeps an input its graph does not use open
  in `m_parkedVideo`/`m_parkedAudio`, so the revert takes it back. Without it an
  audio-only test from a video-live state closed the capture and the revert
  reopened it. A revert and a plain reload do not park.

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

- Gate (Sequence D additions, `sequence_c_gate.py`, 9 steps): the fake bridge
  serves `GET /dev/stream-counts`, a start per Hue output init. The both-input
  step previews the both-input draft from a video-live state, then asserts the
  counts hold still across test start and revert (a plain `/api/reload` moves
  them 1 to 2 starts and 0 to 1 stops, run as a control), applies with
  `X-Aurora-Client: mcp` and checks `mcpEffectId`, and the restart step checks
  it survives (D0b). A new step asserts the preview summary reads a dark draft
  as still (change 0.000) and an LFO draft as reacting (change 0.214, spread 0.93)
  (D0e).

## Findings

- Zone edits landing between the build and the swap are lost to the new runner's
  copy of the zone map (it loaded at build). Window is the capture-init time.
- Gate 5/8 steps ran on Windows with the first pass. `audio reaches the lights`
  failed identically on the unmodified code on this box (last quiet level 1.0 and
  0.42): the loopback capture hears whatever else is playing. A rerun with the
  box quiet passed 9/9 (tone 1.00, quiet 0.03 twice), so that was the box.
- The fake-Hue stack cannot show a reopened screen capture, only outputs (stream
  counts). Input reuse is shown by the core tests (open and close counts on the
  fake inputs, no width hint). The Wayland picker needs a real portal, or
  `tools/fake-xdg-portal` counting CreateSession calls.

## Lessons

- none

## Resume

- Rebuild the app on Mac and Linux (three app `main.cpp` files changed in the
  first pass, never rebuilt there) and run the gate: expect 9/9 on a quiet box.
- Per-OS capture recheck when a preview adds video: Wayland portal prompt on
  Linux, macOS screen permission, Windows second duplication of the monitor.
  Still opens a new capture by design: a preview needing video while audio is
  live, and a test needing video from an audio-live state (the revert then
  closes it). On Wayland each shows the picker until `Aurora-w6no` stores the
  restore token.
- Mac: a both-input test from video-live should show no screen-recording
  restart and no new TCC prompt, only the audio input opening.
- Then `bd close Aurora-4xqt.1` with the INDEX row updated to closed.
