# Sequence C planning: decisions recorded, epic filed

Id: sequence-c-planning

Planning session, no code changed. Sequence B and the pairing work it waited
on (EC 4a, 4b, 4c) were closed, so Sequence C of [[nodes-agent-ux]] was
scoped and filed.

## Done

- **Epic `Aurora-52oz`** (P3, label `node-graph`, agent-proposed), children
  C0 custom effect storage, C1 inputs from the graph's source nodes, C2
  drafts and validate, C3 apply, C4 test on lights, C5 draft preview, C6
  Tuning on custom effects, C7 end-to-end gate. C2 depends on C0, C3 on C2
  and C1, C4 on C3, C5 on C2 and C1, C6 on C0, C7 on C4, C5 and C6.
- EC 5 (`Aurora-5ipy.9`) now depends on C3, C4 and C5, so `/api/v1` covers
  the final write routes. The stub's "public API contract" stays in the
  external lane rather than moving into C.
- Docs updated: [[nodes-agent-ux]], [[node-graph-pipeline]],
  [[external-control]].

## Decisions (owner approved agent recommendations)

- **Storage:** each custom graph is `effects/<id>.json`, and config gains
  `activeEffectId`. Built-ins keep fixed ids and today's config overlay.
  Switching to a custom happens over the API; the Dashboard keeps its
  Video/Audio toggle, and the Effect picker (`Aurora-kep2`) stays outside C.
- **Output names:** stored graphs name concrete outputs. D's presets become
  templates the server fills with the user's outputs. No frozen-format change.
- **Fallback warning:** a custom graph that fails to load runs the built-in
  and holds an `effect_fallback` banner entry, set after the fallback build
  because a successful build clears held errors. `GET /api/state` reports the
  requested and the running effect, so agents see it too.
- **Drafts:** one per client session id, saved even when invalid. One slot
  drives the lights, and a new test on lights ends the running one.
- **Preview:** C streams the draft's zone colors (`GET /api/graph/preview`).
  Per-node previews go to Sequence E.

## Agent-proposed, not asked

- Scopes: GETs need `read`, drafts, validate and preview need `draft`, apply,
  test on lights, effect switch and delete need `apply` (LAN only, loopback
  trusted). Paths are chosen so `PairingGuard::addRule` prefixes suffice.
- Test-on-lights defaults, tuned in C4: 15 s confirm window, 2 s heartbeat,
  revert after 6 s without one.
- A graph-only apply swaps the Graph in place with `adoptStateFrom`. Only an
  input or output change reloads, avoiding a Hue DTLS re-handshake.
- C1 is in C because applying an arbitrary graph needs both captures, which
  `Aurora-o13` proved on all three OSes.

## Findings

- Only built-ins run today: `GraphRunner::_load` picks Video or Audio by
  `m_isAudio`, and `Pipeline::build` builds one input.
- Non-GET routes need `admin` unless a rule says otherwise, so an
  `apply`-scoped token gets 403 on `PUT /api/config` until C adds rules.
- `web/graph-editor` already holds the React Flow build spike (`Aurora-lzj`).

## Lessons

- One end-to-end gate can retire several beads' open verification items at
  once: the C7 gate's per-OS runs closed the held-open tails of C1, C3, C4,
  C5 and C7 itself — no per-bead e2e reruns needed.

## Carried forward

- `Aurora-jpq2` (TuningFields from `controls`) looks covered by B4
  (`Aurora-id8j.10`). Close or rescope it.
- Last-known-good fallback for a live graph whose runtime errors persist is
  not in C.
- First work: C0 (`Aurora-52oz.1`) and C1 (`Aurora-52oz.2`) in parallel.
