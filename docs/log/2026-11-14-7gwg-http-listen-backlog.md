# HTTP server: listen backlog raised from cpp-httplib's 5 to 128

Id: 7gwg-http-listen-backlog

`Aurora-7gwg` (P4). Follow-up to [[yqu8-settings-put-transport-retry]]: eight simultaneous connects overflowed the default backlog of 5. No real-app failure was ever seen; this covers bursts from several tabs plus MCP agents.

## What changed

- `core/Network/CMakeLists.txt`: `AuroraNetwork` defines `CPPHTTPLIB_LISTEN_BACKLOG=128` as a PUBLIC compile definition, so every translation unit that includes `<httplib.h>` through it sees one value (the macro is read at compile time, in the header's inline `listen`).

## Verification

- The definition appears in the `flags.make` of `AuroraNetwork`, `AuroraRuntime` and the test targets.
- `AuroraNetworkTests` rebuilt and passed (34 test cases, 341 assertions). The full core suite was not run, and the original eight-connection burst was not reproduced.

## Lessons

- none
