# HTTP server analysis

Prerequisite analysis for `ImplementationPlan.md`'s Phase 3 Milestone 2 and
`WebUI/WebUI_Design_1stPass.md`'s Build order step 1. Covers huenicorn's real
`Network::Http::Server` C++ implementation (read directly, not the JS frontend
this time) and what shape Aurora's own new server should take from it. Written
2026-09-15, before any of this is built.

## huenicorn's actual design (verified by reading the real source)

**The transport-agnostic abstraction is genuinely good and worth adopting
near-verbatim.** `HttpServer` (`include/.../Server/HttpServer.hpp`) is a thin
Pimpl façade: `addRoute(method, path, handler)` collects routes as plain data
before `bind()` constructs an `Impl`. Nothing above `Impl` ever touches
`httplib::` types — `Request`/`Response`/`Handler`/`Route`/`HttpMethod` are
huenicorn's own plain structs (`HttpDataStructs.hpp`), and `Impl`
(`Impl/HttpLibServerImpl.hpp`) is the only file that includes `<httplib.h>` and
wraps each handler to translate between the two. `SetupBackend`/`WebUIBackend`
(read directly: `SetupBackend.cpp`) never see cpp-httplib at all, they just
call `m_httpServer.addRoute(HttpMethod::Put, "/api/validateBridgeAddress",
[this](const Request& req, Response& res){ ... })`. This means the whole
server could be re-pointed at a different HTTP library later without touching
a single route handler — worth keeping that boundary exactly where huenicorn
drew it.

**Route handler convention**, confirmed directly in `SetupBackend.cpp`: parse
`req.body` with `nlohmann::json::parse`, call one method on a `CoreService*`
(the actual business-logic object, injected via constructor — HTTP concerns
never reach into `Config`/`Runtime` state directly), build a
`Serialization::Json` response object, `.dump()` it into `res.body`, set
`res.contentType = "application/json"`. Every route follows this exact shape,
no exceptions found.

**Threading model, confirmed by reading `Runtime.cpp` and `main.cpp` together
(this is the part that mattered most for this analysis):**
- `main()` spawns exactly one "application thread" (`Application::start()`,
  `huenicorn/src/App/main.cpp`) that runs `Core::Runtime::start()` — nothing
  httplib-related happens on the OS main thread itself.
- Inside `Runtime::start()`, `_initWebUI()` spawns the actual HTTP server on
  its **own** `std::jthread`, synchronized back via a `std::promise<bool>`/
  `future` pair so the calling thread knows the server is bound and ready
  before continuing:
  ```cpp
  m_webUIService.thread = std::jthread([&server = m_webUIService.server, ...](){
    server.emplace(m_coreService.get());
    server->start(restServerPort, boundBackendIP, std::move(readyWebUIPromise));
  });
  readyWebUIFuture.wait();
  ```
- `server->start(...)` internally calls `bind()` then `listen()`
  (`listen_after_bind()` in cpp-httplib terms), which **blocks** the calling
  thread until `stop()` is called from elsewhere — this is exactly why it
  needs its own thread, not the application thread.
- After `_initWebUI()` returns (server thread now running and serving),
  `Runtime::start()` calls `_startStreamingLoop()`, which runs the actual
  capture/color/DTLS-streaming tick loop **synchronously on the original
  application thread** — a plain `while(m_keepLooping){ _update(); ... }`.
- So during normal operation there are exactly two threads: the tick-loop
  thread and the HTTP-server thread, running concurrently, for as long as the
  app runs (this isn't setup-only — huenicorn's `WebUIBackend` for the *main*
  app, not just `SetupBackend`, runs the same way).
- Shutdown order, confirmed in `_startStreamingLoop()`'s tail: the loop exits
  on `m_keepLooping = false` (set by `Runtime::stop()`, called from a
  `SIGINT`/`SIGTERM` handler), runs `_shutdown()` (a clean Hue-streaming
  disable) **first**, then explicitly `m_webUIService.server->stop();
  m_webUIService.thread.join();` **after**. Stopping the HTTP server is the
  last thing that happens, not the first.

**A real concurrency gap worth naming, not copying uncritically.** Only one
mutex exists anywhere in `Runtime.cpp` (`m_streamerMutex`, guarding
`m_streamer`, the DTLS client object itself — locked both where
`_enableEntertainmentConfiguration()` reassigns it from the HTTP thread's call
path and where `_update()` reads it every tick from the loop thread). The
per-channel state the WebUI actually mutates most often — UV rects, gamma,
active/inactive, all of `m_channels` — has no visible synchronization in this
file at all, despite being written from HTTP-handler call paths and read every
tick by `_update()`'s `for(auto& [channelId, channel] : m_channels)` loop.
This may be relying on simple-field-write atomicity in practice, or on locking
that lives inside `CoreService` and wasn't visible from `Runtime.cpp` alone —
either way, it's not something to reproduce by accident. Aurora's own design
needs to guard *all* HTTP-writable shared state consistently, not just the
one object that happened to need reassignment.

## Where this fits in Aurora's own module boundaries

huenicorn's `HttpServer`/`Impl`/`Route` abstraction has zero Hue-specific
types in it — it's already a generic library. That argues for putting Aurora's
equivalent in **`core/` as a new shared module** (e.g. `core/Network` or
`core/Http`), not duplicated per app repo. `SetupBackend`/`WebUIBackend`'s
Aurora equivalents (the actual route definitions) should live there too, since
they operate on `Config`, `ZoneMapStore`, `Aurora::App::Registry`, and
`Output::IOutput` — all core types already, not platform-specific ones. Both
`Aurora-App-Windows` and `Aurora-App-Linux`'s `main.cpp` would then just
construct and thread it, exactly like huenicorn's `Runtime::_initWebUI()`
does, keeping the actual route logic written once.

## The one real design fork from huenicorn: reconstruction, not mutation

huenicorn's WebUI handlers mutate live objects in place (reassign
`m_streamer`, edit fields inside `m_channels`). `WebUI/WebUI_Design_1stPass.md`'s plan for
Aurora is more ambitious on purpose: a generic reload entrypoint that tears
down and **reconstructs** Input/Output/Orchestrator from a freshly-loaded
`Config`+`ZoneMapStore`, because switching between video and audio mode needs
an entirely different `Input`/`Orchestrator` *type*, not just a field edit —
in-place mutation can't do that. That means Aurora's HTTP thread and tick-loop
thread need to safely share not just a few fields but potentially **the whole
current pipeline object**. Recommended shape: one mutex guarding a single
swappable "current pipeline" unit (whatever owns the live `Input`/`Output`
instances and the `Orchestrator`/`AudioOrchestrator`); an HTTP handler that
wants to apply a settings change writes `Config` to disk, then requests a
rebuild under that same lock; the tick-loop thread takes the same lock each
iteration to read the current pipeline before calling `update()`. This is a
consistent, single-lock design from the start, specifically to avoid
huenicorn's per-field, easy-to-miss locking pattern.

## Route/response conventions to carry over

- Plain JSON REST, no WebSocket, matching huenicorn (and matching
  `ImplementationPlan.md`'s existing "SSE for streaming, REST for everything
  else" design for the deferred preview feature).
- Static files served from a `webroot`-equivalent directory, same as
  huenicorn's `Utils::getWebFile(res, pageName)` pattern (including its
  `404.html` fallback for an unmatched path).
- Each route: parse request JSON if any → call one method on a real
  Config/Registry/pipeline object → serialize the result → done. No business
  logic inside the lambda itself, matching huenicorn's own convention.

## First-milestone route list (maps to `WebUI/WebUI_Design_1stPass.md`'s Build order)

- `GET /api/capabilities` — reflects the `Registry` (which Input/Output
  plugins are actually compiled in), needed before the frontend can do its
  capability probe (Build order step 3).
- `GET /api/autodetectBridge`, `PUT /api/validateBridgeAddress`,
  `PUT /api/registerNewUser`, `GET /api/entertainmentConfigurations`,
  `PUT /api/setEntertainmentConfiguration` — pairing, modeled directly on
  `SetupBackend`'s real routes (Build order step 5).
- `GET`/`PUT` over `Config`'s user-facing fields (mode, monitor/sink,
  refresh/subsample/interpolation/transition, the audio-effect block) — each
  PUT triggers the generic reload described above (Build order step 11).
- `GET`/`PUT` over `ZoneMap` entries (UV rect, gamma, active), built on the
  existing `reconcileZoneMap` (Build order step 14).
- `POST /api/stop` — a close port of huenicorn's `_stop()`
  (`WebUI.js`/`WebUIBackend.cpp` pairing), including the same
  confirm-before-stop shape already designed in `WebUI/WebUI_Design_1stPass.md`'s Dashboard
  (Build order step 16).
- Deliberately not in this milestone: the MJPEG/SSE preview endpoints — see
  `WebUI/WebUI_Design_1stPass.md`'s Build order for why they're sequenced last.
