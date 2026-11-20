# 2v8l: aurora-mcp link lock on Windows (Aurora-2v8l)

Id: mcp-link-lock

Found while verifying [[v1-patch-state]].

## Shipped

- A running `aurora-mcp.exe` (every agent session has one) failed the link with LNK1104, and the app build with it.
  The `aurora-mcp` target now has a Windows PRE_LINK step, `adapters/mcp/cmake/MoveAsideExe.cmake`, that renames
  the existing exe to `aurora-mcp.old.exe`. Windows allows renaming a running exe, not overwriting it.
- An earlier `.old` copy may still run, so the script tries `.old2` to `.old9` and the link goes ahead if none
  fits. The staging step in `app/windows` needed no change.
- Verified on Windows with the current exe held open by a running process: link and staging succeed, and the
  old copy lands as `.old2`. Copies pile up in the build tree until their processes exit and a later build
  removes them.

- Lessons: updated the fix in "A green build is not a fresh binary" ([[lesson-build-toolchain]])
