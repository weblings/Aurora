# External control: bead sequence, overlap with nodes and HA

Id: external-control-beads

Planning session, no code changed. Follow-up to [[external-control-planning]]:
turned [[external-control]] into beads, mapped how that sequence overlaps the
node and HA sequences, and recorded three owner decisions. Decisions and
phasing live once in [[external-control]]; this entry records what changed.

## Done

- **Epic `Aurora-5ipy`** (P3, label `external-control`, agent-proposed, not
  committed; pause is the one owner-requested item). Children:
  - `.1` EC 0 open questions and cross-refs
  - `Aurora-3ddb` (Phase 1 pause, re-parented, P2)
  - `.2` EC 2a `GET /api/state` (after 3ddb)
  - `.3` EC 2b SSE events (after .2, `Aurora-cgr`)
  - `.4` EC 3 Host allowlist (P2; now blocks `Aurora-4zr.5`)
  - `.5` EC 4a pairing backend, `.6` EC 4b pairing WebUI
  - `.7` EC 5a global brightness gain, `.8` EC 5b coalesce structural writes
    (both added beyond the doc's phases)
  - `.9` EC 5 OpenAPI contract
  - `.10` EC 6a MCP, `.11` EC 6b MQTT C++ helper, `.12` EC 6c Muse skill
    (6a/6b also wait on `Aurora-kea`, `Aurora-m2c`, `Aurora-kwn`)
- **Edges added to existing beads:** `3ddb` depends on `Aurora-nzd`
  (pause takes the shutdown path); `Aurora-4zr.4` (HA restore on stop)
  depends on `3ddb`, with notes on both. `Aurora-kea` raised P2 to P1: it
  gates nodes (jpq2, kep2, t9iq), HA (d7s then 4zr.7) and EC 6a/6b.
- **`3ddb` description** gained two gaps from the doc: the paused flag lives
  in `PipelineHost::reload` (shared by saves, `/api/reload`, pairing), and
  the Dashboard serves zones and monitors from cache while paused.
- **Decision bead `Aurora-pngj`** (P3, `ha-prep`): zero-brightness policy
  for outputs where brightness 0 means off. Blocks `Aurora-cyw`, related to
  EC 5a; cyw's own black-frame step moved into it.
- **[[external-control]] edits:** c0g marked shipped (hot save ~2 ms vs ~20 ms
  reload); stream's first event is the current state; Non-goals section;
  status line points at the epic; brightness cross-refs to pngj.
- **[[home-assistant-output]]:** black-frame bullet pointing at pngj.

## Decisions (owner)

- The events stream sends current `state` as its first event.
- LAN pairing enforced with no opt-out (already decided 2026-10-02); a
  visible "trust this subnet" list only if users ask.
- **Non-goal:** no color or effect injection. Aurora's lights react to
  inputs (screen, audio); the control plane picks input, mode, zones,
  tuning, brightness and pause, never a color. Revisit only for graph
  external-value source nodes that still react.

## Findings

- **Hyperion `serverinfo` + `subscribe`** returns a snapshot and subscribes
  in one call. Separate GET + stream loses a change between them.
- **Hyperion local auth** is a setting (`isLocalAuthRequired`); admin auth
  is always required. Its priority mux (API color, effects, grabber by
  priority/timeout) is the thing the non-goal declines.
- **`backlightThreshold`** (`RgbTransform::applyBacklight`): a
  minimum-brightness floor in Hyperion's color stage, before any device,
  gray or colored. The precedent for pngj's floor option. Its order against
  the brightness adjustment was not checked.
- **Hyperion's HA device** sends `rgb_color` with fixed brightness (default)
  or luma-derived brightness; it has no black handling of its own.
- **Huenicorn 1.0.5** fixed credits flashing by adding the interpolation
  choice ("Area" fixes it), not smoothing. Smoothing arrived in its 1.2.0
  as a per-tick exponential mix in XYB, like Aurora's `Smoother`. Aurora
  already ports the setting and defaults to Area.
- **`kea` is the hub** across the three sequences; `cgr`, `kwn`, `m2c` gate
  events and adapters.

## Corrections made this session

- Said the Hyperion checkout had not been read for the external-control
  doc: wrong; the 2026-10-02 session read its code (see its lessons).
- Said Hyperion has no black-frame policy: wrong (`backlightThreshold`).
  Written into both docs and pngj, then corrected the same session.

## State and resume

- Uncommitted: the bead changes, [[external-control]], [[home-assistant-output]],
  this log, `INDEX.md`, lessons. Run `bd export -o .beads/issues.jsonl`
  before `git add`; the live DB is ahead of the export.
- Open: `Aurora-pngj` (the policy itself). `Aurora-3ddb` is still P2 though
  the owner called pause high.
- Offered, not done: a bead for asymmetric attack/release smoothing (only if
  real credits footage flickers on hardware); a tooltip warning that
  Nearest interpolation brings credits flashing back.

## Lessons

- "A state GET plus a separate event stream loses changes in the gap"
  (architecture-process.md).
- "Credits flashing is a downscale-interpolation problem, not a smoothing one"
  (processing.md).
- "A prior-art project's missing feature may live in another stage under
  another name" (planning.md).
