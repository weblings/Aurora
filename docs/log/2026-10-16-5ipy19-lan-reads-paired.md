# LAN GETs require the read scope (Aurora-5ipy.19)

Id: 5ipy19-lan-reads-paired

Closed 2026-10-16. EC 4c of [[external-control]], decided in its Layer 3
section (patterns: Home Assistant, Plex, OctoPrint, Hyperion.ng).

## Done

- `AccessGuard::decide`: with no rule, a non-loopback GET under `/api` needs
  `Scope::Read`. Other GETs (WebUI files) stay open so the pairing screen
  loads. Non-GET stays Admin. Loopback unchanged.
- Open by rule: `/api/pairing/status`, `/api/pairing/request`. The HA OAuth
  callback route does not exist yet; Aurora-4zr.5 adds its `Scope::None` rule.
- `/api/events` is covered, so an unpaired device can no longer fill the
  stream cap.

## Verification

- `PairingTests`: unpaired `/api/state` and `/api/events` 401, `/`, CSS and
  `/apiary.html` open, read token passes GET and is Forbidden on PUT, and the
  in-process remote flow expects 401 before pairing and 200 after. Core suite
  370/370 (MSVC Debug).
- End to end against the Windows Release app over a non-loopback address, see
  [[5ipy6-webui-pairing]].

## Notes

- Routes with no rule need Admin for writes, so an `apply`-scoped token gets
  403 on `PUT /api/config` today. The WebUI pairs as `admin`. Apply and draft
  rules arrive with Sequence C's routes.

## Lessons

- None.
