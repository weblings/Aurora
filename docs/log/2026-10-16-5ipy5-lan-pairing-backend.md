# LAN pairing backend (Aurora-5ipy.5)

Id: 5ipy5-lan-pairing-backend

Closed 2026-10-16. EC 4a of [[external-control]]. Backend only: the WebUI
pairing screen, global 401 handler and device list are Aurora-5ipy.6.

## Done

- `core/Network` gains `Pairing.hpp` (`PairingService`, `AccessGuard`) and
  `PairingRoutes.hpp`. Enforced from first release, no opt-out.
- Loopback passes as Admin. Everything else needs a token (`Authorization:
  Bearer` or `aurora_token` cookie). The predicate is injectable
  (`AccessGuard::IsLocal`), and `mintForTest` skips the approval flow.
- Scopes `read < draft < apply < admin`. Rules are path prefixes, longest
  wins, `Scope::None` opens a prefix (pairing handshake, Aurora-4zr.5's
  callback via `guard.addRule`). No rule: GET open, anything else Admin.
- Token = `aur_` + 32 random bytes hex. Only SHA-256 hashes are stored, in
  `paired-devices.json` beside config (own SHA-256, the module links no crypto
  lib). Corrupt store loads as no devices.
- Flow: `POST /api/pairing/request` (name, scope, default admin) returns
  `pollKey` + 5-char code, 202. Trusted UI lists `GET /api/pairing/pending`,
  `POST .../pending/:ref/approve|deny`. Client polls
  `GET /api/pairing/request/:pollKey` (202 pending, 200 token once plus
  HttpOnly `SameSite=Strict` cookie, 404 denied/expired/collected). Pending
  capped at 8, expire after 300 s.
- `GET /api/pairing/status` open probe, `GET /api/pairing/devices`,
  `DELETE /api/pairing/devices/:id` admin.
- `HttpServer::setAccessGuard`; the check runs in the pre-routing handler
  after the Host allowlist. `Request` gains `remoteAddr`/`local`/`scope`,
  `Response` gains `headers`.
- All three app mains register the routes and guard.

## Decisions

- Reads stay open on LAN (bead text: "LAN writes need a token"). The
  2026-10-13 note in the bead says reads paired too. Tightening is one
  `addRule` per prefix.
- Reverse proxy on the same machine makes remote traffic look loopback.

## Verification

- `AuroraNetworkTests` 25 cases/216 assertions incl. SHA-256 vectors, guard
  unit tests, persistence, and an end-to-end remote flow (Origin check still
  403s a valid cookie, revoke 401s). Linux app builds, ctest 136/136 (WSL).
