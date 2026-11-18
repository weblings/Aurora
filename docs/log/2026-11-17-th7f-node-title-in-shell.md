# Shell row names a node that can't be set up by its title

Id: th7f-node-title-in-shell

`Aurora-th7f`. The failed-effect shell row now reads "Couldn't start Sunset: the Gradient node can't be set up." The Dashboard has no node catalog, so core supplies the name. When a node's factory throws or returns null, `GraphLoader` sets `LoadIssue.nodeTitle` to the type's catalog title, else its type, and `Pipeline` copies it into the host error as `detail.nodeTitle`. `detail.node` and the server message are unchanged. `HOST_COPY.node_construct_failed` in `web/ui/problemCopy.js` prefers `nodeTitle` (unquoted, as the editor's `graph/nodeTitle.ts` does), then the quoted id, then "a node", so an older server still gets the id wording. `openapi.yaml` lists the key, and `openapi.json` was regenerated.

## Verification
- New loader test in `GraphBadCorpusTests.cpp` covers a throwing factory (title used) and a null one with no title (type used).
- Coordinator re-run: core-tests build, full `ctest -j8` (509 passed), `problemCopy` and `shellRows` tests (13 passed), `gen-openapi.py` leaves `openapi.json` unchanged, `build/windows-app` rebuilt, `graph-editor:error-shell` and `dashboard-shell` pass.
- Gap: no end-to-end test that `Pipeline` copies `nodeTitle`, because the graph registry cannot be injected into `GraphRunner` (as in `u8jx15-shell-effect-copy`). The copy is one line beside the existing `node` copy.

## Lessons
- none
