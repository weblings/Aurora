---
name: processing-lessons
description: Color/effect and zone-mapping gotchas — check before touching ImageProcessing, effects, ZoneMap/reconcile, or DSP test harnesses.
allowed-tools: Read
---

# Processing lessons

Before touching `ImageProcessing`, audio/video effects, `ZoneMap` /
`reconcileZoneMap` / `composeFrame`, or synthetic test signals, read
`docs/lessons/processing.md`.

## How to use this skill

1. Grep `Tags:`/`Applies-when:` in `docs/lessons/processing.md` for
   the task at hand — read only matching entries in full, not the file.
2. Check metadata at its source (pixel-format tags, zone defaults) before
   trusting it downstream, and reproduce the real pipeline's preprocessing
   in synthetic tests.
3. File new color/effect/zone-mapping gotchas here per
   `docs/lessons/README.md` — new entries require `Tags:` and
   `Applies-when:` lines.
