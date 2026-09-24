# Debugging method

Evidence handling, verification altitude, oracles, timing, diagnosis vs fix. See [README.md](README.md) for filing rules.

---

## When a run's own evidence contradicts the real-world outcome, distrust the evidence and re-derive it with narrow, independent probes
Tags: debugging, live-testing, hue
Applies-when: a clean run contradicts real-world behavior (lights, capture)

A full `aurora-app-linux` run printed clean output and reconciled its saved
zone map with no changes — read at the time as confirmation the Hue
transcription was correct. The physical lights never moved. The reconciled
file being read, though, wasn't the file the run actually used (see the
entry above) — the "confirmation" was accidentally re-reading a hand-written
file the app had never opened. Continuing to trust that evidence would have
stalled on the wrong layer indefinitely.

**Fix:** once a real run's outcome contradicts what its own logs/files
suggest, stop trusting those artifacts and build a small standalone probe
per suspected stage instead — a bare `HueOutput` fed explicit test colors (to
isolate REST+DTLS from capture), a bare `X11Grabber` printing frame means (to
isolate capture from everything downstream), `ss -u -a -n -p` against the
running process's PID (to check a real socket exists rather than trusting
`isConnected()` was even reachable). Each probe either confirms or rules out
one layer independently of the others' claims about themselves.

---

---

## Two symptoms that look identical (colors clustered together on a wheel) can have completely different causes if produced by different code paths
Tags: debugging, audio-vs-video, hue
Applies-when: diagnosing a symptom shared by two modes or pipelines

A real-hardware vibrancy comparison against huenicorn led into an extended
investigation of Aurora's *video* zone-mapping pipeline (crop UV
coordinates, `getDominantColor`, subsample-then-crop ordering) diffed
line-by-line against huenicorn's equivalent — all to explain why every
light's dot landed clustered near the center of the Hue app's color wheel
instead of spread out and saturated. All of it matched huenicorn
byte-for-byte; none of it was the cause. The actual run being compared
turned out to be in **audio-reactive mode**, not screen-capture mode —
`AudioFrameCompositor::composeAudioFrame` intentionally broadcasts one
shared color to every zone (`AudioOrchestrator` has "no per-zone spatial
concept" by design, unlike video's `Orchestrator`), so lights clustering
together on the wheel was expected behavior for that mode, not a
zone-mapping bug at all — the video-pipeline diffing that produced it was a
real, separate, and genuinely correct finding (see `output.md`'s RGB-vs-XYB
entry), but it wasn't the explanation for *this* symptom.

**Fix:** nothing code-side — the desaturation itself was real and got fixed
(the RGB-vs-XYB colorspace bug, which affects both modes since they share
`HueOutput::send()`), but the "why are all the dots clustered together"
half of the observation needed no fix at all once which mode actually
produced it was confirmed. General principle: before diagnosing why an
observed symptom happened, confirm which code path actually produced the
run being looked at — two modes (or backends, or configs) sharing a
surface-level symptom don't necessarily share a mechanism, and diffing the
wrong one's implementation against a reference can consume real effort
without ever being wrong enough to notice, since every individual
comparison along the way can still come back genuinely clean.

---

---

## A lesson entry naming a root cause is a diagnosis, not a fix -- the landmine stays live until something actually acts on it
Tags: process, tech-debt, lessons
Applies-when: recording a root cause without removing it

Implementing `../WebUI/WebUI_Design_2ndPass.md` step 3 hit the exact same
`Catch2d.lib`/`__std_search_1`-style link failure the two entries above
already describe. Investigating from scratch (per this session's own
`prefer-code-confirmed-hypotheses-over-library-internals` habit) surfaced
a *third*, more specific root cause neither entry's fix actually resolved:
a stray "Visual Studio Build Tools 2026" instance, registered as a real
Windows product (`Program Files (x86)\...\Visual Studio\18\BuildTools`),
that vcpkg's own compiler auto-detection always preferred over the real
VS 2022 install -- confirmed by `dumpbin`-scanning VS 2022's own toolset
libs (the missing symbols exist nowhere in them) and its own headers
(nothing references `__std_search_1` either), then confirming the stray
instance's headers do declare it. The entry just above already names this
exact instance ("a cancelled 'VS Build Tools 2026' instance") as the
*other* bug's root cause -- it had been correctly diagnosed once already,
written down, and then never actually uninstalled, so it kept causing new,
differently-shaped symptoms in later sessions.

**Fix:** when a lesson entry names a specific root cause (a stray install,
a leftover file, a bad config value), treat "diagnosed" and "fixed" as two
different states and check which one actually happened -- a past entry
describing a workaround around a root cause (not the removal of it) means
the landmine is still live and will resurface differently later. If the
root cause is a piece of state on disk (like this stray VS instance), the
actual fix is removing that state, not re-deriving a workaround each time
it bites.

---

---

## An env-var override "succeeding" (per a tool's own log message) doesn't prove it changed which binary actually got produced
Tags: vcpkg, debugging, verify-artifact
Applies-when: an override claims success but symptoms persist unchanged

Chasing the link failure above, `VCPKG_VISUAL_STUDIO_PATH` was set to
force vcpkg to use VS 2022's toolset instead of the stray VS 18 instance.
vcpkg's own output confirmed this -- `Compiler found: .../2022/Community/
.../14.37.32822/cl.exe` -- and the resulting `catch2` package installed
without error. The link still failed identically. The override changed
what vcpkg *printed* and used for its ABI-hash bookkeeping, but not which
compiler its internal port-build script actually invoked for the real
compile step (still the stray VS 18 instance, confirmed after the fact by
`dumpbin`-checking the produced `.lib` for the disputed symbols). A
tool's own "here's what I'm doing" log line is not independent
confirmation that an override took effect end-to-end -- it can be
correct about one internal step (hash computation) and silently wrong
about another (the actual build invocation) in the same run.

**Fix:** when an override appears to work per a tool's log output but the
downstream symptom is unchanged, verify the *artifact*, not the log --
inspect the actually-produced binary (`dumpbin`, `nm`, checking a
timestamp or embedded compiler version) rather than trusting a
success-shaped message from the step in between.

---

---

## Confirming a crash is gone is not the same as confirming the intended user flow now works
Tags: verification, onboarding, webui
Applies-when: verifying a crash fix beyond the crash itself

Fresh-install repro: deleting `%APPDATA%\Aurora` and relaunching threw
before `httpServer.bind()` ever ran. First fix (making that throw
non-fatal, `PipelineHost` tolerating no `Pipeline`) was verified live --
the WebUI bound, served `/api/capabilities`, no crash -- and reported as
done. It wasn't: `/api/capabilities`'s `outputs` list came from
`registry.outputNames()`, which `registerOutputs()` only populates with
`"hue"` once credentials are *already* configured. `app.js`'s onboarding
gate and `DashboardScreen`'s Bridge row both read that same list as "is
Hue compiled into this build" -- so a real fresh install would see
`hasHue: false`, skip Output Connect entirely, and dead-end on a Dashboard
whose Bridge row was permanently disabled with no path to pairing at all.
The crash fix was necessary but tested at the wrong altitude: "does the
process survive" instead of "can a new user actually reach the thing they
need." Caught only because the user asked "what's the intended flow for a
new user then?" instead of accepting the crash fix as the whole answer.

**Fix:** decoupled the two meanings that had been conflated in one field --
`registerCapabilitiesRoute()` now reports `"hue"` whenever
`AURORA_OUTPUT_HUE_IO_AVAILABLE` is compiled in, regardless of
`registry.outputNames()`, matching that route's own documented contract
("compiled with," not "already paired"). General principle: after fixing a
crash, trace the *next* real user action through the code the same way a
JTBD pass would (see `planning.md`'s zone-mapping entry) -- a fix that only
stops the immediate error can still leave the surrounding flow a dead end,
and "no exception thrown" and "user can do the thing" are different claims.

---

---

## Fixing the bug a symptom made visible can unmask a second, previously-dormant bug the first one had been silently absorbing
Tags: debugging, live-testing
Applies-when: a fix opens a previously always-failing path

A short live-testing chain, each fix genuinely correct and independently
verified, still surfaced this pattern three times in a row.
`registerOutputs()` only ever registered `"hue"` once, at daemon startup;
fixing it to re-run after a live pairing made `Pipeline::build()`'s next
reload *succeed* for the first time during onboarding -- which is exactly
what let its own separate, pre-existing "default to `\"windows\"` video
input when nothing is configured yet" behavior actually run and start
driving real lights a full screen before the user had ever confirmed a
capture source. That default had been there all along; it was harmless
only because the earlier "no outputs available" bug had always thrown
first, so nothing downstream of it was ever reachable during onboarding.
Separately, `HueOutput::shutdown(isReplacement)` fixed a reload's old
instance from sending an authoritative bridge-side stop that killed the
new instance's already-started stream -- but a live retest after that
shipped still showed the same class of symptom (mode-switching not
actually reaching the bulb), and reading the code turned up a *second*,
independent call site (`EntertainmentConfigurationSelector`'s own
`disableStreaming()` on an already-active target) capable of sending the
exact same disruptive stop, never touched by the first fix because the
bug report that prompted it only pointed at the symptom's most visible
occurrence.

**Fix:** none of these needed reverting -- each fix was correct for the
bug it targeted. The general principle is procedural: after a fix makes a
previously-always-failing path start succeeding for the first time, treat
everything newly reachable through that path as unverified, not as "already
covered by existing tests/review," since nothing could have exercised it
before. And when a bug report describes a symptom a previous, already-
shipped fix was *supposed* to prevent, don't assume the report is stale or
mistaken -- grep for every other call site capable of producing the same
class of failure (the same disruptive action, the same silently-overloaded
default, the same never-registered state) before concluding the first fix
missed nothing.

---

---

## Diagnostic timers added independently across files each measure elapsed time from their own private starting point, and comparing them directly produces a real but meaningless number
Tags: debugging, logging, timing
Applies-when: adding timing logs across call sites

Chasing a live "capture screen doesn't activate" report, timing logs were
added incrementally, one call site at a time, as each new suspect surfaced:
a `PUT /api/config` handler's own `steady_clock` start/end pair, then
separately a `Streamer`'s own `steady_clock` timestamp captured at its
construction. Comparing "handler took 1088ms total" against "first
`streamChannels()` call, 3191ms after `Streamer` construction" and
concluding the whole gap sat inside the handshake was wrong -- not because
either number was inaccurate, but because they're durations from two
different, uncoordinated zero-points (request start vs. mid-request object
construction), and nothing about reading them side by side reveals that.
The arithmetic needed to relate them correctly is exactly the kind of thing
easy to get wrong once several such private timers exist across different
files, since each one looks individually well-formed.

**Fix:** replaced every relative `steady_clock` timer with one shared
`_dbgMs()` helper (wall-clock milliseconds-since-epoch, duplicated per file
since these were throwaway diagnostics not worth a shared header) so every
log line lands on the same timeline and can be diffed directly, no mental
reconstruction required. General principle: the moment a second independent
relative timer joins a diagnostic session, stop trusting arithmetic between
them and switch to one shared clock (wall-clock timestamps on every line is
the simplest form) -- the risk isn't that any one timer lies, it's that
comparing two truthful timers with different starting points looks exactly
like a valid comparison until it's manually unpicked.

---

---

## A source diff isn't a tested fix until the running binary contains it
Tags: verification, build, live-testing
Applies-when: retesting after an edit against a running daemon

After wiring the audio-mode zone branches into `Aurora-App-Windows`
(`Pipeline::listZones()`/`updateZone()` delegating to `m_audioOrchestrator`),
a Debug run showed no channel toggles in the Dashboard Bridge list -- the
binary simply predated the edit; no rebuild had happened in between, and the
old daemon was still the running process. Indistinguishable from a failed
fix until the timestamps were compared.

**Fix:** process, not code -- before re-diagnosing a "fix didn't work,"
check the binary's build timestamp against the edit, make sure the old
daemon process is actually dead, and probe the API directly (`GET
/api/zones` in the failing mode) to separate backend staleness from UI
staleness. General principle: the edit → build → relaunch chain has three
links, and a break in the second two looks exactly like a bug in the first.

---

---

## A check that shares its subject's bug proves nothing -- verify the verifier against an independent count
Tags: testing, verification, oracle
Applies-when: writing a check or comparison script

A key-coverage script reported frontend and backend tooltip keys matching
22-to-22, clean both directions -- because both sides used the same key
regex, which silently excluded two-dot `output.hue.*` keys. Green on both
sides, wrong on both sides; caught only by comparing the total against the
live endpoint's 26.

**Fix:** every check needs an oracle independent of the artifact under
test -- a live count, a second method, a golden value. When a comparison
passes suspiciously neatly, ask what shared assumption could make both
sides agree, and go count something real.

---

---

## When dolt panics with a nil-pointer stack trace, read the warning line above it -- the real error is a failed mkdir
Tags: debugging, beads, dolt, sandbox
Applies-when: bd bootstrap or bd init dies with a Go panic instead of an error

bd bootstrap fell back to the JSONL import path and then segfaulted inside dolt config creation (DoltCliConfig.createLocalConfigAt nil dereference). The cause was one line above the panic: mkdir /home/mewuz/.dolt: read-only file system -- dolt needs a writable home for its config, and the nil config crashed the caller instead of returning the error.

**Fix:** run with HOME pointed at a writable dir (HOME=/tmp/bdhome bd bootstrap); dolt creates its config there and the import proceeds. General rule: a Go panic in a CLI tool usually means an unchecked error return -- scroll above the stack trace for the last plain-language warning, that is the diagnosis.


---

---

## A checker that passes vacuously is worse than no checker -- verify it can fail
Tags: debugging, verification, guards, ci
Applies-when: running a repo checker through a pipe, wrapper, or from the wrong directory

check-lessons.sh cds to its own dirname ($0-relative), so piping it via stdin (tr ... | bash) silently ran it in the wrong directory: the file globs matched nothing, fail stayed 0, and it printed a green OK over zero evidence. The same trap applies to any guard whose pass condition is the absence of failures rather than the presence of checks.

**Fix:** run guards from their own directory (or via a temp copy placed beside them), and distrust the first green run after any invocation change -- confirm it actually inspected files (entry counts, file lists) before believing it.
---

## Diff before staging when the owner co-edits the same file
Tags: process, git, verification
Applies-when: committing in a tree the owner is actively rewriting

Two README commits silently swept the owner's concurrent edits (a tagline rewrite, a trimmed sentence) inside agent-authored changes -- caught only on the stat, twice. The check-then-commit rule fixed it, but only after history already mixed authorship.

**Fix:** never stage-then-inspect in one motion on shared files; run the diff first as its own step (separate from the commit command, where tool warnings can bury it) and flag every hunk you didn't write before anything is staged.
---

## The committed beads export rebuilds the live database
Tags: process, recovery, beads
Applies-when: bd reports no database after branch surgery or cleanup

The live embeddeddolt directory is disposable gitignored state; issues.jsonl is the durable record. `bd init` plus `bd import` rehydrates all issues (66/66 here) from the export with upsert semantics -- but only up to the last `bd export`, so export-before-risky-git-ops is the habit that makes this true.

**Fix:** never debug the missing live DB; re-init, re-import from the committed export, verify the count, continue. And keep the export fresh: it is the backup.
---

## Restore first on obvious safe states, report in the same breath
Tags: process, verification, git
Applies-when: the tree sits on the wrong branch (or similar) with no unique work at risk

A checkout found on a generated mirror branch (no diverging commits, `git diff -w` empty) was left for the owner to clean up while the agent kept investigating around it. The read-only checks proving safety took a minute; the dithering cost the owner a cleanup.

**Fix:** verify safety with read-only evidence, perform the obvious restore, and report both together. Applies to any agent or human driving: the evidence bar is the same regardless of platform.

---

## flock() treats separate opens independently, so a same-process double-lock test is a valid proxy
Tags: testing, posix, lock, verification
Applies-when: unit-testing an flock-based exclusion lock without spawning processes

Unlike fcntl POSIX locks (per-process, merge), flock binds to the open file description -- a second LOCK_EX|LOCK_NB on another fd fails with EWOULDBLOCK even in-process. InstanceLockTests' same-root-exclusion case therefore exercises the real cross-process mechanism, not a tautology.

**Fix:** keep the three Catch2 cases (same-root exclusion, independent roots, reacquire) as maintained coverage; live double-launch stays manual/CI-smoke.

---

## A bound picked by reasoning is a hypothesis -- time the real system at each candidate value
Tags: debugging, verification, oracle, guards
Applies-when: choosing a clamp/maximum for a rate, timeout, or resource bound

`Config::kMaxRefreshRate` was first set to 1000 by argument (an order of magnitude above any display, so "necessarily garbage"). On real hardware 1000Hz still wedged the daemon -- the 1ms tick never yields its mutex -- while 240Hz (the UI presets' top) answered in milliseconds. Endpoint timings at 1000/240/60 decided the constant, not the argument; the 1000 shipped and had to be revised in a follow-up commit.

**Fix:** the committed max is 240 with the measurement in the commit message. General principle: a clamp is a claim about the world below the bound *and* the bound itself being safe -- the second half needs a live oracle (endpoint timings, tick cost), never just a bigger number.

---

## Refresh-across-restart is a diagnostic: it separates persisted-state bugs from in-flight ones
Tags: debugging, live-testing, onboarding
Applies-when: triaging a stuck onboarding flow you cannot instrument

A black screen on every launch became "lands on Zone Mapping and proceeds" after a refresh-with-healthy-backend. That single contrast proved the persisted config was healing correctly and isolated each remainder to in-flight behavior (hung endpoint awaits, then a silent 4.5s apply-await) without any instrumentation. Each recovery step was verified the same way: curl the probe endpoints the UI awaits and compare against what the screen shows.

**Fix (method):** when the UI hangs, curl the exact endpoints its current screen awaits (`/api/monitors`, `/api/zones` here) with timings before touching code. General principle: the UI's await set is the primitive oracle -- a hanging endpoint is the bug until proven otherwise.

---

## Crash-on-exit hides behind GUI launches -- test shutdown by destroying the object
Tags: debugging, verification, guards
Applies-when: owning a component with a worker thread joined in its destructor

`~TrayIcon` called `get_future()` on an already-moved promise, throwing `future_error` out of the `noexcept` destructor -- terminating the process on *every* shutdown. Invisible for the same reason GUI launches hide all stderr: exits already "look" abrupt, so nobody noticed the daemon never exited cleanly. Found in a log tail, not via any test.

**Fix:** retrieve the future before moving the promise; regression test constructs and destroys a `TrayIcon` (pre-fix it aborts the runner, which is the honest signal). General principle: every RAII type with a joining destructor gets a construct-and-destroy case -- shutdown is behavior, and untested shutdown rots into terminate.

---

## When the maintained harness cannot run here, mirror it with a disposable driver
Tags: debugging, verification, sandbox, offline
Applies-when: landing a fetched-harness test (Catch2 or similar) from an offline sandbox

Catch2/nlohmann/httplib were unfetchable with no network, so the committed suite could not execute locally. Mirrored its cases in a /tmp assert-driver, ran it green, and left the Catch2 suite for windows.yml CI. The mirror earned its keep immediately: it failed on a genuine artifact (reused temp dir plus append-mode log replay), fixed by isolating temp state per run -- which also proved the driver itself can fail.

**Fix:** never claim green on an unrunnable harness suite alone: executable mirror in /tmp (kept out of the repo), same cases, temp state isolated per run; the committed suite stays canonical and CI-gated.

---

## A successful TCP connect proves bind, not responsiveness -- scope probe claims to never-bound
Tags: debugging, verification, oracle, networking
Applies-when: probing whether another process is alive via its port

A connect to a listening socket completes in the kernel even if the process behind it is wedged (backlog accept), so a port probe distinguishes "never bound" (refused -- the Aurora-kwn wedge shape) from "bound", never "healthy" from "hung". The handoff message therefore claims "not responding at <url>", never "dead process".

**Fix:** isLoopbackPortResponsive() with a short bound, tested both directions (closed-port false and bound-port true -- a negative-only probe test cannot catch an always-false probe).

---

## A liveness probe must not take the locks whose starvation it should survive
Tags: debugging, verification, oracle, networking
Applies-when: adding a heartbeat/poll that declares the backend dead

The Dashboard heartbeat polls /api/capabilities precisely because that handler only reads the registry -- /api/monitors and /api/zones take the pipeline mutex, which tick starvation can hold for 8s+ (seen live in the NUX triage). A probe on a locking endpoint cannot distinguish "daemon dead" from "daemon wedged", which is the distinction it exists to draw.

**Fix:** probe the most static endpoint available (capabilities/config over monitors/zones/status), with the abort inside the cadence and a recursive setTimeout so a hung server cannot stack polls.

---

## A lossless-transport PASS says nothing about content -- empty frames round-trip perfectly
Tags: verification, oracles, streaming, validation
Applies-when: writing or reading an end-to-end "sent == received" check

`validate.py passthrough` compared tap-sent vs SSE-received byte for byte and passed -- while every frame was `{"zones":[]}` because the hue output had no zones (stale credentials, see output.md). The color check likewise returned PASS with an `--expect` and zero zones, and "gray" passed on pure black because only neutrality was asserted.

**Fix:** every validator asserts non-vacuous content too (non-empty zone list, midtone actually mid) and fails loudly otherwise. General principle: an equality oracle over a stream is satisfied by an empty stream; pair it with a content floor.

---

## Solid-color checks against a whole-screen zone: fit one mixing model across colors instead of per-color tolerance
Tags: verification, oracles, capture, zone-mapping
Applies-when: judging captured zone colors against an on-screen stimulus that doesn't fill the zone

A zone's color is a plain mean over its uvs, so a maximized page plus top bar/toolbar/dock read red as 0.945/0.106/0.106 and failed a strict ±0.08 check. Across red, green, blue and `#808080` every reading fit a single model -- ~16% of the frame averaging ~0.66, the rest the page -- which proves channel order and gamma correct more strongly than any single tolerance pass would.

**Fix:** either shrink the zone to a region the stimulus fully covers, or solve for the contamination fraction from one color and check the others against it. General principle: when a fixed, unknown offset contaminates every reading, test consistency across stimuli, not closeness per stimulus.

---

## A protocol's theoretical maximum isn't the OS's actual limit -- verify the real one live, especially when the failure path is discarded by design
Tags: debugging, verification, networking, silent-failure
Applies-when: sizing a payload/buffer against a protocol spec rather than the runtime environment

`DevFrameDump`'s size cap was set to 44000 bytes, reasoned from IPv4's theoretical 65507-byte UDP max with headroom for base64/JSON overhead. A 100x100 frame (40051-byte encoded payload, under that cap) silently never arrived. `send()`'s return value was discarded outright ("best-effort, never blocks, never throws"), so the failure produced no error anywhere -- not a crash, not a log line, just an absent datagram, indistinguishable from "nothing was published yet." `sysctl net.inet.udp.maxdgram` read 9216 on this machine: macOS's actual limit, unrelated to IPv4's spec ceiling and roughly 7x smaller than the value reasoned from it.

**Fix:** cap checked against the real encoded payload size (`payload.size()`), not an estimated raw-byte proxy, and lowered to 9000 -- confirmed by sending progressively larger frames against a real listener until the exact threshold behavior was observed, not by rereading the RFC. General principle: a bound reasoned from a protocol's own spec is a hypothesis about the spec, not about the OS enforcing it -- and a best-effort/discarded-return-value design (chosen so a slow dev tool can never block the code path it observes) means a wrong bound produces silence, not a stack trace, so it won't surface on its own. Send a real datagram at the real size and confirm a real listener sees it.
