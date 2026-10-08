# Web testing

Id: lesson-web-testing

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
[[http-server-analysis]]'s original design) requires every route registered
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

ES modules make it worse: a browser can mix a cached module with a freshly fetched importer. After `main.js` gained an export, Firefox reused its cached `main.js` while loading the new `demo-boot.js`, and the page died with `SyntaxError: The requested module ... doesn't provide an export named: 'setPaused'` (2026-10-08). Plain `python -m http.server` sends only `Last-Modified`, which invites that heuristic caching. A hard refresh fixed it. Ad-hoc static servers for `web/demo` need the same `no-store`, and devstack's viz server lacks it too (Aurora-57ct).

---

## The shim must answer every route the ported UI probes
Tags: demo, shim, routes
Applies-when: adding a backend route consumed by vendored dashboard code

A new /api/version route with no shim answer would have rendered an empty footer on Pages with zero test failures -- the demo suite only covers stubbed routes. The stub, its CHANGELOG-pinned value test, and the seam tripwire all landed in the same commit as the probe.

**Fix:** new backend route consumed by the fork means three edits minimum: shim stub, shim value test, seam marker; grep the fork for fetch('...') against the shim's route list to prove nothing reachable goes unanswered.

---

## The static mount and the embedded-file map have separate content-type tables, so a new asset type can work in a dev run and break only in a release build
Tags: httpserver, webui, embedded, mime, release
Applies-when: adding a new file type (GIF, WebP, font, video) under `web/ui`

Aurora-qps.8 added `web/ui/icons/MacTray.gif`. A dev run served it correctly as `image/gif` because dev uses `serveStaticFiles()`, i.e. cpp-httplib's own mount, whose built-in MIME table knows `.gif`. Standalone and release builds serve `serveEmbeddedFiles()` instead, and its `contentTypeFor()` (`HttpLibServerImpl.hpp`) is a separate hand-written table with no `.gif` entry, so the same file would have been sent as `application/octet-stream` and relied on browser sniffing. A browser pass against a dev run could never have shown it. `embed_webroot.py` was already binary-safe, so the only gap was the table.

**Fix:** added the entry and two `NetworkTests` cases, one per serving path, each asserting the `Content-Type` header (the embedded one also asserts NUL and high bytes survive). General principle: when two code paths serve the same files (dev mount vs. embedded), a new file type needs a check on each, and "it loads in my dev run" says nothing about the embedded path. Check `contentTypeFor()` whenever a new extension lands in `web/ui`.

To exercise the embedded path on a dev machine: `resolveWebRoot` (`app/*/include/Aurora/App/WebRoot.hpp`) only falls back to the embedded map when neither `AURORA_WEBUI_DIR` nor the baked checkout path is an existing directory, and an env var pointing at a nonexistent dir does not force it. Temporarily moving `web/ui` aside before launching does (restore it right after), or run the bundle on a machine without the checkout.

The reverse also holds. Dev mode never consults the embedded map, so a build-only artifact that has no source-dir copy (the Aurora-lzj graph editor's Vite bundle) must come from an embedded map in both modes. `serveEmbeddedFilesAt(prefix, map)` exists for this: its routes answer only under the prefix and work beside the static mount.


---

## An entry script with import-time side effects can be proven equivalent by running HEAD and the working copy against stub modules
Tags: webui, refactor, testing, no-dom, equivalence
Applies-when: refactoring `web/ui/app.js` (or any browser entry that runs on import and navigates through injected screens)

No DOM harness exists, so Aurora-4y9's `app.js` refactor had nothing to run. Copy `git show HEAD:web/ui/app.js` and the working copy into two sibling dirs, give each stub `shell.js`, `Tooltips.js` and `screens/*.js` that append their constructor name and key options to a shared trace, fake `globalThis.fetch` per scenario, and `await import('./<dir>/app.js?r=N')` (the query string defeats the module cache; `bootstrap()` runs on import). After each settle, call the last screen's `onComplete`/`onBack` and record again. 641 scenarios x 4 walks ran in seconds and `cmp` on the two traces is the verdict. Prove the harness can fail: break the copy on purpose (hard-code a flag, drop a guard) and confirm the diff.

Related trap: `styles/mac-tray-tip.test.mjs` asserts on `app.js` *source text*, so a pure rename (`state.platform` -> `platform`) fails it with a message about "gating" that reads like a behaviour break. After a refactor, run every `web/ui` test, not just the ones for the code you touched, and update the string deliberately.

---

## Headless Firefox here: `--screenshot` fires on load and exits, so read async-rendered DOM text through a beacon instead
Tags: firefox, headless, screenshot, snap, browser-verification
Applies-when: checking a WebUI screen that fills in after its first render (fetch-driven labels) in headless Firefox on this Linux box

Aurora-a0r's label check hit three snags. (1) With the user's own Firefox open, `firefox --headless` exits "already running, but is not responding"; add `--no-remote --profile <dir>`. (2) The snap Firefox can't see `/tmp` or scratchpad paths ("Could not find profile folder", no screenshot written); keep the profile and `--screenshot` output under `$HOME`. (3) `--screenshot` captures at the load event and quits: a screen that fetches labels after mount shows "Loading…" or bare "Zone N", which reads like a bug. Top-level `await` in the page module doesn't hold `load` open, and the process exits before any timer fires.

**Fix:** temporary harness page in `web/ui/` (served by the app from source) that mounts the screen, waits, then `navigator.sendBeacon('http://127.0.0.1:<port>/', document.body.innerText)` to a 15-line Python POST sink; run `timeout 15 firefox --headless --no-remote --profile ~/<dir> <url>` (no `--screenshot`) and read the sink's file. Delete the harness page and profile afterwards.

**Simpler, when the screen just needs to settle (Aurora-kea, 2026-10-03):** the cached Playwright headless shell (`~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell --no-sandbox --window-size=480,1100 --virtual-time-budget=6000 --screenshot=<png> <url>`) holds the capture until virtual time runs out, so fetch-driven Dashboards render fully with no harness page. To compare against `HEAD`, serve a `git archive HEAD web/ui` export through `AURORA_WEBUI_DIR` on the same daemon and pixel-diff the PNGs (PIL `ImageChops.difference(...).getbbox()`); a `None` box is pixel-identical.

---

## A WebSocket client test needs no external echo server: httplib ships the server side
Tags: websocket, httplib, testing, cross-platform, ha
Applies-when: writing a C++ test (or a fake Home Assistant) that needs a ws:// peer

Aurora-d9v's bead assumed "a local ws:// echo server", i.e. a separate process and a port to pick per platform. cpp-httplib >= 0.46 has `Server::WebSocket(pattern, handler)` with a blocking `ws::WebSocket::read/send` loop, so the test hosts its own peer: `bind_to_any_port("127.0.0.1")`, `listen_after_bind()` on a thread, `wait_until_ready()`, then `httplib::ws::WebSocketClient("ws://127.0.0.1:<port>/path")`. No Python/Node dependency, no port clash, identical on Linux, Windows and Mac. The same handler shape works for a scripted fake HA server (auth handshake, `get_states` reply) when the HA client lands. `ws::ReadResult` (`Text`/`Binary`/`Fail`) lives in `httplib::ws`, not `httplib`. Stop with `server.stop()` and join the thread before the server goes out of scope.

---

## A version string duplicated in code and checked against `CHANGELOG.txt` fails the first time someone starts a release entry and nobody runs the web tests
Tags: version, changelog, demo-shim, web-tests, ci
Applies-when: starting a release entry in CHANGELOG.txt, or `demo-shim.test.mjs` fails with "shim version matches CHANGELOG"

`web/demo/demo-shim.js` hardcodes the version it returns from `/api/version`, and `demo-shim.test.mjs` asserts it equals the top `v…` line of `CHANGELOG.txt`. The 1.0.5 entry was started with the shim still at 1.0.4. The test guarded this correctly, but it had never run since: the web workflow never fired, and the web tests aren't part of `ctest`. The first CI run on a PR was the first time anyone ran it.

**Fix:** the shim's version is bumped in the same commit that opens a new changelog entry. Running the web workflow's loop locally (`for t in web-processing/*.test.mjs web/demo/*.test.mjs web/ui/styles/*.test.mjs; do node "$t"; done`) is the pre-commit check; the web workflow now runs it on every PR touching `web/**`.

---

## The Origin-vs-Host write gate 403s the WebUI if a dev proxy rewrites Host
Tags: routes, security, vite, proxy, origin
Applies-when: adding or changing a dev-server proxy in front of the daemon

Since Aurora-5i3, `_wrapHandler` rejects a non-GET request whose `Origin`
host differs from its `Host` (port ignored). Vite's `/api` proxy in
`web/graph-editor` passes, because by default it forwards the browser's
`Host` unchanged. Adding `changeOrigin: true` rewrites `Host` to
`127.0.0.1` while Origin stays `localhost`. Every PUT/POST then fails with
`cross_origin_forbidden`, but GETs still work, so it can look like a broken
route.

**Fix:** leave `changeOrigin` off, or open the dev page at the same host
the proxy targets.

## Driving the banner live: API calls lag a beat, and a UI switch overwrites a bogus saved input
Tags: live-test, playwright, banner, heartbeat, mode-switch, fake-bridge
Applies-when: live-checking shell-banner behavior with Playwright against a running daemon, or trying to make a Dashboard mode switch fail on purpose

Aurora-98pr's live checks hit three traps. (1) The banner only redraws on the beat (about 5s) or after a UI action's `checkNow()`. A `fetch` sent from the test (PUT/POST) changes daemon state without a re-check, so the page shows the old row; clicking its X then sends the old `id`, a correct stale no-op that looks like a broken X. Wait a beat (or `waitForFunction` on the banner text) before asserting or clicking. (2) A Dashboard mode switch cannot be made to fail with a bad saved `activeInputName`: its PUT sends the screen's own device fields, so the bad value is overwritten and the build succeeds. A bad saved `activeOutputNames: ["nonexistent-output"]` does fail it ("No outputs available") because the switch never sends outputs. Taking the fake bridge down does not fail a build (Hue init failures are swallowed by design). (3) Saving a working input while an error is held does not reload (the running baseline already matches), so the error stays until Retry or a structural save.

**Fix:** for a failing UI switch, save the bad output, dismiss that first row, then click the toggle. Mock `GET /api/state` with `page.route` only for states a Mac cannot be put in (a running host with a `permission_denied:` row) and say it was mocked in the log. A binary exec'd from the shell runs under the terminal's grant, so real denials need an `open`-launched bundle (see the macos-gui entry on terminal-inherited grants).
