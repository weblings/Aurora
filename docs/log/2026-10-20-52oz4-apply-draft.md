# Aurora-52oz.4: apply a draft as the live effect (closed)

Id: 52oz4-apply-draft

C3 of [[sequence-c-planning]]. Core suite 388/388 on Windows Debug. The three
app `main.cpp` files got the same registration, none rebuilt.

## Built

- `POST /api/graph/apply {"session", "id"}`: validates the session's draft
  (same check as the draft routes), writes `effects/<id>.json` (new or existing
  id), sets `activeEffectId`, then applies. The draft is kept. Refusals (400,
  404, 422 with per-node errors, 500) change nothing on disk or live.
- Access: `addWriteRule("/api/graph/apply", Apply)`. Draft token gets 403.
- `Pipeline::swapEffect` / `PipelineHost::applyEffect`: swaps the graph in the
  running pipeline through `GraphRunner::swapCustomGraph` (`adoptStateFrom`),
  so outputs are not re-initialised. Refuses, and the caller reloads, when
  anything but the effect id differs from the running Config, the graph wants
  other inputs than the open ones, the graph fails to load, or dev
  dual-capture is on. Clears only the `effect_fallback` entry.
- `applyEffectFromDisk` is the callback the apps pass: swap, else
  `reloadPipelineFromDisk`. Reload is forced because re-applying an existing id
  leaves an empty Config diff.
- `ReloadCoalescer` moved out of `SettingsRoutes.cpp` to its own header. Apply
  has its own instance, so apply and settings saves do not coalesce with each
  other (the host locks still serialise them).
- `Pipeline::build`'s mode choice is now `_planMode`, shared with `swapEffect`.

## Decisions

- A valid graph that needs an unconfigured input still answers 200 and falls
  back through the reload path, with `effect` differing from `id`.
- The swap test asserts no output re-init and a 250 ms bound against a 300 ms
  per-init delay, not wall-clock alone.

## Lessons

- none
