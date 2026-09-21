# Architecture process

Module splits, duplication, reload lifecycles, presence signals, docs hygiene. See [README.md](README.md) for filing rules.

---

## An interface method's return value silently reused to build a persisted file path is part of that method's contract, case included
Tags: ioutput, zonemap, naming, contracts
Applies-when: adding or renaming an interface value used to build file paths or keys

`IOutput::name()` reads like a display/logging string. `Runtime::Orchestrator`
actually uses it as data: `ZoneMapStore::load(output->name())` builds
`profiles/<name>.json` directly from it. `HueOutput::name()` returned
`"Hue"` (capitalized); the registry key registering it (`"hue"`) and the
repo's own README (`profiles/hue.json`) both used lowercase. On a
case-sensitive filesystem this didn't error anywhere — it silently created
and reconciled a *second*, always-empty `Hue.json` every run, and
`reconcileZoneMap`'s "new IDs default inactive" rule then made every real
zone inactive in that file, so streamed frames carried zero zone data. The
one file a human had hand-edited (`hue.json`) sat there completely
untouched, looking exactly like proof of nothing being wrong.

**Fix:** renamed the returned string to lowercase `"hue"`, matching the
registry key and README. General principle: when a method's contract isn't
fully described by its own docstring, check every call site for what it's
*actually* used to construct (a file path, a network key, a lookup) — those
uses impose real constraints (exact casing, allowed characters) that a purely
display-string reading of the method would miss entirely.

---

---

## Same capability with environment-selected variants is one plugin with backends, not several plugins
Tags: architecture, plugins, input
Applies-when: splitting a capability with auto-selected variants into repos

Nearly modeled X11 and Wayland/Pipewire capture as two separate plugin repos,
following the same reasoning that justified splitting Input from Output
(independent dependencies). The difference: a user doesn't *choose* between
X11 and Wayland the way they choose between a Linux input and a Hue output —
`SessionDispatch` already picks the right one automatically from facts about
the machine. Splitting them would force every consumer to fetch and wire
together two repos to get one coherent capability ("capture the Linux
screen, whatever session type") working at all.

**Fix:** the repo boundary tracks *independent, user-facing choices*
(Input vs. Output, one bulb brand vs. another) — not *implementation variants
of one capability that get selected automatically* (X11 vs. Wayland, and
likely later: which GPU API a renderer uses, which discovery protocol finds
a device). Those stay one repo with optional per-variant CMake components
(`AURORA_INPUT_LINUX_ENABLE_X11`/`_PIPEWIRE`), so their dependencies are still
independently skippable without fragmenting the capability itself.

---

---

## Not porting `Core::Logger` early is now costing real diagnostics, twice
Tags: logging, planning, tech-debt
Applies-when: deferring cross-cutting infrastructure past I/O-heavy ports

Every ported I/O-heavy module so far (`X11Grabber`, now
`PipewireGrabber`/`XdgDesktopPortal`) has hit the same call: drop the
original's `Core::Logger::warn`/`error` calls since Aurora core has no
logger yet. Tolerable for X11's handful of call sites; `XdgDesktopPortal`
alone has a dozen, each marking a distinct D-Bus/portal failure mode that a
real user debugging a black-screen Wayland session will need. Silently
dropping all of them isn't free — it's deferred debuggability debt that
compounds with every I/O module ported before a logger exists.

**Fix:** not retroactively fixed here (still dropped, for consistency with
the modules already ported this way) — but this is now a second independent
occurrence, so treat "Aurora core needs a minimal logging interface" as
higher priority than its absence from the original 5-phase plan suggests,
worth doing before porting the next I/O-heavy module (Hue's `Streamer`/DTLS
layer) rather than after.

---

---

## When splitting legacy state into "generic" vs. "plugin-specific," classify each field by where it's authored, not where its formula is applied
Tags: architecture, zonemap, gamma, contracts
Applies-when: splitting state between Runtime and an output plugin

`Hue::Api::Channel` was correctly split into generic (`Runtime::ZoneMap`:
`uvs`/`active`) and Hue-specific (`Channel`: `gammaFactor`, `devices`)
pieces during the Runtime analysis pass. Gamma landed on the Hue-specific
side because its *consumption* is Hue-specific — the `2^(-gamma·2))`
formula, applied to an XYB brightness channel, is real Hue colorimetry.
But its *authorship* is identical to `uvs`/`active`: a value the user sets
once per zone, needing the exact same persist-and-reconcile lifecycle. The
analysis pass never checked that; it only surfaced while actually writing
`HueOutput::send()` and finding nowhere for the value to live, one port
later.

**Fix:** when sorting a field into "generic" vs. "specific to this plugin,"
ask where it's *set and persisted*, not just where its formula or
interpretation lives. A field can have fully generic authorship and
lifecycle while still being interpreted differently by every consumer
(exactly what happened once fixed — gamma's *value* moved to
`Contracts::Zone`, its *formula* stayed in `Aurora-Output-Hue`) — that's not
a contradiction, it's the correct split. Also worth noting: the module
dependency direction (`Runtime` → `Output`, one way only) is what forced
the fix through the passing contract (`Contracts::Frame`) rather than a
back-channel read from `IOutput` into `Runtime::ZoneMap` — that direction
would have been circular and simply wouldn't build.

---

---

## Before copy-pasting a "had to duplicate this per-app" pattern onto the next similar route, re-check whether the constraint that forced it still applies
Tags: architecture, code-reuse, app-shell
Applies-when: duplicating per-app route logic by precedent

Step 11's `/api/monitors`/`/api/reload` routes had to live directly in each
app's own `main.cpp`, duplicated near-verbatim, because they capture
`PipelineHost`/`Registry` by reference -- both app-layer types core has no
dependency on. Building `/api/zones` next, the default move would have been
to duplicate its JSON-marshalling logic into both `main.cpp` files the same
way, following the established precedent. Checking first instead of
assuming: `ZoneMap`/`ZoneConfig`/`Contracts::UVs` are already core types
with zero dependency on `Registry`/`Pipeline` -- the actual constraint that
forced step 11's duplication (needing an app-layer type) simply doesn't
apply here. The route's JSON logic could be written once in
`core/Runtime/ZoneRoutes.cpp`, reached from either app through the same
generic-callback bridging `SettingsRoutes`' `onConfigChanged` already
established, with each app supplying only a couple of thin one-line
lambdas.

**Fix:** wrote it once in core instead of duplicating. General principle:
an established "we had to duplicate X because of constraint Y" pattern is a
fact about the *previous* case, not a rule to reapply automatically to the
next similar-looking one -- re-derive whether constraint Y genuinely holds
for the new code before reaching for the same workaround, since the
constraint (not the pattern) is the actual thing worth checking for reuse.

---

---

## Before routing a new mutation through the same reload machinery everything else uses, check whether the data it touches is already live in memory outside that machinery
Tags: architecture, reload, zonemap
Applies-when: adding a live-write mutation to the pipeline

Every settings write built in steps 11-13 (`Config`-backed) has to go
through a full `PipelineHost::reload()` -- confirmed there's no
settings-only update path, `Pipeline::build()` always runs fresh, tearing
down and reconstructing capture/output. Building zone edits next, the
default assumption would have been that this is simply how any live write
works here. It isn't, for this specific data: `ZoneMap` was never part of
`Config` -- `Orchestrator` already holds it as a live, mutable
`std::unordered_map` that `update()` reads directly every tick, entirely
outside the reload path. That made a direct in-place mutation (guarded by
the same `PipelineHost` mutex `tick()` already takes, no rebuild at all) not
just possible but clearly the right choice once checked: the Zone Mapping
screen's whole job is dragging a rect live while watching real lights react,
and a full pipeline rebuild per drag-frame (the only path a `Config` change
has) would make that interaction unusable.

**Fix:** gave zone edits their own direct-mutation path
(`Orchestrator::updateZone`) instead of funneling them through `Config`+
reload. General principle: "every other write here goes through reload" is
a fact about `Config`-backed data specifically, not a property of the whole
system -- before extending that path to a new kind of mutation, check
whether the data being changed is actually reachable some other way
already (already-live, already-mutable, already read directly by the code
that needs the new value) before assuming the established heavyweight path
is the only option.

---

---

## A per-step build-log entry optimized for individual completeness can make the whole document unreadable, without any single edit being wrong
Tags: docs, planning, readability
Applies-when: writing build-order or plan docs with verification detail

Writing `WebUI/WebUI_Design_1stPass.md`'s 19-step build order, each step's writeup was
judged against "is every claim in this entry accurate and well-supported"
-- real bugs found, every jsdom/live verification performed, every
doc-internal inconsistency resolved, all recorded in full. That's a
reasonable bar per entry, and each one really did hold up under it. But
starting around step 10, the doc's actual job had quietly shifted from
*planning prose* (bounded -- there's only so much to decide) to *build log
plus verification record* (unbounded -- no limit on how much verification
or how many findings a step can generate), and the same "record it
completely" instinct kept being applied to the new, much higher-volume
kind of entry. The document stopped being skimmable for the person
actually using it to track 19 steps of progress, and by the time a
cleanup was attempted, the doc had grown past the point where restructuring
it could be done safely and quickly in one pass -- it needed a slow,
careful manual pass instead.

**Fix:** a build-log-style doc needs a second, independent check beyond
"is this entry accurate" -- "does the document as a whole still let its
actual reader stay oriented." Keep each entry to what-was-built plus one
line of real findings and one line of verification; push exhaustive
verification detail (every test case, every resolved inconsistency,
explained in full) to an append-only log or changelog separate from the
doc someone is actually navigating by, not inline in the steering
document. Re-derive this per document rather than assuming individual
accuracy adds up to collective readability -- it doesn't, and the failure
is invisible from inside any single edit.

---

---

## A fully ported, fully unit-tested function can still be dead code if nothing in the production call path actually calls it
Tags: testing, dead-code, porting
Applies-when: auditing whether a ported feature is actually reachable

`Aurora-Output-Hue`'s `ApiTools::matchDevices`, `parseEntertainmentConfigurationsChannels`,
and `loadDevices` were faithfully ported from huenicorn and covered by real
passing assertions in `ApiToolsTests.cpp` -- and never once called from
`loadEntertainmentConfigurations()`, the one function that actually reaches
the WebUI. `parseEntertainmentConfigurationShell` hardcoded every channel's
`devices` to `{}` at construction, so the real per-channel light-membership
data those three functions exist to compute was silently unreachable in the
live app the whole time, despite a green test suite implying the feature
existed and worked. Found only while investigating an unrelated request
(surfacing real light names in a new zone picker), not by anything in the
test suite itself -- nothing about a passing `ApiToolsTests.cpp` run could
have revealed that its subject was never invoked outside its own tests.

**Fix:** wired all three into `loadEntertainmentConfigurations()`, reusing
them rather than writing new parsing code from scratch. General principle:
a green test suite proves a function computes the right output for its own
given inputs, not that the function is reachable from anywhere real --
when auditing whether a ported feature is actually complete, grep for the
function's callers in production code, not just check that its own test
file passes.

---

---

## A reload that keeps the old instance alive until the new one is confirmed working can let the old instance's teardown undo the new instance's already-established state
Tags: reload, ioutput, lifecycle, hue
Applies-when: changing reload or teardown ordering around shared state

`PipelineHost::reload()` builds an entirely new `Pipeline` -- including
calling every new output's `init()`, which for Hue means starting a real
bridge stream -- before ever tearing down the old one. That ordering is
deliberate and correct: a reload that fails to build shouldn't take down an
already-working pipeline. But nothing about it accounted for the old and
new pipelines' outputs potentially targeting the *same* external resource.
The old output's `shutdown()`, running only after the new one was already
live, unconditionally sent an authoritative "stop" for whatever bridge
entertainment configuration it used -- usually the exact same one the new
output had just started streaming to. `IOutput::shutdown()` gave the
outgoing instance no way to know a newer one had already superseded it for
that same resource.

**Fix:** extended `IOutput::shutdown()` to take an `isReplacement` flag --
`true` when a reload is tearing this instance down because a newer one
already exists, `false` on a real app exit -- so only the latter tells Hue
to actually stop the bridge-side stream. Deliberately fixed at the
interface, not inside Hue: the mechanism (two overlapping instance
lifetimes racing on one external resource) isn't Hue-specific, any output
plugin with its own session/connection concept could hit the identical
shape of bug. General principle: when a lifecycle pattern deliberately
overlaps two instances for safety (build-then-swap, not swap-then-build),
any teardown method on the outgoing instance needs a way to know it might
no longer be the authoritative owner of whatever external state it
manages -- an interface that can't express "you were replaced" invites
exactly this kind of stale-teardown race, and it only bites resources with
external, sticky state (a device session, a lock, a subscription), never
ones that are purely local memory.

---

---

## A domain field's default doubling as an implicit "never configured" signal is fragile, and a same-shape replacement can carry the identical flaw
Tags: config, presence, zonereconciler
Applies-when: using a domain default as a never-configured signal

`ZoneReconciler`'s `active{false}` default was quietly relied on elsewhere
(`app.js`'s `needsZoneMapping` check, see `navigation-flow.md`'s matching entry) as a
"this zone has never been touched" signal -- fragile the moment `active`'s
own default needed to change for an unrelated UX reason, which it did.
Fixing that, the first fix proposed here wasn't a structural correction --
it was swapping the same reliance from `active` onto `uvs` (checking
whether a zone's rect still equals its full-canvas default instead), a
same-shape replacement, not a fix: it breaks identically the moment `uvs`'s
own default ever needs to change for an unrelated reason, or the moment a
real, deliberate configuration legitimately matches that default (a
genuinely intended whole-screen zone, for instance). Caught only because
the user asked directly whether the same situation could recur.

**Fix:** added a dedicated presence field (`everConfigured`), decoupled
from any domain field's own value, matching the fix protobuf3 needed for
the identical problem with scalar fields -- a zero-value default can never
be distinguished from "never set" without a separate marker (which is why
wrapper types / explicit `optional` exist there). General principle: when a
bug is caused by overloading a meaningful field's default as a
presence/emptiness signal, don't just move that same overloading onto a
different field -- add a field whose only job is answering that question,
so no future change to any domain field's own default can ever break
presence detection again. When proposing a fix for this class of bug,
explicitly check whether the fix itself still overloads *some* field's
default as the signal, rather than assuming a different field is
automatically safer just for being different.

---

---

## Beads' auto-export is debounced, so the committed JSONL can lag the live DB -- force an export before committing task state
Tags: beads, git, tasks, export
Applies-when: committing .beads/issues.jsonl after batched bd writes

Migrating a doc's milestones into beads, several `bd create`/`bd close`
calls ran back to back followed immediately by `git add .beads/issues.jsonl`
-- the commit looked complete (small diff, clean tree) but was actually
missing most of the new beads. `export.auto` refreshes the JSONL on a
debounce (tens of seconds), not synchronously after each write, so a fast
create-then-commit sequence snapshots a stale file. Caught only by
comparing the DB count (`bd list --status all`) against the committed
file and forcing `bd export -o .beads/issues.jsonl` before recommitting.

**Fix:** treat `bd export -o .beads/issues.jsonl` as part of the commit
sequence itself -- run it immediately before `git add`, then confirm the
diff actually contains the beads just created or closed. General
principle: an auto-sync with a debounce is eventually consistent, not
immediately consistent -- any commit cut in the gap between a write and
its sync bakes the lag into history.

---

## One rule stated twice is zero rules — give each procedure exactly one wording
Tags: docs, process, procedures
Applies-when: writing or editing agent-facing procedure docs

AGENTS.md carried its task/lesson/close-out rules twice — intro bullets plus
a "Where things go" section saying the same things differently. Two wordings
of one rule invite following the looser one, which for honor-system docs is
the failure mode, not clutter. Merged to single-source (47 to 36 lines) with
no meaning lost.

**Fix:** each procedure stated once, in exactly one place; cross-reference,
never restate. When a second mention creeps in, merge — don't clarify.


---

---

## A fresh machine adopts beads history with bd bootstrap, not bd init
Tags: beads, onboarding, dolt, sync
Applies-when: making the bd CLI work on a machine that only has the git checkout

bd init (even --from-jsonl) refuses when the configured sync.remote holds Dolt history -- exit 10, adopt the remote -- because init mints identity and an import would silently fork history. bd bootstrap is the command that adopts the remote history, and when the remote is unreachable it falls back to importing the git-tracked issues.jsonl (which export.auto keeps fresh). The live DB (embeddeddolt/) is git-ignored by design, so this step is required on every new machine; no task state carries over without it.

**Fix:** new-machine order is bd bootstrap, then bd import to upsert any JSONL-only lines written while the DB was down, then bd export to re-sync the carrier file. Do not reach for --discard-remote unless replacing the remote history is the intent.


---

---

## When a merge brings two similar trees together, diff before deciding copy-vs-fork
Tags: monorepo, duplication, vendor, verification
Applies-when: finding a lookalike directory (vendor snapshot, mirror, fork) inside merged content

The merge surfaced web/demo/vendor/webui sitting next to web/ui. Assumption said stale copy; diff -rq said diverged subset with vendor-only tooling (MANIFEST.json, generator) and ui-only app shell -- a deliberate GitHub-Pages-targeted fork, confirmed by the owner. A sync would have destroyed it.

**Fix:** never classify duplication by directory name or memory; run the diff first, read the file lists on both sides, and only then choose mirror-rule, migration, or intentional-divergence (recorded where agents will trip over it: AGENTS.md plus the closed task).
---

## Vendored files take fork-local asset paths -- the src lives with the caller
Tags: vendor, duplication, assets
Applies-when: porting an asset-referencing feature into the demo fork

The brand-mark port copied topBar.js verbatim, but the logo src comes from the DashboardScreen call site, not topBar -- so the fork-local path (vendor/webui/icons/aurora-logo.png) had to be wired at both call sites, and seams.test.mjs now forbids page-relative icons/ there the way it already did for Dropdown/NavFooter. A verbatim file copy alone would have shipped a broken image under Pages.

**Fix:** when porting into the fork, grep the ported code for path-like inputs (src, href, icon) and re-anchor each at the call site; extend the seam tripwire to cover the new path the same turn.
