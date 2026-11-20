# Dashboard hides editor actions until the probe succeeds

Id: 3m75-editor-probe-default

`Aurora-3m75`. `DashboardScreen.graphEditorAvailable` started undefined, so the first render left Edit graph and New effect showing, and a failed probe never told the panel otherwise. It now starts false and `_probeGraphEditor` updates the panel with the result either way. `web/demo/vendor/webui` re-vendored.

## Verification
- `DashboardScreen.test.mjs` covers the true, false and offline probe results. The vendor seam and byte-identity checks pass.

## Lessons
- none
