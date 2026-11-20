# Pasting an audio recipe reopens the preview instead of showing an input problem

Id: ookv-paste-reopens-preview

`Aurora-ookv`. Owner report: after pasting an audio recipe into the graph editor, the problems chip showed "1 problem" until the input node was deleted and added again.

## Cause
- The preview stream opens with the inputs the graph needs at that moment. A stream left open on a video graph has no audio input.
- Pasting an audio graph made the server refuse the hot reload (`draft_invalid`, "needs an audio input the preview did not open; reconnect the preview"). The editor listed that refusal as a Whole graph problem.
- Deleting and adding the node only worked because the edits happened to reopen the stream.

## What shipped
- `useDraftLoop.ts`: a `draft_invalid` whose message asks to reconnect reopens the stream, which opens the missing input. With no audio input configured the server then refuses with `cannot_preview`, so the editor shows a paused preview with the server's note.
- `Pipeline.cpp`: the message now reads "an audio input" and "a video input".
- `tools/browser-check/lib/stack.mjs`: `withEditorStack` and `startEditorStack` take `audio: true` (devstack `--audio-input`). A shared stack refuses it.
- `checks/graph-editor-recipes-paste.mjs`: runs with an audio input, warms a live stream, clears the graph, then pastes each recipe and expects Live with no problems chip. It fails with the fix reverted.
- `checks/graph-editor-gate.mjs`: the unopened-input step now expects a paused preview and no chip on its no-audio stack.

## Verification
- Owner: the Bass, mids and treble recipe shows no problem in the dev-server editor and the problem in the built one.
- `tsc`, `npm test` (358 tests), the paste check and the graph-editor gate pass. The C++ change is message text only and was not rebuilt.

## Lessons
- [[lesson-web-testing]]: an empty graph opens no preview stream, so a paste check must warm one first.
