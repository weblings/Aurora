# Sequence D planning: MCP for graphs, gaps first, epic filed

Id: sequence-d-planning

Planning session, no code changed. Sequence C (`Aurora-52oz`) closed with its
gate 8/8 on all three OSes, so Sequence D of [[nodes-agent-ux]] was scoped
and filed.

## Done

- **Epic `Aurora-4xqt`** (P3, labels `1.1.3`, `node-graph`), twelve children.
  D0a to D0f close gaps C accepted, D1 to D6 build the adapter, its tools and
  the gate. Order lives in bead dependencies.
- `Aurora-5ipy.10` (EC 6a) now depends on D1: D owns the adapter skeleton,
  6a's control tools land on the same binary later.
- Docs updated: [[nodes-agent-ux]], [[external-control]].

## Decisions (owner approved)

- **Razor:** D's goal is a working MCP setup for graphs. D does not wait on
  EC 5 (`/api/v1`) or `Aurora-m2c`: the adapter is in-repo, so an API change
  and its adapter fix land together, and graph apply does not use the
  Dashboard mode toggle path m2c is about.
- **Hand-rolled C++ adapter** in `adapters/mcp`, stdio, in the superbuild.
  No official C++ MCP SDK exists, community C++ libraries are early or pinned
  to the 2024-11-05 spec, and Python or TypeScript SDKs need a runtime the
  app does not ship ([[external-control]], "Where adapters live"). Revisit
  the official Go SDK if D needs elicitation or the HTTP transport.
- **D0 first:** C's accepted gaps are worked through before the tools.
- **MCP effect toggle:** a third Dashboard toggle, hidden until the first
  graph applied through MCP, then persisted across restarts and always
  pointing at the most recent MCP-applied graph. Effect picker (`Aurora-kep2`)
  and source-less graphs (`Aurora-t9iq`) stay in Sequence E.

## Agent-proposed, not asked

- Applies carry a client marker header so the server can tell MCP applies
  apart, stored as `mcpEffectId` in config.
- The confirm window extends while heartbeats continue, up to a cap (start
  at 120 s), instead of a fixed 15 s.
- Preview summary (per-zone mean, brightness range, change) and preset
  filling live in core routes, so the adapter stays a thin passthrough plus
  a heartbeat thread and the previous-effect record.
- The agent skill ships as the server's `initialize` instructions, so it
  works in any MCP client. A scored eval corpus moves after D. D5 runs a
  short manual eval instead.

## Findings

- Preview refuses the same graphs test does: both need the live pipeline's
  input set (`Pipeline::openPreview`, `Pipeline::swapEffect`). From a
  video-live state no audio or both-input graph can be previewed or tested.
- The root is that `Pipeline` owns inputs and outputs and rebuilds both, so
  any input change re-handshakes Hue. One fix (D0a) unblocks preview and test.
- `validateGraphDoc` returns only `node` and `message` per issue.
- Prior art (2026-10-21, web): Hyperion has no MCP server, and WLED's is a
  community Python server with a raw JSON passthrough tool. The closest
  patterns come from node-graph servers. Comfy-Org's `comfy-mcp`
  (AGPL-3.0 or commercial, read for patterns only) has templates with
  slots, and validation returns `valid:false` as a normal result with
  per-node codes and valid options. It also uses handshake instructions,
  consent only the user can grant, and compact paged output. The MIT
  TouchDesigner servers use a bridge inside the app, look up a parameter
  before setting it, and batch edits. Home Assistant servers keep tool
  output compact, because tool definitions use context.

## Lessons

- none

## Carried forward

- First work: D0a to D0e in parallel, and D1 can start beside them.
- Measure `GET /api/nodes` size in D2 before fixing the compact list budget.
