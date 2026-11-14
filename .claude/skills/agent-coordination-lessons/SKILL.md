---
name: agent-coordination-lessons
description: Coordinating several agents on beads — check before spawning subagents, splitting a bead sequence across agents, writing their briefs, or verifying and committing their hand-backs.
allowed-tools: Read
---

# Agent coordination lessons

Before fanning out agents on a set of beads (or taking over a sequence one
agent at a time), read `docs/lessons/agent-coordination.md`. It is short;
read the entries whose `Applies-when:` matches the step you are on:
preflight (stack, port 8215, baseline checks), recording decisions in beads,
briefs (one-check iteration, progress file, known failures), watching a
running agent, triaging a failure, and verifying and committing per bead.

## How to use this skill

1. Before the first spawn: run the preflight and baseline from the matching
   entries, and write the owner's decisions into the beads.
2. Put the relevant gotchas into every brief. Agents do not read this file
   on their own. Name the shared `web/ui` modules to import (the components
   lesson "share web/ui modules by import, never by copy").
3. On a hand-back, re-run the gates yourself before closing and committing.
4. File new coordination findings in `docs/lessons/agent-coordination.md`
   per `docs/lessons/README.md`. New entries require `Tags:` and
   `Applies-when:` lines, and the README count must be bumped.
