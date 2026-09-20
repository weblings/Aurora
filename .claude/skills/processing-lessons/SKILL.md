---
name: processing-lessons
description: Color/effect and zone-mapping gotchas — check before touching ImageProcessing, effects, ZoneMap/reconcile, or DSP test harnesses.
allowed-tools: Read
---

# Processing lessons

Before touching `ImageProcessing`, audio/video effects, `ZoneMap` /
`reconcileZoneMap` / `composeFrame`, or synthetic test signals, read
`Analysis/lessons/processing.md`.

## How to use this skill

1. Read `Analysis/lessons/processing.md`.
2. Check metadata at its source (pixel-format tags, zone defaults) before
   trusting it downstream, and reproduce the real pipeline's preprocessing
   in synthetic tests.
3. File new color/effect/zone-mapping gotchas here per
   `Analysis/lessons/README.md`.
