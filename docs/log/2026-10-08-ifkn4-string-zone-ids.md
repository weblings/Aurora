# Aurora-ifkn.4 closed: ZoneActiveToggle accepts string and numeric zone ids

Id: ifkn4-string-zone-ids

2026-10-08. Vendor step 4 of the demo re-vendor (parent bead `Aurora-ifkn`,
child `Aurora-ifkn.4`). Upstreamed the fork's `string-zone-ids` seam into
`web/ui/ZoneActiveToggle.js`: the change handler now resolves through a new
exported `findZone(zones, rawId)` that matches either form by strict equality
(`z.zoneId === rawId || z.zoneId === Number(rawId)`), guards unknown ids
(`if (!zone) return`), and queues under the zone's own id so string ids are
never coerced. Queue/error wiring (`onError`, `onSuccess`, `onUnreachable`)
unchanged; the `onChange` callback stays out -- that is `Aurora-ifkn.5`'s
seam. Vendor copy untouched for `Aurora-ifkn.7` to re-vendor (its inline
lookup is behaviorally identical).

## Verification

- New `web/ui/ZoneActiveToggle.test.mjs` (lookup: numeric, string, unknown,
  numeric-raw; handler: numeric flip, string flip, unknown-id no-throw/no-queue
  via container doubles, queue replaced so no fetch fires). Observed the old
  `Number()` lookup miss and throw `TypeError` on a string id as a negative
  control before the change.
- Full web loop green: `web/ui` (incl. `screens/`), `web/ui/styles`,
  `web/demo` (incl. vendor `seams.test.mjs`), `web-processing`.

## Surprises

- `muse.edit_file` cannot match multi-line blocks in this checkout's CRLF
  `web/` files, so the edit went in via a byte-exact scripted replace with
  single-occurrence assertions (same shape as the [[lesson-build-toolchain]]
  CRLF entry from `Aurora-ifkn.2`).
- Lesson: the `dataset`-always-string contract already had a Dropdown entry
  (silent no-op on write-compare); this is the read-side twin (NaN + throw),
  filed as a new entry in `docs/lessons/components.md`.
