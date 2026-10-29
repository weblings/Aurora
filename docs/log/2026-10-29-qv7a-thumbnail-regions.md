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
  Not checked in a browser.

- Lessons: none.
