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

Implementing `WebUI_Design_2ndPass.md` step 3 hit the exact same
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
JTBD pass would (see `web-ui.md`'s zone-mapping entry) -- a fix that only
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
