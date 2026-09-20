---
name: engineering-hygiene-lessons
description: Build/tooling and general design gotchas — check before CMake/vcpkg/FetchContent changes, environment setup, debugging, or porting C patterns into C++.
allowed-tools: Read
---

# Engineering hygiene lessons

Before touching `CMakeLists.txt`, vcpkg ports, `FetchContent` blocks, compiler
toolchains, debugging strategy, or porting C example code into C++, grep the
query-coherent files (`build-toolchain`, `windows-env`, `debugging-method`,
`architecture-process`, `web-testing`, `language-cpp` in `docs/lessons/`).

## How to use this skill

1. Grep `Tags:`/`Applies-when:` across those files for the task at hand —
   read only matching entries in full, never whole files.
2. Match the planned change against them — many fail silently
   (wrong compiler, shadowed route, stale fetch branch) with no error.
3. File anything here that costs 30+ minutes and is a general principle,
   per `docs/lessons/README.md` — new entries require `Tags:` and
   `Applies-when:` lines (enforced by `docs/check-lessons.sh`).
