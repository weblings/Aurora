# EC 3: Host header allowlist (Aurora-5ipy.4)

Id: 5ipy4-ec3-host-allowlist

Closed 2026-10-16. Phase 3 of [[external-control]]. Runs first in the lane, before Sequence B read routes ([[sequence-b-planning]]).

## What changed

- `HttpLibServerImpl.hpp`: a pre-routing handler returns 403 `host_forbidden` unless `Host` is an IP literal, `localhost`, `*.localhost`, this machine's hostname, or its `<short>.local`. Ports and a trailing dot are ignored. A missing `Host` passes (not a browser).
- Pre-routing means the static mount and embedded WebUI are covered too, not only API routes.
- Extra names: `HttpServer::setExtraAllowedHosts()` and the `AURORA_ALLOWED_HOSTS` env var (comma-separated), merged at `bind()`. No app `main.cpp` sets the list.
- The old Origin-check comment no longer claims rebinding is future work.

## Decisions

- Allow all IP literals instead of enumerating LAN interfaces: rebinding needs the attacker's hostname in `Host`, so a bare IP is not a vector (Vite and webpack-dev-server do the same).
- The reverse-proxy escape hatch is the extra list. It is not gated on pairing yet because pairing (Aurora-5ipy.5) does not exist.

## Verification

- `NetworkTests.cpp` new case: forged names (with and without port, API and static path) get 403. Literals (v4, v6), `localhost`, `*.localhost`, machine name, `.local` name and a configured extra pass. Core suite 251/251 (MSVC Debug).
- Phone check on the Windows Release build: LAN IP and `BeefyBoy.local` load, `<ip>.nip.io` gets `host_forbidden`.

## Not verified

- Linux and macOS builds (the `arpa/inet.h` and `unistd.h` branch).
- Bare `BeefyBoy` on the phone failed to load. A local `curl` with that `Host` returned 200, so this is phone-side name resolution, not the allowlist.

## Lessons

- One output lesson: bare-hostname failures from a phone are DNS, and rejection is best tested with a wildcard-DNS name that resolves to the daemon.
