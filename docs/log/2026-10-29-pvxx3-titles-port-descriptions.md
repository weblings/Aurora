# E0d: node titles and port descriptions

Id: pvxx3-titles-port-descriptions

`Aurora-pvxx.3`, from [[sequence-e-planning]]: the editor needs a short title
per node and a sentence per port for the inspector; the registry had only a
type id, `purpose`, and port name/type.

## Done

- `NodeTypeMeta::title` and `PortDecl::description` (`NodeRegistry.hpp`,
  `GraphTypes.hpp`), filled for every registered type and every registered
  port. Categories stay derived from the type prefix, no field.
- Served in `/api/nodes` (`title` per node, `description` per port), so
  `/api/v1/nodes` and MCP `describe_node` carry them with no MCP change. The
  descriptor registry's `node.<type>` entries gain `title`
  (`ControlDescriptor::title`).
- `openapi.yaml` adds `title` to the node catalog and descriptor entries;
  `openapi.json` regenerated. `gen-demo-graph.py` and `gen-descriptors.py`
  `--check` still pass.
- The `GET /api/nodes` registry test now fails on an empty title or an empty
  port description for any type, so a new node cannot skip them.

## Lessons

none
