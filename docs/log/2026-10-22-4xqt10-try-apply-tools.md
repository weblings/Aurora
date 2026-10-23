# Aurora-4xqt.10: try and apply tools (D4)

Id: 4xqt10-try-apply-tools

D4 of [[sequence-d-planning]], on the draft tools from [[4xqt9-draft-tools]].
24 adapter cases pass (225 assertions).

## Built

- `try_on_lights` starts the test and a heartbeat thread (own connection, at
  the server's `heartbeatMs`). The thread stops on `keep`, `revert`, a 404
  heartbeat or shutdown. A killed adapter stops beating and Aurora reverts.
- `keep {id}` confirms the test, which also applies the effect. `apply {id}`
  applies without a test. Both report `effect != id` or `reloadError` as
  `isError`.
- `revert_effect` restores `activeEffectId` as read before this session's
  first apply (empty means the default).
- `aurora_status` adds `configuredInputs` (what the user chose, from
  `/api/config`). `try_on_lights` and `preview` turn "needs an audio input
  but none is configured" into "ask the user to choose one in Aurora".
- `devstack.py up --audio-input` opts the stack into an audio input. Off by
  default, so the stack still matches a video-only user.
- Every adapter request carries `X-Aurora-Client: mcp`. All five tools carry
  `readOnlyHint` false.

## Verified (Windows, fake-Hue stack, `--input dummy` plus audio input)

- Without `--audio-input`: `configuredInputs.audio` null, both-input preview
  and test give the ask-the-user message. With it: preview reacts, test starts.
- Scripted stdio client: both-input preset tried from video-live, still
  active at 30 s, `keep` set `mcpEffectId`. Adapter killed mid-test ended as
  `heartbeat_lost`. `revert_effect` went from `mcp-a` back to the default.

## Not verified

- A real fallback on apply (only unit tested), Mac and Linux.

## Lessons

- Aurora only captures inputs the user chose, so a video-only user cannot
  preview or test an audio graph, and `inputs` in status (what runs) could not
  show that. An agent needs the configured set, and the stack must not hide
  that state by default.
