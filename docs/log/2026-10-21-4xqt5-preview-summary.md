# Aurora-4xqt.5: preview summary route for agents (closed)

Id: 4xqt5-preview-summary

D0e of [[sequence-d-planning]]. Core pipeline suite 114/114 on Windows Debug.

## Built

- `GET /api/graph/preview/summary?session=<id>&seconds=<n>` (`PreviewRoutes.cpp`),
  read scope. Runs the draft on a preview of its own (key `<session>#summary`),
  so an open stream for the session is not replaced, and returns per output and
  zone: mean color, brightness min and max (largest channel) and a change measure
  (mean absolute step per sample across r, g, b).
- Duration: default 3 s, capped by `PreviewOptions::maxSummarySeconds` (10),
  sampled every `interval`. `PreviewOptions::sleep` lets tests step by ticking
  the pipeline, so time is virtual.
- Errors: `invalid_session` and `invalid_seconds` 400, `no_draft` 404,
  `cannot_preview` 422, `pipeline_gone` 409 (pause, rebuild or replaced).

## Verified

- A static graph reports change under 0.01, an lfo graph over 0.02 with a
  brightness spread over 0.2.
- Send count equals live sends only, so no preview color reaches an output.
