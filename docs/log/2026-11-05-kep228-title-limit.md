# One effect title limit

Id: kep228-title-limit

`Aurora-kep2.28` and `Aurora-kep2.25`, under `Aurora-kep2`.

## State

- The graph loader capped titles at 60 bytes. The rename and duplicate routes capped them at 80
  bytes and wrote without validating, so a 61 to 80 byte title saved and then failed to load.
- `kMaxTitleLength` in `GraphLoader.hpp` is now 80 and is the one server limit. The loader and
  both routes use it, so nothing a route accepts can fail the loader's title check.
- Limits count code points through `textLength`, so a multibyte title gets the same room.
  Descriptions moved to characters too, still 280.
- Raising the cap, not lowering it, means effects already renamed past 60 load again with no
  migration.
- `duplicateTitle` cuts the source title so the whole copy, suffix included, fits the cap.
- The rename box clips to `TITLE_MAX_CHARS` on input, because `maxLength` counts UTF-16 units.
- The MCP `put_draft` wording and the demo shim match the new limit.

## Verification

- `AuroraRuntimeTests` 194 of 194 and `AuroraPipelineTests` 161 of 161 on a Debug build.
- `PipelineTests` renames to 80 two-byte characters, then switches to that effect.
- `web/ui` `*.test.mjs` all pass.
- Not tried in a browser or on the running app: the rename box clipping and the MCP wording.

## Lessons

None.
