# Graph editor Zones island

Id: s1t74-zones-island

`Aurora-s1t7.4`. `ZoneThumbnail.tsx` (canvas) is replaced by `ZonesIsland.tsx`: header "Zones" with the hide chevron (open state kept in `sessionStorage`, so it survives a reload and starts open when storage throws), then one 14 px DOM cell per zone of the single active output, 8 per row, no screen mapping, no resize button. The active output is the one `/api/zones` names, else the frame's first (`activeZones` in `graph/frame.ts`). Cell colours are written from the preview ref on animation frames; React state holds only the zone count, so cells mount when it changes. An error zone gets diagonal stripes and a white inset ring in CSS. Stale (stream not live) dims the cells to 0.4. The island still hides until the first frame. `layoutThumbnail`, `layoutCells` and `SCREEN_ROWS` went with the canvas; `parseZoneRegions` stays for the output name. The side-drawer shift from [[daaa35-zone-preview-drawer]] moved to `.zones-island`.

The island header is a chrome button, so `graph-editor:control-count`'s ceiling went from 9 to 10 for both effects. Audio measures 9 until a frame arrives, so its ceiling stays 10 rather than flaking.

## Verification

- `graph-editor:zones` (new), `:gate` (cell colours replace the canvas pixels), `:narrow`, `:corners`, `:control-count` pass; vitest 131 passed; `tsc --noEmit` clean.
- Not looked at in a screenshot: stripes on an error zone, dark theme.

## Lessons

- none
