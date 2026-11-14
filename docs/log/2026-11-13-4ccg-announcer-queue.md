# Graph editor: a takeover is announced again when the shell's new row arrives in the same poll

Id: 4ccg-announcer-queue

`Aurora-4ccg` (P2). `graph-editor:gate` and `graph-editor` (edit-loop) both timed out waiting for "took the lights" after an agent session took the lights. Found while verifying Aurora-u8jx.1; the baseline on 54d6dbc6 showed edit-loop failing at the same step.

## What was found

- The editor's `useAnnouncer` emptied the live region and filled it 50 ms later; a second `announce()` inside those 50 ms cancelled the first.
- A takeover produces two in one poll: the heartbeat's 404 with `lastEnd: "replaced"` (App.tsx announces "Test ended: an agent took the lights") and the shell's new light-test row (ErrorShell.tsx announces "An agent is testing an effect on the lights."). The row won.
- Likely introduced with shell-row arrival announcements (Aurora-9hqa.2, ca9c75da). Found by probing the live region, not by bisecting.
- Core was right: the heartbeat answered `replaced` with the mcp holder.
- The earlier hypothesis, that the gate's missing agent heartbeat let the agent's test lapse, was wrong: edit-loop heartbeats and failed the same way.

## What changed

- `web/graph-editor/src/Announcer.tsx`: the timing moved into `announceQueue`; messages asked for before the fill are spoken together, in order, as `web/ui/shell.js` already does on the Dashboard.
- `web/graph-editor/src/Announcer.test.ts`: fill and clear timing, two messages inside 50 ms both spoken, the same text twice, dispose.
- `tools/browser-check/checks/graph-editor-gate.mjs`: heartbeats `agent-1` while waiting, like edit-loop (housekeeping, not the cause).

## Verification

- `web/graph-editor`: vitest 221 passed, `tsc --noEmit` clean, `vite build` ok.
- Browser checks, once each by the coordinator: graph-editor 26 s, graph-editor:gate 16 s, graph-editor:test-outcome 17 s, graph-editor:error-shell 43 s, graph-editor:undo-toast 23 s, shell-cap 45 s, all pass.

## Lessons

- Coordination: the baseline run before fan-out disproved a bead's written hypothesis (edit-loop failed too) before an agent was briefed on it. Filed in docs/lessons/agent-coordination.md.
