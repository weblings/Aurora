---
name: output-lessons
description: Streaming/protocol gotchas — check before touching Hue/DTLS/REST, wire formats, or connection state.
allowed-tools: Read
---

# Output lessons

Before touching `HueOutput`, DTLS/`Streamer`, bridge REST calls,
entertainment-configuration handling, or wire colorspaces, read
`Analysis/lessons/output.md`.

## How to use this skill

1. Read `Analysis/lessons/output.md`.
2. Local success signals (`init()` clean, fresh colors computed) don't
   prove the bridge is rendering — verify end to end, and trace dead
   reference code before porting it as live behavior.
3. File new streaming/protocol gotchas here per `Analysis/lessons/README.md`.
