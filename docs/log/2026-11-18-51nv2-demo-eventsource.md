# EventSource stand-in for the demo editor

Id: 51nv2-demo-eventsource

`Aurora-51nv.2`. `web/demo/demo-eventsource.js` replaces `EventSource` for `/api/` URLs so the editor's preview stream works in the demo with the editor unchanged (DESIGN option a). Events come from a `streams(path, query)` provider that returns `null` (a 404 to the page) or `{subscribe(sink), close()}`. `sink.emit(name, data)` sends `preview`, `ended` or `error`, `sink.end()` drops the connection. `installEventSourceStandIn(win, streams)` installs it (`Aurora-51nv.9`), and `createStubStreams()` emits server-shaped preview frames and refusals until the engine provider replaces it (`Aurora-51nv.10`). Other URLs fall through to the native EventSource.

## Verification
- `demo-eventsource.test.mjs`: frame keys match `server-samples/preview-snapshot.json`, named and `onmessage` dispatch, readyState transitions, close unsubscribes, an unknown stream fails like a 404, fall-through.
- Coordinator re-run: the test, web unit loop, closure check.
- Gap: the stub's session pattern is a guess. `Aurora-51nv.10` matches `DraftStore::validSession`.

## Lessons
- none
