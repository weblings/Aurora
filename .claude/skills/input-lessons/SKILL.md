---
name: input-lessons
description: Capture/grabber gotchas — check before touching grabbers, SessionDispatch, pixel formats, or audio capture.
allowed-tools: Read
---

# Input lessons

Before touching capture backends (`X11Grabber`, `PipewireGrabber`,
`WindowsGrabber`, `AudioGrabber`), `SessionDispatch`, pixel-format tags,
or device discovery, read `Analysis/lessons/input.md`.

## How to use this skill

1. Read `Analysis/lessons/input.md`.
2. Capture APIs fail in non-obvious ways (placeholder frames, zero
   callbacks, mislabeled formats) — check the planned change rhymes
   with none of them before assuming a bug is downstream.
3. File new capture-specific gotchas here per `Analysis/lessons/README.md`.
