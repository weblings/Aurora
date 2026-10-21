# Aurora-52oz.2: pipeline builds inputs from the graph's source nodes (open)

Id: 52oz2-graph-source-inputs

C1 of [[sequence-c-planning]]. Core suite 377/377 on Windows Debug. Open until the
Mac and Linux capture recheck is noted here.

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

## Still owed

- Mac and Linux: confirm a both-input graph ticks with both captures.
  Aurora-o13 already showed the captures coexist on all three OSes.
