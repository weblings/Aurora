---
name: rendering-lessons
description: Three.js/GLTF/Blender facts and demo-scene design — check before touching demo scenes or web-processing mirrors.
allowed-tools: Read
---

# Rendering lessons

Before touching `Aurora-Demo-Web` scenes or `web-processing/` mirrors,
read `Analysis/lessons/rendering-apis.md` (third-party API facts) and
`Analysis/lessons/rendering-internals.md` (this project's scene design).

## How to use this skill

1. Grep `Tags:`/`Applies-when:` in both files for the task at hand —
   read only matching entries in full. Third-party behavior goes in
   `-apis`, project design calls in `-internals`.
2. Verify visual assumptions with one real render, not UV-space math.
3. File new findings in the matching file per `Analysis/lessons/README.md`
   — new entries require `Tags:` and `Applies-when:` lines.
