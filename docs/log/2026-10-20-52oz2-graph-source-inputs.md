# Aurora-52oz.2: pipeline builds inputs from the graph's source nodes (closed)

Id: 52oz2-graph-source-inputs

C1 of [[sequence-c-planning]]. Core suite 377/377 on Windows Debug. Mac and Linux
capture recheck done (see Recheck), bead closed.

## Built

- `Pipeline::build` scans a custom graph's nodes for `video.capture` and
  `audio.capture` and builds the inputs they name.
- Both sources: video and audio inputs run in one `GraphRunner` through a new
  two-input constructor. Video stays primary for config, zones and monitors.
- One source: an audio-only graph runs in audio mode even with a video input
  named. A video-only graph runs in video mode.
- A source with no configured input runs the built-in, with `effect_fallback`
  reading "graph needs a video/audio input but none is configured".
- Built-ins and the `AURORA_DEV_DUAL_CAPTURE` spike take their old paths.
- Capabilities still come from the pipeline flags, so Dashboard sections derive
  as before (Aurora-kea).

## Decisions

- One runner for both inputs, not the spike's two runners. A graph can wire
  audio features into the video path, which two separate graphs cannot.
- Live audio tuning fields are skipped while both inputs run. A custom graph
  does not read them, and structural changes still reload.

## Recheck

- Windows: both-input graph applied and ticked with both captures via the
  Sequence C gate (`windows-audio` loopback), 8/8 with the audio step; the
  tone drove the lights (see [[52oz8-sequence-c-gate]]).
- Mac: same via the gate (`mac-audio`), 8/8, tone 1.00 / quiet 0.03-0.04
  twice — this closed the Mac half of the recheck.
- Linux: same via the gate (`linux-audio`, default-sink monitor), 8/8 on two
  consecutive runs, tone 1.00 / quiet 0.03 twice — this closed the Linux half.
- No capture conflicts on any OS; built-in parity fixtures unchanged (core
  suites green alongside); Dashboard sections still derive from capabilities
  (untouched code path).

## Lessons

- none new: the recheck passed on all three OSes with no new gotchas; the
  on/off/on stimulus method it relies on is filed under
  [[52oz8-sequence-c-gate]].
