# Web root embed skips Static_* mock folders

Id: 3z1x-embed-skips-static-mocks

`Aurora-3z1x`. The embed walked all of `web/ui`, so `Static_GraphEditor_Mocks`, `Static_kep2_Mocks` and `Static_2.5_VisualPass` shipped in app builds.

## State

- `core/Network/tools/embed_webroot.py` prunes any directory named `Static_*` at any depth.
- `core/Network/cmake/EmbedWebroot.cmake` filters the same paths out of the configure-time glob, so mock edits no longer regenerate the header.

## Verification

- macOS, `embed_webroot.py web/ui`: 53 `Static_` keys before, 0 after; 87 files embedded. Script only, no full app build.
- Two `Static_` strings remain in the header as comments inside embedded JS, not paths.
- No `EmbedWebrootTests` case added.

## Lessons

- Lessons: none.
