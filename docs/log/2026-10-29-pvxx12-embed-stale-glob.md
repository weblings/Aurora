# Graph editor embed: no stale configure-time glob

Id: pvxx12-embed-stale-glob

`Aurora-pvxx.12`: after a source change, `cmake --build` failed with "No rule
to make target ...graph-editor-dist/assets/index-<hash>.js" until cmake was
rerun.

## Done

- Cause: `aurora_embed_webroot` globbed the dist dir at configure time, so the
  previous build's hashed bundle sat in the embed command's DEPENDS; vite's
  `--emptyOutDir` then deleted it.
- `aurora_embed_webroot` gains `NO_GLOB`. `aurora_graph_editor_embed` passes it
  when vite builds the dist, so the embed depends on the build stamp only. A
  prebuilt `AURORA_GRAPH_EDITOR_DIST` bundle is static and keeps the glob.

## Results

- macOS `build/mac-app` (2026-10-29): an edit that changed the bundle hash
  (`index-DlRk-MHh.js` to `index-yXXugr1o.js`) rebuilt through vite, embed and
  link with no reconfigure.
- Linux and Windows share the same cmake; not built.

- Lessons: none (the `NO_GLOB` comment in `EmbedWebroot.cmake` carries it).
