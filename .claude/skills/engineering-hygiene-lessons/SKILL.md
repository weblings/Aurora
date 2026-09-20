---
name: engineering-hygiene-lessons
description: Build/tooling and general design gotchas — check before CMake/vcpkg/FetchContent changes, environment setup, or porting C patterns into C++.
allowed-tools: Read
---

# Engineering hygiene lessons

Before touching `CMakeLists.txt`, vcpkg ports, `FetchContent` blocks, compiler
toolchains, or porting C example code into C++, read
`Analysis/lessons/engineering-hygiene.md`.

## How to use this skill

1. Grep `Tags:`/`Applies-when:` in `Analysis/lessons/engineering-hygiene.md`
   for the task at hand — read only matching entries in full, not the file.
2. Match the planned change against them — many fail silently
   (wrong compiler, shadowed route, stale fetch branch) with no error.
3. File anything here that costs 30+ minutes and is a general principle,
   per `Analysis/lessons/README.md` — new entries require `Tags:` and
   `Applies-when:` lines (enforced by `Analysis/check-lessons.sh`).
