# Aurora-52oz.3: per-session drafts and validate (closed)

Id: 52oz3-drafts-and-validate

C2 of [[sequence-c-planning]]. Core suite 382/382 on Windows Debug. The Linux,
Mac and Windows apps got the same `main.cpp` registration line, none rebuilt.

## Built

- `Graph::loadGraph` collects every node, edge and controls problem in
  `LoadResult::issues` (`{node, message}`), with `error` still the first
  message. Top-level shape problems (not an object, version, nodes) stop at the
  first. A node with its own problem is skipped by later checks, so edges and
  controls naming it add no follow-on errors. Cycles report one issue per
  blocked node (`Graph::finalize` gained an optional node list).
- `DraftStore`: in memory, one draft per session id `[A-Za-z0-9_-]{1,64}`.
  Defaults 16 drafts, 256 KiB each, 1 h idle. Reads count as use. A full store
  refuses a new session (429) instead of evicting someone's draft.
- Routes: `PUT/GET/DELETE /api/graph/drafts/<session>` and
  `POST /api/graph/validate`, all `{"graph": {...}}` bodies. Answers carry
  `valid` and `errors: [{node|null, message}]`. A draft saves even when invalid
  and GET re-validates it against the current outputs.
- Access: `addWriteRule` for `/api/graph/drafts` and `/api/graph/validate` at
  `draft`. GET of a draft keeps `read`. Loopback is trusted as before.
- `registerDraftRoutes` returns the store for C3 (apply) and C5 (preview).

## Decisions

- Refuse-when-full over LRU eviction: an agent that lost its draft silently is
  worse than one told to delete an old session or wait for idle expiry.
- Validation uses the same registry and output names a load would, so a draft
  that validates is not rejected at apply for naming a removed output.

## Lessons

- none
