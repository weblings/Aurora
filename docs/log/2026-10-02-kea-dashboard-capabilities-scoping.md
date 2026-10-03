# Aurora-kea: scoping pass on Dashboard capability-driven sections (paused, no code)

Id: kea-dashboard-capabilities-scoping

Question asked: how does the Dashboard adapt to video, audio, both or neither?
Answer: it doesn't yet. Aurora-kea is still open and unstarted; this entry
records the scoping, not an implementation.

## Findings

- Today `DashboardScreen.mode` is `'audio'` only when `activeInputName` is
  empty and `activeAudioInputName` is set; everything else, including nothing
  active and both set, is `'video'`. `/api/capabilities` reports what the
  build supports (`inputs`, `audioInputs`, `outputs`, `platform`), not what
  the running pipeline uses.
- `mode` gates more than section visibility: the monitor fetch, the sink
  field (also gated on `audioInputs.includes('linux-audio')`), Zone Mapping,
  the audio permission banner, `TuningFields`' field set and config patch,
  the config write in `_onDeviceFieldChange`, `_switchMode`'s patch, the audio
  status poll, and the Zone Mapping empty-state copy ("needs ... Video mode").
- The doc ([[node-graph-pipeline]], "UX: effects, tuning, tooltips") already
  targets a mixed effect showing both pickers, but nothing owned the Effect
  picker, the `controls`-driven Tuning, or an all-false state. The doc has no
  design for a graph with no source.
- Aurora-o13 (both captures at once) excludes UI and config shape, so the
  both-inputs config shape was undefined anywhere.
- None of the gaps blocks kea. Today's pipelines have exactly one input, so
  kea can keep the all-false fallback (monitor picker) and derive flags from
  `Pipeline::isAudioMode()`.

## Changes

- Aurora-kea: acceptance widened to write paths, the status poll and the
  Zone Mapping copy; contract is independent flags with both-true valid,
  all-false keeping today's fallback. Notes record that
  `/api/{mac,linux}/audio-status` is not `audioDevicesUrl`.
- Filed, each blocked by kea: Aurora-t9iq (no-source Dashboard state),
  Aurora-kep2 (Effect picker replaces the toggle), Aurora-jpq2 (`TuningFields`
  from `controls`). kep2 and jpq2 also need a graph runtime/format that has no
  issue yet; kep2 also wants o13. Neither link is recorded in beads.

## Resume

Start Aurora-kea from its widened acceptance. Decide whether the flags land on
`/api/pipeline` or `/api/capabilities` (the Linux main comments say that route's
heartbeat is deliberately lock-free). `bd export` before committing the bead
changes.
