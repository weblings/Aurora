# Aurora-4xqt.3: validate errors an agent can act on (closed)

Id: 4xqt3-actionable-validate-errors

D0c of [[sequence-d-planning]]. Core suite 416/416 (WSL tree `build/core-test`).

## Built

- `LoadIssue` (`GraphLoader.hpp`) gains `code`, `port`, `param`, `options`
  beside `node` and `message`. Every loader problem, including invalid JSON,
  carries a stable snake_case code (`node_type_unknown`, `param_unknown`,
  `param_option_unknown`, `port_unknown_input`, `port_unknown_output`,
  `port_type_mismatch`, `input_missing`, `output_unregistered`,
  `control_node_unknown`, `graph_cycle`, and so on).
- `options`: unknown type and unknown control node list the 5 nearest by edit
  distance. Unknown port, param and control param list the node's real names,
  nearest first. A bad enum lists its allowed values. An unregistered output
  lists the known outputs, nearest first.
- `validateGraphDoc` (`DraftRoutes.cpp`) emits `code`, `port`, `param` and
  `options` per error, so drafts, validate, apply and test share one shape.
  `node` and `message` are unchanged, so the WebUI and gate are untouched.

## Verified

- New corpus case asserts code, port, param and leading options for 10 bad
  graphs and that no issue lacks a code.

- Lessons: none
