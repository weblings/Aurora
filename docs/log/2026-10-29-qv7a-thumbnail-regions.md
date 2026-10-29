# Graph editor thumbnail: zones at their sampled regions

Id: qv7a-thumbnail-regions

`Aurora-qv7a`, found in the Sequence E drift review: preview frames carry only
zone ids, so `ZoneThumbnail` drew a wrapped grid, not the zone map.

- `GET /api/zones` (active output only) gives uvs per zone. `parseZoneRegions`
  drops zones without a usable rect; `layoutThumbnail` (`graph/frame.ts`) draws
  the matching output in an 8 x 4.5 cell panel at those rects and keeps the
  wrapped grid below for its unmapped zones and every other output.
- `ZoneThumbnail` fetches the regions when the stream goes live, so a reconnect
  refreshes them; zone edits during a live stream show on the next reconnect.
  A failed fetch leaves the grid.
- Vitest: three cases in `loop.test.ts` (parse sample, placement, fallbacks).
  Browser check below.
- Browser check (`Aurora-9tp0`, mac fake-Hue stack, live input, embedded editor
  at 1470 px): `builtin.video`'s `.zone-thumbnail` draws four separate blocks at
  the 2x2 uv quadrants from `/api/zones`, not the wrapped grid. Preview frame ids
  0-3 match `/api/zones` `zoneId` for hue; colours track position (id0 top-left
  brightest). Zone Mapping not compared side by side (same endpoint). The 4-zone
  map is a plain 2x2, so only the colour-to-position match tells it from the
  grid; a non-grid map would be stronger. No gate assertion added.

- Lessons: none.
