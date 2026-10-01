# Aurora WebUI

The setup/control web interface served by [Aurora core](../../)'s app shells
(`app/windows`, `app/linux`, `app/mac`) via `HttpServer::serveStaticFiles()`
(or the copy embedded in the binary). Plain static HTML/CSS/JS, no build
step and no npm -- same convention as [web/demo](../../web/demo).

Screen/flow design and component-reuse research live in
[`docs/archive/WebUI_Design_1stPass.md`](../../docs/archive/WebUI_Design_1stPass.md), not
here.

Design informed by patterns in huenicorn's own `webroot/`
(GPL-3.0, https://gitlab.com/openjowelsofts/huenicorn) and RockyRoad's proven
desktop token system, so this repo carries the same license forward -- see
`LICENSE`.

## Status

Shipped: the onboarding flow (Welcome, a Mac-only menu-bar tip, Output Connect,
Entertainment zone select, Capture, Zone Mapping) and the Dashboard, under
`screens/`, with shared components alongside and design tokens in
`styles/tokens.css`. Plan docs live in `docs/planning/WebUI/`; component and
testing gotchas are filed under `docs/lessons/` (`web-ui-lessons` skill).

Tests are plain node scripts with no framework (`node styles/welcome.test.mjs`,
`node DeviceField.test.mjs`, ...).

## Reserved path

Never add a file under `api/` in this repo. `HttpServer` serves this
directory's contents as a static-file mount at `/`, and cpp-httplib checks
that mount *before* dispatching to a registered API route for GET/HEAD
requests (confirmed by reading its real `Server::routing()` source) -- a
static file that happened to collide with an API route's path would silently
win and the API handler would never run.

## Consuming this repo

Not a CMake project -- both app repos resolve it as a plain sibling directory
(same `FetchContent`+`SOURCE_DIR` pattern used for every other cross-repo
dependency in this codebase, just without an `add_subdirectory()` call) and
point `serveStaticFiles()` directly at the fetched path. Expects to sit next
to `Aurora/` on disk, same as every other sibling repo in this checkout.
