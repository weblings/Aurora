# Sequence E planning: graph editor, edit loop first, epic filed

Id: sequence-e-planning

Planning session, no code changed. Sequence D (`Aurora-4xqt`) closed with its
gate 11/11 on all three OSes, and [[sequence-e-research]] mapped what the
editor can reuse and what it lacks. Sequence E of [[nodes-agent-ux]] was
scoped and filed.

## Done

- **Epic `Aurora-pvxx`** (P3, labels `1.1.4`, `node-graph`), ten children:
  E0a `Aurora-0tqq` (reparented from the research run), E0b to E0d server
  gaps (`.1` to `.3`), E1 to E5 editor work (`.4` to `.8`), E6 gate (`.9`).
- **`Aurora-h6yz`** (P4) per-node previews, blocked by the epic.
- Sequence D epic closed. C and D status lines in [[nodes-agent-ux]] set to
  done, E section written.

## Owner decisions

- Razor: a working edit loop in the app. Per-node previews are the next
  sequence.
- The effect picker (`Aurora-kep2`) is not a prerequisite. It is how users
  get into the editor and can follow; E5 adds only a Dashboard link.
- A graph with no source is valid (the candle graph is one).
- Save model: Save (no activation) and Save and apply. Autosave to browser
  storage stays in E because the single-document state undo needs makes it
  nearly free.
- Undo and redo in E, the simple version: snapshot stacks capped at 100, one
  entry per gesture, not persisted, reset when another effect opens.
- Node titles and port descriptions go into the registry for all types
  (E0d), not shown as type names.

## Agent-proposed, not asked

- Built-ins with no saved `ui` get a hand-rolled column layout by
  topological depth, with dagre only as a fallback (graphs are 5 to 15
  nodes).
- Categories in the node palette come from type prefixes, not a registry
  field.
- E does not wait on `Aurora-51nv` or `Aurora-que2`. The editor uses only
  the HTTP API, so a demo backend can serve it later. E3 treats
  `cannot_preview` as a state.
- The E6 gate drives the editor with Playwright on the light-viz stack, as
  the shell-banner live checks did.

## Lessons

- none
