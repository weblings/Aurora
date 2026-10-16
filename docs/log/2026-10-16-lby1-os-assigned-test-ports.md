# Route tests bind OS-assigned ports (Aurora-lby1)

Id: lby1-os-assigned-test-ports

Closed 2026-10-16. Follow-up to [[vv46-route-test-port-collisions]], which
gave each colliding test its own literal port and left a "grep before
picking" rule as the only guard.

## Done

- `HttpServer::bindToAnyPort(address)` wraps cpp-httplib `bind_to_any_port`
  and returns the port, or -1. `bind()` and it share a `makeImpl()` that
  builds the impl with the Host allowlist.
- `NetworkTests.cpp` (13 binds), `PipelineTests.cpp` (15 binds) and the Hue
  `PairingRoutesTests.cpp` `TestServer` (9 cases) bind with it and build their
  clients from the returned port. No test binds a literal port now.
- Port literals left inside `Host` and `Origin` header strings are unchanged:
  the allowlist and the cross-origin check compare the host part only.

## Verification

- Core suite 344/344, then 20 consecutive `ctest -j8` runs with no failure
  (MSVC Debug, `build-core-test-win`).
- Hue tests built standalone (`output/hue`, vcpkg toolchain, scratch build
  dir): 52/52 direct and under `ctest -j8`.

## Lessons

- 1 filed in build-toolchain: server tests bind OS-assigned ports.
