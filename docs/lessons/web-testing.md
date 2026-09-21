# Web testing

jsdom, live tests, routes, settings round-trips, browser cache. See [README.md](README.md) for filing rules.

---

## A static-file mount point can shadow a registered API route at the same path, and the library's own dispatch order decides who wins
Tags: httpserver, webui, cpp-httplib, routing
Applies-when: adding WebUI static files or API routes on one server

Wiring `HttpServer::serveStaticFiles()` (Aurora-WebUI's static frontend) and
the pairing/capabilities API routes together for the first time, rather than
assume cpp-httplib dispatches registered handlers first, its real
`Server::routing()` source was read directly: for GET/HEAD requests,
`handle_file_request()` (the static mount) runs *before* `dispatch_request()`
against registered handlers, and wins outright if a matching file exists.
Safe today only because Aurora-WebUI's own files never collide with an
`/api/...` path -- nothing in the framework prevents a future static file
from silently shadowing a route with the same path, and a shadowed route
fails with no error, just a response that looks like a static file instead
of running the handler at all.

**Fix:** documented as a hard rule (never add a file under `api/` in
Aurora-WebUI) rather than an implicit assumption, in the repo's own README
where a future contributor adding WebUI files would actually see it. General
principle: whenever a static-file mount and a registered-route system share
one HTTP server, check the library's real dispatch order before assuming
routes take priority -- a silent shadow is much harder to notice than an
outright conflict error, since a request to a shadowed path still returns
*something*, not a failure.

---

---

## No headless-browser tool exists in this environment, but jsdom against real files (installed dev-only, outside the repo) exercises real DOM/JS behavior instead of relying on code review
Tags: webui, testing, jsdom
Applies-when: verifying WebUI JS with no browser available

Building Aurora-WebUI's app shell (`shell.js`'s `navigate()`/settings-modal
logic, `topBar.js`'s rendering) needed real verification, but no browser-
automation tool is available to this agent in this environment (no
Playwright/Puppeteer-equivalent). Node itself also isn't on this machine's
WSL2 `PATH` (only Windows' own install is), so the check runs from the
Windows side.

**Fix:** `npm install jsdom --no-save` in the session's scratchpad directory
(never the repo -- it's a test-only dependency, same relationship Catch2 has
to the C++ repos' shipped binaries) and load the real `index.html`/`.js`
files from disk into it via `pathToFileURL()`, with `global.document`/
`global.window` set from the `JSDOM` instance before importing any module
that references bare `document`. This exercised real behavior no amount of
reading the code would have proven on its own: settings-modal open/close via
direct calls *and* real scrim/close-button click events, `navigate()`'s
actual mount-then-unmount-previous ordering, and confirming a screen title is
rendered via `textContent` (escaped) rather than interpolated as markup.
Genuine visual/layout verification in an actual browser is still a real gap
this doesn't close -- worth remembering as still outstanding, not solved by
the jsdom pass.

---

---

## A live end-to-end test against a real endpoint needs a settle time sized to the system under test's own timeouts, not to how fast a mocked test resolves
Tags: testing, webui, e2e, timeouts
Applies-when: writing live or unmocked WebUI tests with waits

A live (unmocked) test of `OutputConnectScreen`'s Autodetect button against
the actual running server failed a "button re-enabled" assertion after a
100ms wait -- the same wait that was plenty for every other jsdom test in
this build, all of which used a mocked `fetch` resolving on the same tick.
Root cause: `HttpClient.cpp`'s `sendHttpRequest` sets `CURLOPT_TIMEOUT` to a
flat 1 second for every outbound call, including the server-side proxy to
`discovery.meethue.com` -- a real internet round trip this specific request
makes that no mocked test path ever exercises. 100ms was never going to be
enough once a real 1-second-capped network call was actually in flight.

**Fix:** raised the live test's settle time to 2.5s, comfortably past the
known 1s server-side timeout. General principle: a live/E2E test's wait time
should be derived from the real system's own configured timeouts (grep for
them if unsure) plus margin, not copied from a mocked test's own near-instant
settle time -- the two kinds of test have fundamentally different real
latency floors, and a wait that's fine for one will flake or falsely fail on
the other.

---

---

## A library's own "register everything before X" contract can force a slow dependency's construction earlier than it used to happen, with a real latency cost only testing surfaces
Tags: httpserver, startup, latency
Applies-when: adding routes that need later-built objects

Adding `/api/monitors` and `/api/reload` required both routes to capture a
`PipelineHost` by reference -- meaning the whole Input/Output/Orchestrator
pipeline now has to be built *before* `httpServer.bind()`, since
`HttpServer`'s own contract (documented in its header, from
`HttpServerAnalysis.md`'s original design) requires every route registered
before `bind()` is called; there's no add-a-route-after-bind path. Previously
the server bound and started listening immediately after `Config` loaded,
with pipeline construction (real DXGI monitor enumeration on Windows) coming
*after*, in parallel with the server already being reachable. Reasoning about
the code alone made this look like a harmless reordering. Polling
`/api/capabilities` every 500ms after process launch measured the real cost:
~1.5-2s before the WebUI became reachable at all, versus near-instant before.

**Fix:** not solved here -- accepted as a documented tradeoff (a
nullable-initial-pipeline design, with routes and the tick loop tolerating
"not ready yet", would close the gap but adds real edge-case surface for a
few seconds of startup latency on an already-slow-starting piece). General
principle: when a new route needs a reference to something built later than
routes used to need to exist, check whether the library's own "must register
before X" contract now forces that something to be built earlier than
before -- and measure the actual latency delta by testing (poll for
readiness), don't just reason that a reordering is "probably fine."

---

---

## Saving a "reset to auto" sentinel can get silently overwritten by the very reload that save triggers, before it's ever observed
Tags: config, reload, webui, settings
Applies-when: exposing reset-to-auto semantics in a settings UI

Building the Tuning screen's `subsampleWidth` field ("0 = auto"), a live
`PUT /api/config` setting it to `0` returned `0` correctly in that same
response -- but a `GET /api/config` moments later already showed a concrete
number (`48`) again, not `0`. Root cause: every settings `PUT` funnels
through `onConfigChanged` into `PipelineHost::reload()`, which calls
`Pipeline::build()` fresh; while still in video mode, that rebuild's
`Orchestrator::init()` sees `subsampleWidth() == 0` and re-derives it from
the display immediately, then persists the derived value right back via its
own explicit `ConfigStore::save()` call -- all before the *next* `GET` ever
runs. The `PUT`'s own response wasn't wrong (it reflects state right after
the patch, before that reload's side effect lands); reasoning from that
response alone would have concluded "auto persists as `0`," which is false
the moment reload finishes. This is also a different "0/empty means auto"
contract than `Config::activeMonitorName`'s, which stays genuinely empty in
persisted config forever unless explicitly set -- two auto conventions in
the same app, resolving differently, easy to conflate.

**Fix:** not a bug -- `0` legitimately means "please re-derive," and it
does, correctly. Documented rather than papered over: a UI exposing a
"reset to auto" value needs to say so honestly (no claim that reopening the
screen will show `0` again) once the same request that saves it also
triggers a reconstruction that can immediately resolve and re-persist it.
General principle: when a value's own setter or the reload it triggers can
rewrite that same value again before anyone reads it back, verify the
*settled* state with a fresh read after the write's own side effects have
had a chance to run -- a write's own response body only proves what was
true at that instant, not what's true a moment later once its side effects
finish.

---

---

## A write endpoint that requires a full object round-trip breaks the moment its paired read endpoint withholds part of that object from the client for security
Tags: api, security, hue-connection
Applies-when: adding a write endpoint paired with a field-withholding read

`POST /api/hue/connection` originally required the entire `HueConnection`
(`bridgeAddress`/`username`/`clientkey`/`entertainmentConfigurationId`)
and overwrote unconditionally -- fine for the one call site that existed
when it was built (`OutputConnectScreen`'s `_finish()`, which had just
received all four from a fresh pairing). Adding a second, legitimate
caller that only wants to change `entertainmentConfigurationId` (Zone
Mapping's own picker) exposed a real structural problem: `GET
/api/hue/connection` deliberately withholds `username`/`clientkey` from
the frontend (a correct security choice, not an oversight -- the browser
never needs them once paired), which means no frontend code can ever
reconstruct a valid full body to resend. The full-overwrite write endpoint
and the field-withholding read endpoint were each independently correct
in isolation, but composed to make an entire legitimate class of caller
(anything that only wants to change one already-persisted field)
structurally impossible without either re-exposing the secret or
re-running the whole pairing flow just to change one dropdown.

**Fix:** made the POST merge-style (PATCH semantics: load the persisted
object first, overwrite only fields present in the request body), the
same convention `/api/config` and `/api/zones` already use elsewhere in
this same codebase. General principle: whenever a read endpoint
intentionally hides part of an object from the client (secrets, tokens,
anything write-only), check whether the paired write endpoint requires a
full round-trip of that same object -- if it does, no client can ever use
that write endpoint for anything less than a full re-supply of the hidden
fields, which is a design bug waiting for its first partial-update caller,
not a hypothetical.

---

---

## A dev server with no `Cache-Control` header on any response can make a genuinely correct fix look like it didn't work, indistinguishable from a real bug
Tags: webui, browser-cache, debugging
Applies-when: a WebUI fix retests as not working

Fixing the "lands on an earlier onboarding screen after relaunch" report
took three real, independently-necessary code fixes -- and along the way,
two of the live retests that were supposed to confirm each fix instead
"failed," including one already (wrongly) marked done in a doc before that
retest came back. Both false failures had the same cause, only found once
suspected directly: `HttpServer` (`HttpLibServerImpl.hpp`) set no
`Cache-Control` header on any response at all. Aurora-WebUI's frontend is
served straight from disk with no bundler, so every edit ought to be live
on the next request -- but with no caching directive either way, a browser
is free to keep serving an already-cached copy of a `.js` file from before
the edit, and a relaunch of the *native app* does nothing to that cache,
since it's entirely client-side and outlives the server process. A hard
refresh mid-session visibly advanced past a screen a plain relaunch hadn't
moments earlier -- the same code, the same backend, the only difference
was which copy of the JS the browser happened to execute.

**Fix:** `set_post_routing_handler` now adds `Cache-Control: no-store` to
every response -- confirmed against cpp-httplib's real source
(`write_response_core`) that this hook fires for static file responses and
registered routes alike, not just one or the other. General principle: a
local, single-user dev server serving files straight from disk should
default to no caching at all, full stop -- the cost (re-fetching a handful
of small files on every navigation) is negligible, and the alternative is
a standing, silent source of "my fix isn't working" false alarms that look
exactly like real bugs and can burn real debugging time before anyone
thinks to suspect the browser's cache instead of the code.

---
## The shim must answer every route the ported UI probes
Tags: demo, shim, routes
Applies-when: adding a backend route consumed by vendored dashboard code

A new /api/version route with no shim answer would have rendered an empty footer on Pages with zero test failures -- the demo suite only covers stubbed routes. The stub, its CHANGELOG-pinned value test, and the seam tripwire all landed in the same commit as the probe.

**Fix:** new backend route consumed by the fork means three edits minimum: shim stub, shim value test, seam marker; grep the fork for fetch('...') against the shim's route list to prove nothing reachable goes unanswered.
