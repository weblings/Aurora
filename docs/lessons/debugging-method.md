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

## "Did it actually stop, or does it just look that way?" — tap the live data stream with a timestamped log instead of trusting the visual impression
Tags: debugging, live-testing, timing, sse, macos
Applies-when: a user reports something looks frozen/paused in a live view and it's unclear whether that's real or a rendering artifact

Asked whether frames genuinely stopped reaching `light-viz-relay`'s SSE
viz while Aurora's tray menu was open, or whether it just looked that way
(browser tab losing focus, canvas not repainting, etc.) — plausible either
way without checking. Rather than reason about it, tapped the relay's own
`/events` SSE endpoint directly with `curl -N` piped through a loop that
appended one timestamp per received frame to a log file, running in the
background while the user reproduced the scenario live. `uniq -c` on the
per-second timestamps showed a clean, complete gap (zero frames for
several full seconds) lining up exactly with the window the menu was held
open, not a partial slowdown or a visual-only effect — real evidence, not
inference from watching a page.

**Fix:** when a live pipeline has an inspectable stream (SSE, a log file,
a socket, a UDP tap) and the question is "did the data really stop, or
does the UI just look stalled," tap the stream itself with a timestamped
log rather than debating what a screenshot or a description means. Cheap
to set up, and turns "probably" into a specific gap with exact start/end
times — which then doubles as the evidence for root-causing *why*, not
just confirming *that* it happened. Same principle as the entry above
(distrust indirect evidence, get a narrow independent probe), applied to
"is this real or a rendering thing" specifically.

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

Implementing `archive/WebUI_Design_2ndPass.md` step 3 hit the exact same
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
fix until the timestamps were compared. Aurora-67y's variant broke the
same chain invisibly: `c++ … 2>&1 | head && ./probe` executed the stale
probe binary after a failed compile, because `&&` saw `head`'s exit code
(0), not the compiler's.

**Fix:** process, not code -- before re-diagnosing a "fix didn't work,"
check the binary's build timestamp against the edit, make sure the old
daemon process is actually dead, and probe the API directly (`GET
/api/zones` in the failing mode) to separate backend staleness from UI
staleness. Build steps piped through `head`/`tail` need the same
suspicion -- capture to a file and tail that instead, so a red compile
can't silently promote a stale binary to "retested". General principle:
the edit → build → relaunch chain has three links, and a break in the
second two looks exactly like a bug in the first.

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
---

## Probe channel-to-slot mapping one channel at a time; a full-pattern snapshot can't distinguish a mapping error from report order
Tags: verification, zone-mapping, oracles
Applies-when: validating which input channel drives which output slot

A 4-zone split frame (R/G/B/W on ids 0-3) came back reported as "red, blue, green, white" and the id→slot map was nearly edited before the reporter clarified the list order wasn't positional -- no evidence of a swap existed at all. A simultaneous multi-channel stimulus entangles the mapping under test with the order someone happens to list what they see.

**Fix:** one channel hot, rest black (`zone_send.py only <id>`), and ask for the physical position of the lit lamp: id 2 alone lit the back-left couch lamp, confirming that slot instead of "correcting" it. General principle: when the observation channel (a human listing colors) has its own unknown ordering, single-variable probes are the only oracle that separates mapping from reporting.
---

## pkill -f matches the invoking shell's own command line -- kill by PID or not at all
Tags: debugging, processes, footgun
Applies-when: stopping processes whose command lines resemble the stop command itself

`pkill -f "build/linux-app/bin/Aurora"` matched the `bash -c` invocation running the pkill (its command line contains the pattern) and SIGTERMed the shell mid-command -- the tool call reported failure with empty output. The first pkill in the chain had already killed its target, so state was half-torn-down with no report of which half. Aurora-67y re-confirmed this with a worse shape: `pkill -f "[b]in/Aurora"` still killed its own shell, because the bracket trick only disguises the pattern text itself -- a later segment of the same one-liner held the literal `./build/bin/Aurora`, which matches. Bracket-tricks protect `ps | grep`, not a `pkill -f` compounded with a command naming its own target.

**Fix:** resolve PIDs first (`ps` with a bracket pattern like `[b]in/Aurora`, which can't match the grep itself), then `kill <pids>` and verify with `ss`/fresh `ps`. General principle: a pattern-kill aimed at a process family you belong to (shells running commands about those processes) must exclude the shooter.

---

## A macOS `.app` bundle launched via `open` doesn't inherit the invoking shell's environment, and `--fresh`-style flags can silently override a config-dir env var too
Tags: debugging, macos, bundle, environment, methodology
Applies-when: testing a macOS `.app` bundle's behavior under specific env vars/config

Testing `Aurora-8mk.5` end to end needed `AURORA_HUE_BRIDGE_ADDRESS`/`AURORA_DEV_LIGHT_TAP`/etc. reaching the real bundled binary -- `export`ing them in the shell before `open Aurora.app` does nothing, since `open` launches through LaunchServices, not as a child of the shell. `open --env KEY=VALUE` (repeatable) is what actually reaches the process; confirmed with `ps eww -p <pid>` after launch, not assumed. Separately, `app/mac`'s own `--fresh` flag (passed via `open ... --args --fresh`) redirects the config root to `$TMPDIR/aurora-fresh` unconditionally -- it ignores `AURORA_CONFIG_DIR` entirely, even though both looked like they should compose. Cost a wasted attempt placing a zone-map file at the env-var path while the running process was reading from the temp-dir path instead.

**Fix:** `open <bundle> --env KEY=VALUE --args <flags>` to pass both environment and CLI args through LaunchServices; verify what actually landed with `ps eww -p <pid> | tr ' ' '\n' | grep <VAR>` rather than trusting the launch command. When two config-source mechanisms exist (an env var override and a CLI flag), check the source for which one wins instead of assuming they compose -- read the resolution code (`isFreshRun`/`freshConfigRoot` vs. `resolveConfigRoot` in `app/mac/src/main.cpp`), don't guess from the flag names.
---

## DevLightTap confirmed real capture end to end on Mac; DevFrameDump's independent cross-check tool did not receive data, unresolved
Tags: debugging, mac, devtools, unresolved
Applies-when: validating a new Mac input backend and choosing between `AURORA_DEV_LIGHT_TAP` and `AURORA_DEV_FRAME_DUMP` for it

Validating `Aurora-8mk.5`'s real capture: `tools/light-viz-relay/validate.py frame` (cross-checks `DevFrameDump`'s raw-frame UDP dump against the tap's reported colors) reported "no frames received" every time, despite `DevFrameDump`'s wiring (`Orchestrator::update()` → `m_devFrameDump.publish(source)`) being identical, platform-agnostic code already exercised on Linux, and `ps eww` confirming `AURORA_DEV_FRAME_DUMP=1` reached the process. Root cause not found. `AURORA_DEV_LIGHT_TAP` (the other dev tap, feeding `tools/light-viz-relay`'s SSE/`viz.html` path) worked immediately on the same run and gave a fully convincing end-to-end confirmation (real per-zone colors, tracking a dragged colorful window live) -- used as the validation path instead of chasing the `DevFrameDump` gap further.

**Fix (until root-caused):** for Mac capture validation, prefer `AURORA_DEV_LIGHT_TAP` + `tools/light-viz-relay` (`relay.py`, `viz.html`, or `validate.py color`) over `validate.py frame`/`AURORA_DEV_FRAME_DUMP` -- the former is proven working on Mac, the latter isn't yet. Don't assume "identical shared code, confirmed env var present" guarantees the same runtime behavior across platforms without an actual positive observation on each one.
---

## A build-toggle acceptance test is vacuous unless the toggle actually flips the build -- verify at flags.make level
Tags: debugging, verification, cmake, negative-test
Applies-when: accepting a fix whose proof is "configures/builds with option X off"

`Aurora-y1q`'s acceptance (app/linux builds with its audio toggle OFF) passed on the unfixed code: via the superbuild the toggle never unset `AURORA_RUNTIME_AUDIO_AVAILABLE` (core was already configured by an earlier fetch -- see the FetchContent-ordering entry in build-toolchain.md), so the "OFF build" compiled the identical TU and the green build proved nothing.

**Fix:** before believing a toggle-flip build, confirm the flip landed (`flags.make`/`compile_commands.json` carries or lacks the define), then run a true negative test: compile the touched TU with the define forcibly undefined (`-U...` appended to the recorded compile command) and confirm the old code fails exactly where the fix guards. If the toggle itself is broken (filed here as `Aurora-b87`), the negative test is the real acceptance, not the toggle build.

---

## A test where the normal path would also succeed doesn't prove an override branch actually takes priority
Tags: debugging, verification, fixtures, resolver-logic
Applies-when: building resolution logic with an override/fallback branch (e.g. a supersede or redirect chain layered on top of direct lookup)

Building `check-links.sh`'s `[[id]]` resolver (`Aurora-lmn.2`), the first implementation checked "does this id resolve to a real file" before checking "does it have a `Superseded-by` chain" -- so a superseded id whose own file still physically existed (the realistic case: the old doc is marked retired but not yet deleted) resolved directly and silently skipped the chain-following/warning path entirely. Fixtures for the other new paths (missing id, bad anchor, duplicate id) all passed regardless, since none of them exercised a superseded-but-still-present file -- the override branch looked correct because nothing had tried to prove it was actually reachable.

**Fix:** wrote a fixture where the *normal* resolution path would also technically succeed (an id with both `Id:` and `Superseded-by:` on the same still-existing file), which caught the bug immediately; reordered the resolver to check `Superseded-by` first, unconditionally. General principle: for any override/fallback branch, "resolves correctly when nothing else could" is a weaker test than "resolves correctly when something else also could" -- test the case that would let the wrong branch win by accident.

---

## Match a crash report's timestamp and pid to the run before treating it as the cause
Tags: debugging, crash-reports, verification, macos
Applies-when: a test stalls or fails and DiagnosticReports (or a core dir) already holds reports for the same binary name

While a hardened-runtime test stalled with no frames, `~/Library/Logs/DiagnosticReports` held two fresh-looking `Aurora-*.ips` files with a dyld "Library not loaded" abort. Both were from earlier launches of *other copies* under deliberately broken signing; the stalled run had not crashed at all (its process was alive). Reading the `.ips` header timestamp and `pid` against the current run's pid and clock time separated them in one step.

**Fix:** before attributing a failure to a crash report, compare its timestamp, pid and `procPath` with the live process (`pgrep`, `date`). Same binary name, same day is not the same run, especially when you have just produced expected crashes yourself.


---

## Grep the code for its own recorded constraints before recommending a design; a bead's proposal and a fresh idea can both be wrong
Tags: debugging, design, verification, comments
Applies-when: comparing a filed proposal against an alternative in code you haven't read yet

Aurora-zlw proposed moving the Mac tick loop to a worker thread; I first recommended a common-modes run-loop timer from the bead text alone, and only after reading `main.cpp`/`TrayIcon.hpp` found a header comment forbidding common modes (tao#1324) and that `[NSApp run]` is never called. The recommendation flipped. The bead's other premise, "Win32 needs the main thread too", had already been disproved by the Windows fix. Both the ticket and the first alternative were wrong in ways the code's comments recorded.

**Fix:** before choosing between designs, read the affected files' header comments and grep for the constraint keywords of the alternative (here `CommonModes`, `run`, `pump`). Treat "I haven't read the code" as a reason to hedge in the recommendation, then check.

---

## A wrapper that sends a tool's stderr to /dev/null turns its one useful error into a silent failure
Tags: debugging, shell, codesign, error-handling
Applies-when: a script wraps codesign/install_name_tool/similar and only checks the exit code

`bundle-dylibs.sh` ran `codesign ... >/dev/null 2>&1` (it was noisy on success: "replacing existing signature"). With a nonexistent identity the build stopped with a bare "Error 1" and no reason; the real message, `<identity>: no identity found`, was thrown away (Aurora-qy5.5). Suppressing on success is right; suppressing on failure is not.

**Fix:** capture stderr to a temp file and print it only when the command fails (`sign() { codesign "$@" >/dev/null 2>"$WORK/err" || { cat "$WORK/err" >&2; exit 1; }; }`). Then test the negative path on purpose (a bogus identity) so the message is seen once before it's needed.

---

## Two online sources that say the same thing may be one claim; trace the wording before counting them as corroboration
Tags: research, verification, sources, debugging
Applies-when: a bead, lesson or plan says research "independently confirmed" something, especially a platform-API restriction cited from issue trackers or blog posts

The UserNotifications bead said independent research turned up "UNUserNotificationCenter will not register an app without a valid signature and stable bundle identity." The same sentence, nearly word for word, appeared in a GitHub issue proposing a fix it had not tried, and other write-ups said the opposite (ad-hoc bundles post fine, grant keyed on bundle ID). Eight probes on a real machine (Aurora-qps.5) showed the truth was narrower and different: signing alone did nothing; a notarized build in an ordinary apps folder got the permission request.

**Fix:** when a claim drives a plan, search a distinctive phrase from it and see whether the "sources" share an origin; prefer a source that reports what it tried over one that proposes what to try. When sources conflict, run the smallest real probe before building, and write the plan's premise as unverified until one has run.

---

## Piping a validator through `tail`/`head` hides its exit status, so a failing check can sit in front of a commit that proceeds anyway
Tags: process, verification, git, scripts
Applies-when: chaining a docs/lessons/test check before a commit or bead close, or trimming its output

`python3 docs/check-links.sh | tail -1; ... git commit` printed a dead-link line, but the pipeline's exit status is `tail`'s (0), and the `;`-joined commit ran regardless. The commit landed with a failing link check and needed a fix-up commit. Reading only the last line of output is the same trap one step removed: it showed "lessons OK" while the line above it was the failure.

**Fix:** let the validator's own status gate the next step (`python3 docs/check-links.sh && bash docs/check-lessons.sh && git commit ...`), print its full output when it fails rather than a trimmed tail, and if trimming is needed use `set -o pipefail`. Run the checks and the commit as separate steps so a red result is read before anything is staged.


---

## A UI that "doesn't update" after an action can be a slow server, and a new root cause can sit on a known mechanism -- time the endpoints, sample the process, then search beads by mechanism
Tags: debugging, webui, performance, locks, beads, process
Applies-when: a UI control looks stuck after an action whose backend effect did happen

Switching the Mac Dashboard to Video changed the lights, but the mode toggle stayed on Audio (Aurora-3qh). `GET /api/config` already said Video, so the state was right and the render was late: `_switchMode` re-renders only after `_loadAll`'s fetches, and timing each endpoint with `curl -w %{time_total}` showed `/api/monitors`/`/api/zones` at 2-30s while the rest were instant. `ps` showed ~105% CPU; `sample <pid> 3` put 2349/2360 tick-thread samples in `cv::resize` (full-Retina ScreenCaptureKit frames downscaled on the CPU every tick), so the tick overran and held the pipeline lock without sleeping. I filed that as one new bug -- but the starvation half was already `Aurora-cgr`, filed from 1000Hz testing; the new finding was only the *trigger* (60Hz is enough on Retina).

**Fix:** for a stale-looking control, compare the backend's state to the UI first, then time every request the re-render waits on, then `sample` the process before theorizing. Before filing, `bd search` the *mechanism* (starvation, lock, tick), not just the symptom, and scope the new bead to what's actually new, linked to the existing one.

---

## A findings write-up's "suggested fix" is a hypothesis -- re-check its premise against the code and library headers before implementing it
Tags: debugging, verification, upstream, review
Applies-when: implementing fixes from an existing analysis or findings doc (yours or anyone's), especially one written while porting other code

Turning [[upstream-findings]] into fix branches (`Aurora-h45`), three of the
first four findings carried a wrong premise even though each bug was real.
1's "every grabber tags BGR" was false: honoring the tag would have swapped
red/blue. 2's "COLOR_RGBA2RGB assumes RGBA" was false: it's an alias of
`COLOR_BGRA2BGR`. 5's "add `return;`" would have hung startup on an
unsettled promise. Each was caught only by reading the code the claim was
about: the tag producers, `imgproc.hpp`, and the future's waiter. The same
pattern as "Grep the code for its own recorded constraints before
recommending a design".

**Fix:** for each finding, before writing the fix, verify the "why it hasn't
fired" claim and the suggested fix's mechanism: grep every producer of a
value now being trusted, read library enum/header definitions behind a
named constant, and trace who waits on any state an early return skips.
Correct the write-up in the same pass.

---

## Build a realistic throwaway artifact before planning around an estimated size or format
Tags: planning, measurement, scratchpad, toolchain
Applies-when: a plan's risk depends on how big or what shape a generated artifact will be (bundle, header, binary)

Aurora-lzj's plan carried "React + xyflow minified is likely 200 KB+" and an unverified MSVC limit as its main risk. A 10-minute scratchpad scaffold (Vite 8 + React 19 + @xyflow/react, base `/graph-editor/`) replaced the guess with numbers and turned up four things no estimate would have: one 399 KB JS file; `??!` sequences in the minified output (a GCC trigraph warning); Vite 8's built-in `build.license`, so no extra plugin was needed; and Vite not emptying an `outDir` outside its project. Running the real encoder and a compiled round-trip over that output then showed GCC was fine and isolated MSVC as the only unknown.

**Fix:** when a plan's risk hinges on artifact size or format, make the smallest realistic one in the scratchpad and run it through the real downstream steps (encoder, compiler, server). Record the measured numbers in the bead, not the estimate.

---

## Add a control run (old vs old) and event-driven waits before calling a browser difference a regression
Tags: browser, playwright, flakiness, verification, baseline
Applies-when: comparing a flow before and after a change by driving a real browser against a live app

Aurora-4y9's browser walk first showed the new code "stalling" on a Continue press in 2 of 3 runs while the old code never did. Two things were wrong with the comparison. A fixed `sleep(1800)` after each click was shorter than a slow save, so the stall was my harness. And once waits followed the screen change (poll until the root element or text differs, up to 10s), one path still varied, but old-vs-old varied too: one old run jumped to the Dashboard, another stopped at Zone Mapping.

**Fix:** wait on a visible state change, never a fixed sleep. Run the old code against itself at least twice before reading any old/new difference; only outcomes that old never produces are evidence. Playwright is not installed here, but `createRequire('<RockyRoad>/v2/')` can load its `playwright` and the cached Chromium works headless.

---

## `pgrep -f` inside a wait loop matches the loop's own shell
Tags: shell, pgrep, background-tasks, hang
Applies-when: writing `until ! pgrep -f "<name>"; do sleep; done` in a command that also contains `<name>`

The agent's Bash wrapper runs the whole command string via `bash -c`, so its command line contains the pattern and `pgrep -f` always finds itself. The loop never exits, and a background job built on it looks "running" forever with no output; a `pkill -f` pattern aimed at it then kills the wrapper too (exit 144).

**Fix:** don't gate on `pgrep -f`; run the steps sequentially in one command, or wait on a pid (`kill -0 <pid>`) or an output file. If a pattern is needed, use the `[n]ode` trick so the pattern text doesn't match its own command line.

---

## Unsetting `DBUS_SESSION_BUS_ADDRESS` doesn't simulate "no session bus": GIO falls back to `$XDG_RUNTIME_DIR/bus`
Tags: linux, dbus, libsecret, testing, failure-injection
Applies-when: testing a D-Bus client's "no bus / no service" path (libsecret, portals, notifications)

For Aurora-2dz's "no Secret Service" case, `env -u DBUS_SESSION_BUS_ADDRESS` still reached gnome-keyring, and the `[real]` test passed instead of skipping. On systemd sessions GIO finds the user bus socket at `$XDG_RUNTIME_DIR/bus` without the variable. The failure injection silently didn't happen.

**Fix:** point it at a dead socket, `DBUS_SESSION_BUS_ADDRESS=unix:path=/nonexistent`. libsecret then fails with "Could not connect" (`G_IO_ERROR`, mapped to `Unavailable`). Check that the injected failure really occurred (status or skip message) before trusting a "passes" result.

---

## A Catch2 SIGSEGV with no debugger: install a vectored exception handler, link with `/MAP`, resolve the RVAs
Tags: windows, segfault, catch2, msvc, stack-trace, map-file, bisect
Applies-when: a test exe segfaults on Windows, `cdb`/WinDbg are not installed, and Catch2 only prints "Unknown expression after the reported line"

Catch2 reports the last assertion that started, not where the crash is, and its SIGSEGV handler prints no stack. What worked, in order: (1) `std::cerr << ... << std::endl` markers (flushes before the crash) narrowed it to the first `client.Get` and then proved the route handler never ran; (2) swapping the real route for a trivial lambda showed it wasn't our code; (3) a temporary `AddVectoredExceptionHandler` in the test calling `CaptureStackBackTrace` and printing each frame's module and offset gave the crashing thread's frames; (4) relinking with `/MAP /DEBUG` (`-DCMAKE_EXE_LINKER_FLAGS_RELEASE="/MAP /DEBUG"`) and a short script mapping `preferred load address + RVA` to the nearest map symbol named `httplib::Server::process_request` on a `ThreadPool::worker` thread. Both the heredoc and `sed` mangled `
` inside C string literals while patching, so use `std::endl`, or write patch scripts with the Write tool.

**Fix:** keep the VEH snippet and map resolver as the first move for any Windows crash that has no debugger; the symbol names alone usually point at the cause (here, httplib compiled twice). Revert the instrumentation and the linker-flag cache entry afterwards.

---

## A cross-binary test that renames the binary changes more than the variable under test: vary one property at a time before recording a bug
Tags: testing, experiment-design, false-positive, macos, keychain, binaries
Applies-when: simulating "a rebuilt or updated app" by copying binaries to new names or paths, or about to file a bug found by such a harness

Aurora-2dz copied one test binary to `A`, `B` and `C` to stand in for successive builds. Three things changed at once: the bytes, the file name and (for a while) the signature. Delete failed from `B`/`C` and I wrote it up as a Keychain bug in the bead, the planning doc and the log. Web research then pointed at the file name, and a rerun that changed only the directory (same name) and then only the bytes (new inode at the same path) both passed. The earlier ad-hoc rebuild runs, which kept the name, had already deleted fine; I hadn't compared them.

**Fix:** before recording a bug from a simulation, list everything the harness changes, then vary one at a time. Compare against any earlier passing run of the same step. Make the harness mimic the real change (rebuild in place: same name and path, new bytes; use `rm` then `cp` to get a new inode so a cached signature doesn't kill the process). Mark early notes "unconfirmed" until that's done.

---

## Test a window race by firing the competing write from a fake's hook, then mutation-check the lock
Tags: testing, concurrency, race, fakes, catch2
Applies-when: writing a regression test for a lost update, or for an ordering or serialization guarantee between threads or entry points

For the config race in Aurora-d6i7, threads and sleeps would have made a flaky test. Instead the fake output's `init()`, the slow step the real race hides in, calls a hook the test sets, and the hook does the competing write synchronously. The interleave is then exact on every run, and the test failed on the old code before the fix. For a serialization guarantee, run N clients against a deliberately slow callback that records the maximum number in flight. Then delete the lock and rerun: the test must fail (here 8 in flight, fields lost). A concurrency test that still passes without the lock proves nothing. Catch2 v3.6 (what core fetches) assertions are not thread-safe: worker threads count successes into atomics and the test thread asserts.

Two traps hit the Aurora-c0g version of this. A "did the lock stay free?" probe built on `std::async` deadlocks exactly when the bug is present: the future's destructor waits for the blocked task, while the code holding the lock waits for the hook. And an interrupted mutation run leaves the mutated source behind, because the restore step never executes.

Two more from Aurora-d3ec's host-status tests. A fake's hook fires once *per output* (the fake registry has two), so a hook that sets a `std::promise` or blocks must guard with a flag or the second call throws inside the build and fails the very operation under test. And when the test blocks another thread on purpose, release it *before* asserting: a `REQUIRE` that throws with the worker thread still joinable calls `std::terminate`, so a regression shows up as an abort with no failure message instead of a failed check (use a plain bool, release, join, then `CHECK`).

**Fix:** put the competing action in a hook inside the slow step, write the test against the unfixed code first, and mutation-check each lock by removing it before trusting the test. Run the probe on a plain `std::thread` and join it only after the code under test returns, so a held lock times the hook out and fails the test. Run mutation checks with a backup copy, a shell `trap` that restores on any exit, and `ctest --timeout`; after any interruption, grep for the mutation marker before assuming the tree is clean.

---

## A harness's default binary may not be the one you just built
Tags: debugging, devstack, verification, stale-binary
Applies-when: a live check against a dev harness behaves as if new code is missing

After adding `PUT /api/state`, `devstack.py up` answered 404 for it. The route was fine: the script's default app is `build/linux-app/bin/Aurora` (a preset build dir from Oct 1), while `cmake --build build` had produced `build/bin/Aurora`. A 404 on a route that unit tests pass reads like a wiring bug and invites a debugging detour.

**Fix:** pass `--app <fresh binary>` and, before reading anything into a failure, compare the binary's mtime or grep it for a string only the new code contains (`strings build/bin/Aurora | grep ...`). Prefer a harness default that follows the build you just ran, or an error when the default is older than the sources.

Recurred in reverse during Aurora-kea (2026-10-03): `cmake --build build/linux-app` was fresh and a hand-launched `./build/bin/Aurora` was the stale one, so the new `GET /api/state` answered 404. Two app binaries exist on this box; neither path is "the" build.

---

## A LeakSanitizer report whose only non-libc frame is a test line is that line's own allocation -- trace it before blaming the library
Tags: debugging, asan, leaksanitizer, verification, glib
Applies-when: a sanitizer run reports a small fixed-size leak with unsymbolized library frames and you are about to call it library-internal or a known false positive

A 21-byte `g_strdup` leak showed up on every portal test, with unsymbolized
`libglib` frames. It was first written off as a "GLib-internal
allocation from the fake's startup", and a README told people to disable leak
detection. Running with `ASAN_OPTIONS=fast_unwind_on_malloc=0` and reading the
test line it named found the cause in minutes: `g_find_program_in_path`
returns an allocated string (`/usr/bin/dbus-daemon`, 20 chars + NUL = 21 B)
and the skip check threw it away. The size was the clue.

**Fix:** match the byte count against strings the code handles before
attributing a leak to a library, and get the full stack (`fast_unwind_on_malloc=0`)
first. Never ship "disable leak detection" as guidance for a leak you have not
traced; a muted detector also hides real leaks (the fake's two ref-count
leaks surfaced only because it stayed on).


---

## Signalling a wrapper's pid tests the wrapper, not the app, and `kill -9` of it leaks the child
Tags: debugging, signals, shell, verification
Applies-when: checking clean shutdown of an app started through `dbus-run-session`, `env`, `timeout` or a subshell

The no-watcher tray check (Aurora-lx4.2) launched `dbus-run-session -- Aurora` and sent `SIGINT` to `$!`, which is the wrapper. Aurora never saw it, the check reported a hang, and the follow-up `kill -9` of the wrapper left Aurora running as an orphan. The "bug" was the harness; Aurora exited cleanly once signalled directly.

**Fix:** find the real pid (`pgrep -f` on the binary) before signalling, or use `exec` so the app replaces the wrapper. After any forced kill, `pgrep -af <binary>` for strays before the next run.


---

## A control phase only counts if it was observed in the control state
Tags: debugging, verification, control, repro, input
Applies-when: an A/B repro has a "normal" phase meant to pass, especially one driven by a script you can't watch

The first `fullscreen_repro.py` run (Aurora-1t1, 2026-10-04) had a `window` control and a `kiosk` phase. Both stalled for 30s, which read as "capture freezes even windowed". The owner, watching the screen, saw Firefox fullscreen in every phase, so the control never ran. Why it opened fullscreen is unknown: the first guess (a profile reused from the kiosk phase) was contradicted, since that run's windowed phase came first and a later kiosk-then-window run had a genuinely windowed control.

**Fix:** before reading an A/B result, check each phase was in its intended state (eyes on screen, or a probe the script asserts). Treat "the control failed too" as a reason to check the control first, not as a finding.

---

## `pkill -f <pattern>` also matches the shell running it
Tags: debugging, shell, signals, processes
Applies-when: killing processes by command-line pattern from a scripted or agent-run shell command

`pkill -f "aurora-fullscreen-repro-profile"` ran inside a `bash -c` whose own command line contained that string. It killed its own shell (exit 144) along with Firefox, so the commands after it in the same invocation never ran.

**Fix:** run `pkill -f` as its own command, or use a pattern the shell's command line can't match (`pkill -f "[a]urora-fullscreen..."`). Check `pgrep -af` afterwards.


---

## A change to the pipeline under test can fail the harness before the test runs
Tags: debugging, harness, devstack, verification
Applies-when: an experiment changes what the app produces (frames, buffers) and the repro script waits for that output before starting its test

The first DMA-BUF run (Aurora-1t1) ended in `devstack up` timing out on "a frame on the relay SSE", before Firefox or the kiosk phase ever started. The grabber now received DMA-BUFs it did not know how to read, skipped every callback, and so produced no frame for the readiness check. The `[pw-trace]` log showed this in seconds; the run itself said only "devstack up failed".

**Fix:** when an experiment changes the output path, read the app log before trusting a harness failure, and make the experiment produce pixels (here: map and sync the dmabuf) before judging it with the harness.


---

## A test binary run directly is not the same run as ctest when cases need one process each
Tags: debugging, testing, catch2, ctest, verification
Applies-when: a test fails when you run the Catch2/gtest binary directly but you haven't tried it through ctest or alone

Running `AuroraInputLinuxTests` directly reported 2 failing `PortalTokenTests` cases, and the Aurora-1t1 notes recorded them as "pre-existing failures on the baseline, unrelated" for a day. Both are tagged `[isolated]`, and a comment above them says why: `XdgDesktopPortal` caches the D-Bus connection in statics, so each case needs a fresh process, which `catch_discover_tests` gives (one ctest entry per case). Run alone or via `ctest -R`, both pass.

**Fix:** before calling a test failure "pre-existing", rerun it the way CI does (`ctest --test-dir build -R <name>`) and alone (`<binary> "<case name>"`), and read the comment above the case. A failure that only appears when the whole binary runs in one process is test-isolation state, not a product bug.

---

## A PowerShell prompt that doesn't start a new line after a console app's last output looks like a hang
Tags: debugging, verification, powershell, windows, shutdown, rendering
Applies-when: a console app prints its last line ("Stopping...") and the terminal shows no prompt, so it looks like the process did not exit

The owner saw `Stopping...` and no returned prompt and suspected a shutdown hang, then force-quit with Ctrl+C. The process had exited: the API quit path exited in about 1s while running, paused, and during an in-flight resume, and the app's last line has no trailing newline, so PowerShell did not redraw the prompt below it. A hang bead would have been filed for a rendering quirk.

**Fix:** before calling a stop a hang, ask the system, not the terminal: `tasklist /FI "IMAGENAME eq <exe>"` or `Get-Process`. Press Enter to redraw the prompt. A force quit you cannot distinguish from a clean quit is no evidence either way, so reproduce through a path that reports its own exit (API stop, then poll for the process).

---

## A dev-tool client timeout must cover the slowest synchronous server work, not the typical case
Tags: debugging, devstack, timeouts, flaky, reload, slow-machine
Applies-when: a script or dev tool fails intermittently with `TimeoutError`/read timeout against the app's own API, mostly on slower machines

`devstack.py up` failed about one run in three on a slow Windows box with `TimeoutError` from a read, not a refused connection. `POST /api/hue/connection` saves credentials and then runs the pipeline reload before it responds, and the script's `http()` helper defaulted to 3s. The reload measured median 0.4-0.7s but p90 1.8-3.2s and max 10.5s, so a 3s budget lost the coin flip on every fifth to third run. It never showed on faster machines, where the reload stayed under the limit.

**Fix:** find which route does synchronous work (here, anything that reloads: connection POST, config PUT) and give those calls a timeout well above the measured max (30s); keep short timeouts on cheap probes. Confirm with a run of 10 consecutive successes, not one. A traceback ending in `recv_into ... timed out` means the server was slow, not down.

---

## Phase timers that do not sum to the total hide the real cost: compute total minus the sum
Tags: debugging, timing, instrumentation, latency, reload, measurement
Applies-when: per-phase timing lines exist for an operation and you are about to tune the phase that looks slowest

Aurora's reload logs `capture+orchestrator init`, `outputs init` and `reload total`. One batch of 25 reloads suggested `outputs init` was the problem (median 152ms, max 3.3s, slow runs clustered). A second batch of 40 had `outputs init` max 406ms and capture init under 10ms, yet `reload total` still reached 10.5s. Subtracting the phases from the total showed the unexplained gap (median ~270ms, p90 ~1.3s, max ~10.4s) was bigger than any timed phase: it is the lock wait and old-pipeline shutdown, which are inside the total but have no timer. Tuning `outputs init` would have fixed the wrong thing, and a single batch would have named the wrong culprit.

**Fix:** with phase timers, always report total minus the sum of phases; if the residual is large, instrument it before tuning anything. Repeat the batch at least twice (slow runs can be bursty), and report min/median/p90/max, not a mean.

---

## A leak regression test needs no sanitizer: count live operator-new blocks, and check a binary with `leaks`
Tags: leak, operator-new, test, leaks, lsan, apple-silicon, regression
Applies-when: writing a test that fails while objects allocated with `new` leak, on a machine where LeakSanitizer is unavailable (Apple Silicon) or the repo has no sanitizer preset

Aurora-2pe5's test (`output/hue/tests/DtlsClientLeakTests.cpp`) replaces global `operator new`/`delete` in the test executable with versions that malloc/free and bump an `atomic<long>` live-block counter. It runs the operation once to warm up (locale, iostream and library statics), reads the counter, repeats the failing `DtlsClient::init()` 20 times, and checks the counter is unchanged. Before the fix it failed with a delta of exactly 120 (20 x 6 `new`s per init); after, it passes. It runs under plain ctest on every platform, so it guards the leak without anyone remembering to run ASan. Only `operator new` blocks are counted: a C library's own `malloc`/`calloc` allocations are not, so it tests the C++ side of the ownership, which is what a deleter bug is.

For an end-to-end look with no app launch, `MallocStackLogging=1 leaks --atExit -- ./TestBinary "[tag]"` runs just the filtered case and prints root leaks with their allocators (`MbedTlsImpl::_initRNG` here). Check the check: run it once against the unfixed source and see it report leaks, or "0 leaks" proves nothing.

**Fix:** pick a failure that throws after the allocations but before any network wait (an odd-length hex key throws inside `_initSSL`, no handshake timeout), keep the replacement operators in the one test file (they are executable-wide), and keep the loop single-threaded so other threads' allocations do not move the counter.

---

## A fail-soft port bind turns "something else owns the port" into a harness timeout about frames
Tags: devstack, port, bind, fail-soft, harness, mac
Applies-when: `devstack.py up` times out waiting for a frame although the fake bridge and relay started fine

On 2026-10-05 `devstack.py up` printed `timed out waiting for a frame on the relay SSE` and tore everything down. The cause was in `app.log`, not the SSE: `Could not bind WebUI to 0.0.0.0:8215 -- continuing without it`. A hand-launched `Aurora.app` (PID found with `lsof -nP -iTCP:8215 -sTCP:LISTEN`, started without `--fresh`, so not the stack's) already held 8215. The app deliberately keeps running without its WebUI, so `devstack` had no REST endpoint to configure and never reached "output active", and the failure surfaced two steps later as missing frames. The same stray instance explains a viz stuck on "connected - waiting for frames": relay and viz were up with nothing feeding the fake bridge.

**Fix:** on a frame timeout read `app.log` first for the bind line, and check the owner of 8215+ with `lsof` before touching the pipeline. Only quit a process you started; check its command line (`--fresh`, `--fake-hue`) to see whether it belongs to the stack.

---

## `value != "expected"` is `True` when `value` is `None` -- a dead oracle can pass a check it never actually ran
Tags: debugging, verification, oracle, python
Applies-when: writing a negative-outcome predicate (`!= "x"`, `is not "x"`) against a value that can legitimately be missing/`None`

A pause/resume check (Aurora-jwcd) polled a real Hue bridge and asserted
`status != "active"` to confirm a pause took effect. Every bridge call was
actually failing (403, wrong application key -- see `output.md`'s pairing
entry), so `status` was `None` on every poll, and `None != "active"`
evaluates `True` in Python. The pause side of the check reported a clean
pass for five straight cycles while never once getting a real answer from
the bridge; only the resume side's *positive* predicate (`== "active"`)
exposed the problem, because `None == "active"` is `False`.

**Fix:** a negative predicate over an optional value needs its own explicit
"got a real response at all" check (`value is not None and value != "x"`),
not just the inequality -- otherwise a completely dead channel satisfies it
by accident. More generally: distrust a "confirmed negative" from a check
whose positive form has never also been seen to actually fire; a predicate
that can be satisfied by *either* the real signal or total silence proves
nothing on its own, same root shape as this file's "checker that passes
vacuously" and "shares its subject's bug" entries, just a one-line operator
instead of a shared assumption.

---

## Proxy env vars hijack localhost HTTP — bypass the proxy in local test scripts
Tags: testing, proxy, localhost, urllib, harness
Applies-when: writing or running a script that drives the local app over HTTP and requests hang or return proxy errors

Sandbox and corporate environments set `http_proxy`/`https_proxy`, and Python's urllib honors them even for 127.0.0.1 unless `no_proxy` covers it. Symptom here: a stub-server self-test hung on plain GETs (proxy unreachable for the port) and error branches received empty proxy pages instead of app JSON. Raw sockets worked, which is the tell — TCP is fine, HTTP is being rerouted.

**Fix:** build scripts' HTTP layer on an opener with an empty proxy map (`urllib.request.build_opener(urllib.request.ProxyHandler({}))`) and use it for every call, so local traffic can never be rerouted regardless of the machine's env. Verify the bypass in the script's own self-test by running it with the proxy vars set.

---

## A mocked OS signal in a node test encodes your assumption about it -- read the real signal live before building on it
Tags: testing, mocks, macos, verification
Applies-when: writing a handler that branches on an OS/native answer (permission state, device presence) and testing it with a stubbed fetch

Aurora-cj11's retry-on-refocus handler passed all its new node tests with a stubbed `/api/mac/screen-permission` returning `granted: true`, yet in the real app the route never flipped after a grant, so the handler could never fire. The stub had silently assumed the OS signal is live.

**Fix:** before building logic on a native signal, call the real thing once across the transition it must detect (here: denied -> grant -> read again, without relaunch) and record the readings. Only then stub it.

## A "denied" flag inferred from silence cannot be tested without a signal -- a silent baseline proves nothing
Tags: testing, verification, macos, heuristics, audio
Applies-when: live-testing a permission or health flag the backend infers from absence of data (silent buffers, no frames), before and after a fix or grant

Aurora-tjoq: `permissionLikelyDenied` clears only on a non-zero sample, so with nothing playing it stayed `true` for 25s after the grant and the check was inconclusive; the "denied" baseline was equally what a granted-but-silent tap reads. Only with audio playing did the flag flip.

**Fix:** supply the signal (play audio) for the baseline and the after-reading, and run the denied-with-signal control so the baseline is real denial. If the first poll after supplying the signal already shows the final value, say the flip was not observed.
