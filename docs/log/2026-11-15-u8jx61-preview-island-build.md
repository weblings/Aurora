# Graph editor: Preview island with a layout menu and sim layouts built

Id: u8jx61-preview-island-build

`Aurora-u8jx.6.1`. Replaces `ZonesIsland.tsx` with `PreviewIsland.tsx` as settled in the `Aurora-u8jx.6` mock.

## What changed

- Core: `GraphPreview` can draw a sim zone map instead of the live one (`setSimZones`). `GET /api/graph/preview?layout=room|basic` picks it, `GET /api/graph/preview/layouts` reports the saved zone count. A sim sends nothing to any output. `basicRoomZoneMap()` is the 4 quadrants.
- One basic room definition: tests tie `basicRoomZoneMap()` to `tools/fake-hue-bridge/room-4zone-zonemap.json` (core) and the demo's `ROOM_ZONE_MAP` to the same file (`web/demo/room-zonemap.test.mjs`).
- Editor: `graph/previewLayout.ts` (rules, names, announcements), `usePreviewLayout.ts` (state), `PreviewIsland.tsx`. Hue area name from the connection plus `PUT /api/hue/entertainment-configurations`, cached in localStorage for a downed bridge. No reachable lights is the shell's `output_link` row. Test is disabled with "No lights reachable".

## Not done

- `/api/zones` per output (`Aurora-9sm` option 3): the island needs no output name beyond the frame's, so the route is unchanged.
- A running test pulling the island to Lights, the locked menu and 28ch truncation tooltip rest on the unit-tested rules in `graph/previewLayout.ts` and were not driven in a browser.

## Verification

- Core `AuroraPipelineTests` all pass (168 cases, 2 new). Editor vitest 235 pass, `tsc` clean. Browser checks `graph-editor:preview` (new, replaces `graph-editor:zones`), `narrow` and `gate` pass against a rebuilt Debug app at 1100, 700, 400 and 360 px.

## Lessons

- `tools/browser-check` runs the app at `build/windows-app/bin/Release`. A Debug build in another tree must be copied there or the check runs a stale binary.
- The fake stack's Hue area is named, so a check cannot match the real layout by the name "Lights".
