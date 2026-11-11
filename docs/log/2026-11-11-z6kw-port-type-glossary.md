# Port type glossary

Id: z6kw-port-type-glossary

`Aurora-z6kw`. One line of meaning for each of the 8 port types, including the Trigger model and the Angle degrees warning. Follows [[id8j1-b0-float-trigger-ports]] (Float, Trigger), [[pvxx3-titles-port-descriptions]] (port descriptions), [[ex8z-port-type-sockets]] and [[d0hv-circle-sockets]] (the socket look the type label sits beside).

## State

- Source of truth: `portTypeMeaning` and `allPortTypes` in `GraphTypes.cpp`. [[node-graph-pipeline]] has a "Port type glossary" with the same text (hand-kept, not test-checked).
- `GET /api/nodes` and `/api/v1/nodes` carry `portTypes` (`name`, `meaning`); `openapi.json` and `server-samples/nodes.json` updated.
- MCP `list_nodes` returns the whole glossary, `describe_node` the meanings of the types that node uses, and the server instructions point at both.
- Editor: `fetchCatalog` stores the meanings; the port type label on a node and the Add-node socket hover show them.
- The `onset` port description ("True for one tick ...") was already in the working tree and ships with this.

## Not done

- The text does not mention converter nodes: `Aurora-jsjj` (angle.fromFloat/toFloat) is still in progress. It says Float and Angle do not convert implicitly; revise the Float and Angle lines when jsjj lands.

## Verification

- Core runtime tests 194/194, pipeline tests 162/162 (catalog route checks `portTypes`), MCP 32/32, graph-editor vitest 127 passed, `tsc --noEmit` clean.
- Not run: a live Aurora with the editor open, so the tooltips are untested in a browser.
