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

Update (Aurora-9ig): the constraint itself was removable. `Registry` was
byte-identical across apps and depended only on core interfaces, so it and
`Pipeline`/`PipelineHost` moved into `core/Runtime`, and the monitors/reload
routes moved with them (`PipelineRoutes`).

---

---

## Before routing a new mutation through the same reload machinery everything else uses, check whether the data it touches is already live in memory outside that machinery
Tags: architecture, reload, zonemap
Applies-when: adding a live-write mutation to the pipeline

Every settings write built in steps 11-13 (`Config`-backed) has to go
through a full `PipelineHost::reload()` -- confirmed there's no
settings-only update path (historical: since Aurora-c0g, tuning-only
edits apply live and only structural ones reload), `Pipeline::build()` then
ran fresh, tearing down and reconstructing capture/output. Building zone edits next, the
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

Writing `archive/WebUI_Design_1stPass.md`'s 19-step build order, each step's writeup was
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

The fork's own tooling still reads as a re-vendor workflow (MANIFEST.json "verbatim copy except for the seams", closure-check.mjs "Run on every re-vendor"), while the owner's later Aurora-4jl says don't sync. During Aurora-kea that wording got a re-vendor recommended without 4jl in view. Since 4jl the fork changes by feature ports marked "mirrors web/ui" (Aurora-tnk, -qdk, -67y, -kea); a full re-vendor is its own decision (Aurora-ifkn).
---

## Vendored files take fork-local asset paths -- the src lives with the caller
Tags: vendor, duplication, assets
Applies-when: porting an asset-referencing feature into the demo fork

The brand-mark port copied topBar.js verbatim, but the logo src comes from the DashboardScreen call site, not topBar -- so the fork-local path (vendor/webui/icons/aurora-logo.png) had to be wired at both call sites, and seams.test.mjs now forbids page-relative icons/ there the way it already did for Dropdown/NavFooter. A verbatim file copy alone would have shipped a broken image under Pages.

**Fix:** when porting into the fork, grep the ported code for path-like inputs (src, href, icon) and re-anchor each at the call site; extend the seam tripwire to cover the new path the same turn.
---

## Publishing a subdir means curating it, not splitting it
Tags: vendor, deployment, duplication
Applies-when: serving a repo subdirectory as its own site

A raw `git subtree push --prefix web/demo` publishes dev files (tests, agent notes, .gitignore gaps that unhide build output) alongside the site. The split is byte-faithful; curation is a separate step.

**Fix:** sync with excludes (or a publish script that prunes test/agent/build files) rather than a naked subtree push; verify the branch root listing before pointing Pages at it.
---

## A pulled export doesn't pull the database -- after git pull, bd import is the catch-up when the Dolt remote is unused
Tags: beads, sync, git
Applies-when: issue IDs from the committed export are missing in the live DB after a pull

git pull refreshed .beads/issues.jsonl (71 issues incl. 1.0.1) while the gitignored embedded Dolt DB sat a day behind, and bd dolt pull found no remote branches -- nothing had ever been pushed. bd show insisted the issues never existed.

**Fix:** treat the tracked export as the sync channel: bd import (upsert, history-preserving) after git pull; never --reinit-local as sync (it wipes local state). Recorded in AGENTS.md next to the export-before-add rule.
---

## Two deploy paths means checking which one is live before touching either
Tags: deployment, pages, verification
Applies-when: adding, removing, or debugging a GitHub Pages deploy alongside an existing one

The repo had both a gh-pages branch (subtree-pushed web/demo at its root, freshly maintained) and a demo-pages Actions workflow. The workflow was assumed live and nearly became the fix vehicle; the branch was actually serving. Removing the wrong one would have broken deploys.

**Fix:** before changing deploy machinery, list branches and read the workflow triggers, then confirm the Pages source; delete the dead path the same turn so the next agent can't re-adopt it.

---

## Second launch hands off by opening the URL, not by IPC or kill-by-port
Tags: architecture, single-instance, lifecycle, presence
Applies-when: scoping single-instance behavior for a locally-served app

The 52o lock is per config root, and the holder necessarily serves the configured port -- so the second instance just opens browsableAddress()+port and exits 0. Stop signals only our own process; nothing kills by port, so a foreign squatter is never touched.

**Fix:** implemented in both app mains with InstanceLock; edges x2o/lx4 -> 52o record the ordering.

---

## The Background portal is the sandboxed-app path; native tarballs use plain XDG autostart
Tags: architecture, linux, autostart, portal, packaging
Applies-when: deciding start-at-login for a non-Flatpak Linux app

`org.freedesktop.portal.Background` RequestBackground is the sanctioned autostart route for sandboxed apps and unreliable outside a sandbox. A native tarball/zip gains nothing from it.

**Fix:** ship the one aurora.desktop (generated from aurora.desktop.in with Exec baked absolute at configure time), document copying it to ~/.config/autostart, install nothing system-wide; see docs/Building.md 'Start at login'.

---

## A presence-only flag's own value silently doubling as its companion setting's override breaks the moment someone sets it the natural way
Tags: architecture, env-var, presence, dev-tooling
Applies-when: adding a second env-gated dev flag matching an existing enable/override pair convention

`DevLightTap`'s constructor read `AURORA_DEV_LIGHT_TAP`'s value and passed it straight to `parseDevLightTapAddress`, intending "unset = disabled, set = enabled, optionally carrying a host:port override" in one variable -- matching how `AURORA_DEV_FAKE_HUE`'s value can carry an address. But `AURORA_DEV_FAKE_HUE` and its address override are two separate variables (`AURORA_HUE_BRIDGE_ADDRESS`); nothing in the existing convention actually overloads one var's value this way. Setting `AURORA_DEV_LIGHT_TAP=1` -- the ordinary way anyone flips a boolean-shaped flag -- got read as hostname `"1"`, which `inet_pton` rejects, so the tap silently stayed disabled. A live socket smoke test caught it; the pure-function unit tests for the address parser did not, since they never exercised the constructor's actual env-var wiring.

**Fix:** split into `AURORA_DEV_LIGHT_TAP` (presence-only, never parsed) and a separate `AURORA_DEV_LIGHT_TAP_ADDRESS` override, matching the real established convention exactly. `DevFrameDump` was built after this fix and used the two-variable shape from the start. General principle: before overloading one env var's value as both a boolean gate and a configuration payload, check whether the "matching" precedent actually does that or just looks like it would -- and test the constructor's env-var reads live, not just the pure parsing function they call.

---

## A preprocessor-guarded member referenced without its own guard only breaks under the one build configuration nobody's built yet
Tags: architecture, cpp, ifdef, build-configuration, ports
Applies-when: porting a file with #ifdef-gated members/features to a target where the gate resolves differently

`app/linux/src/main.cpp`'s `Pipeline::listZones()`/`updateZone()` both do `if(m_isAudioMode){ return m_audioOrchestrator->...; }` with no `#ifdef` around the reference, but `m_audioOrchestrator` itself is only declared under `#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE` -- `tick()` in the same class guards its own reference to the same member, these two just don't. Invisible on Linux because `AURORA_APP_ENABLE_LINUX_AUDIO_INPUT` (a real, documented CMake toggle) has always defaulted ON there, so the member has always existed in every build anyone's actually run. Porting to `app/mac` (no audio input at all, so the gate resolves the other way) turned it into an immediate compile error.

**Fix:** wrapped both references in the same `#ifdef AURORA_RUNTIME_AUDIO_AVAILABLE` `tick()` already uses; filed the same bug against `app/linux` itself (`Aurora-4g2`; logged on the Mac as `Aurora-y1q`, which never reached the export) rather than fixed there, since it's a real latent bug independent of the Mac port -- anyone building Linux with that toggle off today hits the identical error. General principle: a member declared behind a preprocessor gate needs every reference to it gated the same way, not just some -- and the gap won't show up in CI or local builds until something actually flips the gate the other way, which a same-platform build may never do.
---

## A stale live DB can un-close just-pulled beads -- diff the export after bd import, before anything else
Tags: beads, sync, git
Applies-when: catching up a second machine after git pull when the Dolt remote is unused

After `git pull`, the live Dolt DB was a day behind and the first `bd` commands rewrote `.beads/issues.jsonl` from that stale DB -- silently reopening 6 beads the other machine had just closed (visible in `git diff HEAD` as `-closed`/`+open` pairs). The follow-up `bd import` then faithfully imported the clobbered file ("Imported 134", all open), so the success message itself was the misdirection.

**Fix:** after pull, check `git diff` on the export before running any `bd` command; after `bd import`, diff again -- the worktree must show no regression vs HEAD. If it does, `git checkout HEAD -- .beads/issues.jsonl` and re-import: upsert restores the closes (verified: "Updated 8 existing issues ... open → closed"). General principle: treat the tracked export as disputed territory until DB and file agree -- the import direction is file→DB, so a stale-DB write to the file poisons the source.

Mixed drift is worse (Aurora-9ig, 2026-10-01): the DB held a newer `Aurora-9ig` while the file held a record the DB lacked (`Aurora-daa`) and a newer close (`Aurora-21h`). A full `bd import` would have put the file's stale 9ig over the DB; the export after importing only daa then reverted 21h's close. Pipe single lines in instead -- `grep '"id":"<id>"' .beads/issues.jsonl | bd import -` (or from `git show HEAD:.beads/issues.jsonl` when the export already clobbered it) -- export, and repeat until `git diff` on the file shows only the changes you meant.

---

## Hand-resolving a `.beads/issues.jsonl` merge conflict leaves the live DB behind until `bd import` catches up
Tags: beads, sync, git, merge
Applies-when: resolving a `.beads/issues.jsonl` merge conflict by hand, or any time issues land in the tracked export without going through the live DB first

After hand-merging a `dev`-branch conflict in `.beads/issues.jsonl` (keeping distinct issues from both sides of the conflict), the next `bd create` warned "auto-export skipped: ... contains 6 JSONL-only issue record(s) absent from the local Dolt store" and refused to overwrite the file, rather than silently dropping the hand-merged entries. The live embedded Dolt DB only reflects whatever `bd` itself wrote or last imported -- a text-level git merge updates the tracked file directly and never touches the DB, so the two diverge the moment something other than `bd` is what changed the file.

**Fix:** run `bd import` immediately after resolving any `.beads/issues.jsonl` merge conflict, before running any other `bd` command -- it upserts the file's content into the DB (confirmed here: "Imported 170 issues... Updated 3 existing issue(s)"), closing the gap the warning was refusing to paper over. Opposite direction from "A stale live DB can un-close just-pulled beads" above: there the DB lagged the file after a `pull`; here the file gained content the DB never saw because a merge, not `bd`, produced it -- same rule either way, diff/import before trusting either side.

---

## A citer outside `docs/`'s scan scope can go dead on a doc move and nothing catches it
Tags: docs, check-links, scope, doc-move
Applies-when: moving or renaming a file under docs/ that other files might cite

Migrating `docs/planning/ImplementationPlan.md` to the `Id:`/`[[id]]`
convention (Aurora-d8g), six citers of the file living *outside*
`docs/`'s scan scope -- `AGENTS.md`, `app/linux/README.md`,
`app/windows/README.md`, and three `web/demo/{README,AGENTS,CLAUDE}.md`
files -- turned out to already be dead. `check-links.sh` only walks
`docs/` and `.claude/skills/`, so `app/linux/README.md`'s link had been
silently broken since Aurora-o1e moved the file into `docs/planning/` the
previous day (2026-09-28) -- a full day with a dead link nothing flagged,
found only by grepping for the filename by hand while doing an unrelated
migration.

**Fix:** before or after moving/renaming any `docs/` file, `grep -rn
'<old-filename>'` the whole repo (not just `docs/`), not only
`check-links.sh` -- its scan boundary is real and doesn't cover
top-level/module `README.md`/`AGENTS.md` files that also cite docs.
Converting a found citer's link to `[[id]]` where the target already has
one also makes it immune to the next move, so treat cleanup of these as
free once you're already touching the target doc.

Recurrence (Aurora-6wg, same day): despite this exact lesson being on file
from Aurora-d8g, the very next migration bead (Aurora-w4c, moving
[[browser-analysis]] among 16 others) skipped the repo-wide grep -- scoped
to `docs/` only -- and left 5 fresh dead citers (`AGENTS.md` itself,
`web-processing/README.md`, `web/demo/{README,CLAUDE,AGENTS}.md`)
undiscovered until a user question about the convention's robustness
surfaced them. Knowing the rule didn't make the next bead apply it: a doc
migration's *scope statement* needs the repo-wide grep named explicitly
(not just "migrate docs/X"), or add it as a fixed step in
`docs/README.md`'s reorg checklist itself, since a lesson entry alone
isn't load-bearing on the next similarly-scoped bead.

Resolution (Aurora-y2a): the durable fix was making the tool cover the gap,
not another reminder. `check-links.sh` now also scans the slice READMEs and
the root `README`/`CONTRIBUTING`/`AGENTS`/`CLAUDE` files. Its first run found
four dead citations that had survived every prior review, including one
whose visible label was correct but whose href was not
(`[docs/Building.md](Building.md)` in `CONTRIBUTING.md`, broken on GitHub) --
the kind a human skim reads as fine. Prefer widening a checker's scope over
adding a "remember to grep" step; keep the reorg-checklist grep only for
files outside even the widened scope.

---

## A historical log entry keeps its pre-migration citations, don't retrofit `[[id]]` into an append-only record
Tags: docs, check-links, doc-move, log
Applies-when: repointing bare-path citations to `[[id]]` and one of the citers is a docs/log/ entry

Auditing `docs/lessons/` and `docs/log/` for leftover bare-path citations
after migrating the last 17 archive/planning docs to `Id:`/`[[id]]`
(Aurora-0nu), one log entry stood out from the rest: `docs/log/2026-09-28-docs-archive-and-assets-reorg.md`,
the append-only record of the original archive reorg, cites ~20 of those
same files by the bare paths they had *at the time it was written* --
before any of them had an `Id:`. Every other `docs/log/*.md` citer found
in the audit was a build-history entry describing ongoing work and got
converted normally.

**Fix:** a build-history/follow-up log entry (referencing a doc as a live
source of design/decisions) gets its citations repointed like any other
file -- it's still being read for its content. A reorg/move-narrative log
entry (recording *that* and *where* a file moved, as of that date) does
not -- converting its citations to ids that didn't exist yet would make
the record read as if the migration had already happened when it hadn't,
which is revising history rather than fixing a live reference. The
distinguishing question: is the citation being read for the target doc's
content (repoint it), or is the citation itself part of what's being
recorded (leave it)? Bare paths still resolve either way, so nothing
breaks by leaving the second kind alone.

---

## A validated setter doesn't protect state with a second write path that bypasses it
Tags: architecture, config, validation, persistence
Applies-when: adding validation to a setter for persisted state that also loads from disk

`ConfigStore::fromJson` writes `ConfigData` fields directly, never through `Config::set*` -- so clamping `setAudioCentroidRangeHz` (Aurora-9ca) fixes the REST path but not a hand-edited `config.json` holding 0. The fix needed two layers for that reason: the setter clamp for the live path, plus a non-finite guard at the consumer (`Color::fromHSV`) that holds regardless of how the bad value arrived.

**Fix:** when adding setter validation, grep for direct struct-field writes (loaders, migrations, tests) and decide per path -- sanitize the loader too, or harden the downstream consumer so every path is covered. A regression test that bypasses the setter (zero range straight into `updateDrift`) pins the defense-in-depth layer, not just the setter.

---

## Upstream many small fixes as one heads-up thread plus a few grouped MRs, one commit per fix -- not one MR per finding
Tags: process, upstream, review, huenicorn, rockyroad
Applies-when: sending several independent fixes found while porting someone else's project back to its maintainer

Porting huenicorn produced 10 verified fixes on 10 branches (`Aurora-h45`).
Ten MRs at once is a lot for a solo maintainer, and stacked MRs (1 needs 3,
2 needs 1) each show their base's commits until it merges and need
retargeting after it. Grouping by area gave three MRs: Hue API, portal,
capture. Each keeps one commit per finding, so the maintainer can still
review, drop or revert one fix. That keeps review manageable without
merging unrelated changes into one diff. The pattern had already worked for
RockyRoad: one heads-up issue (ChartConverter#6) listing the fork commits
by group and asking "upstream or keep downstream?". The maintainer accepted
the small focused fixes, declined one, and asked for PRs.

**Fix:** open one short heads-up issue first: thanks, context, grouped
bullets linking fork branches, one line per fix, and an explicit offer to
split or drop. Then send grouped MRs one at a time, smallest and clearest
first; the one that changes runtime behavior goes last, after a real-world
check. Put a droppable trivial fix last in the most related group.

---

## Removing one commit message line from published history: find every ref first, rewrite in one pass, verify trees
Tags: git, history-rewrite, force-push, tags, process
Applies-when: a commit already on shared branches must change (trailer, secret, author) and the repo has several branches, a release tag and multiple clones

Stripping a `Co-Authored-By` trailer from one commit (ab7b799) touched 5 branches, the `v1.0.4` tag and 3 clones, and went wrong in ways worth avoiding.

- **List every ref that reaches the commit, untruncated.** `git branch -a --contains <sha> | head` hid `feat/HAPrep`, which was then left unrewritten and reported clean by mistake. Use `git for-each-ref --contains <sha>` with no `head`; it also covers tags, stashes and `refs/original`.
- **A published release tag counts as a ref to rewrite.** It was the one decision the user had to make (move it or leave the old commit reachable via the tag). Ask before moving it.
- **Rewrite all refs in one `git filter-branch --msg-filter ... -- <base>..<ref> <base>..<ref> ...` invocation.** Commits are deterministic given identical parents, tree and metadata, so shared ancestors get the same new hash on every branch. A later, separate pass over a branch built on the same history lined up with the new `dev` (8 ahead, 0 behind) for the same reason.
- **Verify before pushing:** zero trailer matches, same commit counts, and every commit's tree equal to its original (`git rev-parse <c>^{tree}` paired over `rev-list --topo-order`). A message-only rewrite must change no trees.
- **Back up first** with `git bundle create <file> --all`, outside the repo.
- **Push each ref separately** with `--force-with-lease=<ref>:<FULL 40-char old sha>`. An abbreviated SHA or a pasted `...` ellipsis fails with "cannot parse expected object name". Never put abbreviations or ellipses in commands the user will copy.

**Fix:** the order above. Cheaper alternative if the affected commit is unpushed: `git commit --amend`. Not worth rewriting published history for one trailer unless the user asks.

---

## After a history rewrite, other clones show "N and N different commits"; reset them, never pull or merge
Tags: git, history-rewrite, clones, cherry, backups
Applies-when: a force-pushed branch must be repaired on other machines

An IDE or `git pull` offers to integrate when a branch has diverged ("16 and 16 different commits"). Merging brings the old commits back next to the rewritten ones, trailer included.

- `git cherry -v origin/<b> <b>` decides safety: empty or every line `-` means each local commit already exists upstream under a new hash (nothing to lose); any `+` is real unpushed work and needs `git rebase --onto` or a plain `git rebase origin/<b>` (git drops patch-equivalent commits) instead of a reset.
- Reset with `git branch backup-<b>-old <b>`, `git reset --hard origin/<b>`.
- **Backups and leftovers keep the old history alive in `git log --all`.** `backup-*-old` branches, `refs/original/*` from a previous `filter-branch` (here a branch named `backup/pre-attribution-rewrite`), and local-only branches built on the old history (`fix/AvoidNaN`, `feat/MacSupportV2`) each still reach the old commit. Diagnose with `git for-each-ref --contains <sha> --format='%(refname)'`; clear with `git update-ref -d` and `git branch -D` once `git cherry -v dev <branch>` shows the work is in dev.
- Old git versions reject `git rev-parse --short A B` ("needed a single revision"); run one ref per command.
- A local branch that matches a remote tip with no unique commits can simply be deleted and recreated from the remote.

**Fix:** per-branch cherry check, backup, reset, then a final `git log --all --regexp-ignore-case --grep=<pattern>` that must print nothing. Reflog entries survive until `git reflog expire --expire=now --all && git gc --prune=now`; they do not affect `--all` or pushes.

---

## Before turning a per-copy difference into a hook, check the copy can actually reach it
Tags: architecture, code-reuse, refactor, dead-code
Applies-when: folding near-identical per-app or per-platform copies into one shared implementation with per-caller options

Folding three app copies of `Pipeline::build` into core (Aurora-9ig), the diff showed each app's own default video input name (`"linux"`, `"dummy"`, `"windows"`), and the bead listed it as a platform hook. While writing the options struct it turned out to be unreachable in all three: `build()` returns early when no input is named at all, and an empty video name alongside an audio name always takes the audio branch, so the `empty() ? default : name` fallback never fired. Carrying it into core would have meant an option every app has to set, plus a test, for a value no run can observe.

**Fix:** for each line that differs between the copies, trace whether any input reaches it before giving it a hook; delete unreachable differences in the shared version and say so in the commit. A diff between copies shows where they *differ*, not which differences are live -- the same caution as "a fully ported, fully unit-tested function can still be dead code" above.

---

## "First output" is hash order when no outputs are selected -- Registry name lists are unordered
Tags: architecture, registry, zonemap, testing, nondeterminism
Applies-when: relying on the order of `Registry::outputNames()`/`inputNames()`, or on "the first output" (zone listing, zone edits) with more than one output registered

`Pipeline::build` runs every registered output when `activeOutputNames` is empty, in `Registry::outputNames()` order, and `listZones`/`updateZone` act on the *first* of them. `Registry` keeps an `unordered_map`, so that order is unspecified: a core test expecting `out-a` got `out-b` (Aurora-9ig). Harmless today with Hue as the only real output, but a second output (Home Assistant, Aurora-4zr) makes the Zone Mapping target depend on hashing.

**Fix:** tests select outputs explicitly (`setActiveOutputNames`) when they assert on "first output". Product side tracked in Aurora-9sm: give the unselected case a defined order, or make the zone routes name their output.

---

## A "never return secrets" audit must also follow where each stored secret is *sent*, not just what routes respond with
Tags: security, secrets, hue, ha, routes, contracts
Applies-when: auditing or adding a route that uses stored credentials

Aurora-5i3's audit found every `/api/hue/*` response clean. But two routes
filled an omitted `username` from the stored pairing, while still taking
`bridgeAddress` from the body. So `{"bridgeAddress":"<attacker>"}` made
Aurora send the stored app key to that host, in one unauthenticated request.
That fallback existed for a good reason: GET withholds creds, so the WebUI
can't resend them (see the "full object round-trip" lesson in web-testing.md).

**Fix:** stored creds only ever go to the stored endpoint (`_resolveTarget`
in `PairingRoutes.cpp`). Repointing the endpoint clears them. The HA token
follows the same rule. To audit, trace each secret outward
(header, PSK, body) and check who picked the destination.

---

## A save that follows slow work must write only the fields it derived -- saving the whole object overwrites edits made during the wait
Tags: config, persistence, race, reload, configstore
Applies-when: code loads a file-backed config, does slow work (device handshake, network), then saves; or two code paths update the same file with load() + save()

`Pipeline::build` persisted its derived `refreshRate`/`subsampleWidth` by saving the orchestrator's whole `Config`, which came from a load made before output init. Hue's DTLS handshake takes 1-3s, so a settings PUT saved in that window was overwritten with the older values, and the next reload read the stale file (Aurora-d6i7). The PUT route was the second unlocked writer. `load()` could also read a file `save()` had just truncated, which parses as discarded and reads back as defaults.

**Fix:** give the store an atomic `update(mutate)` under one leaf lock and use it for every partial change, never `load()` + `save()`. A save that follows slow work writes only the fields it derived, and only where still unset on disk. Serialize the whole PUT through its reload and keep a documented lock order (PUT mutex, file lock, host lock), so reloads run in the order their writes landed.

---

## Diff a live change against what the running thing was built from, not against the persisted copy
Tags: config, reload, hot-apply, diff, state, webui
Applies-when: deciding whether a saved settings change can be applied live or needs a rebuild, or showing which mode is running in the UI

Aurora-c0g classifies each config edit as live-tunable or structural by diffing old against new. "Old" read from disk looks natural and is wrong: a structural save whose reload fails leaves disk ahead of the running pipeline, so the next hot-only save diffs against a disk that already holds the failed change, sees "only tuning moved", applies it live, and the structural change is never retried. The baseline also has to be the post-derivation Config for video (display-derived `refreshRate`/`subsampleWidth` filled in), or the first diff reads as a change to 0.

**Fix:** the pipeline keeps the Config it was built from (moved forward by each live apply) and the diff runs against that. A failed reload then keeps surfacing its error on later saves instead of silently diverging. Fields the running mode never reads still move the baseline, and an unclassified field defaults to reload.

The WebUI has the same trap (found scoping Aurora-kea, 2026-10-03). `DashboardScreen._switchMode` refetches after a PUT and re-derives the Video/Audio mode from `/api/config`. On `reloadError` the old pipeline keeps running but the config holds the failed mode, so every section shows the mode that isn't running. `reload()` while paused also returns success without building anything. Neither "succeeded" nor the saved config means "running". **UI fix:** show running state from the pipeline itself (kea's `GET /api/state` flags), never from the saved config. Don't roll the save back either: Mac permission recovery depends on the saved mode starting after relaunch.

---

## Grep the discriminator itself when scoping a "stop gating on X" refactor -- the acceptance criterion names one use and misses the rest
Tags: refactor, scoping, mode, dashboard, acceptance
Applies-when: writing or reviewing acceptance criteria for removing a mode/flag/enum that code branches on

Aurora-kea's acceptance read "no `mode ===` gating left for section visibility". Grepping `mode` in `DashboardScreen.js` and `TuningFields.js` found it also picks which config key gets saved (`_onDeviceFieldChange`, `_switchMode`, the `TuningFields` patch), whether the audio status poll runs, `TuningFields`' field set, and the Zone Mapping empty-state wording. A refactor that met the criterion would have left a mixed-input state showing both pickers but saving only one. The mode also cannot represent "both" or "neither" (both-set reads as video, nothing active reads as video), so the replacement must be independent flags, not a second enum.

**Fix:** scope by grepping the discriminator's every read, not the use the issue names. Sort the hits into visibility, writes, polling, copy and data shape; then decide per group whether this issue or a named follow-up owns it.

## A null pipeline is not a pause -- every reload path resumes it, and every reader goes blank
Tags: architecture, pipeline, reload, pause
Applies-when: adding a stopped/paused state on top of PipelineHost

Designing pause (Aurora-3ddb) as "shut down the pipeline, keep the process" looked free, because `PipelineHost` already tolerates a null pipeline (the fresh-install idle state). Reading the callers showed two traps. `reloadPipelineFromDisk` is the one reload path for settings saves, `/api/reload` *and* Hue pairing, so a pause flag checked only in a new route would be undone by any of them. And `listZones()`/`listMonitors()` return empty with no pipeline, so Zone Mapping and the monitor picker go blank while paused.

**Fix:** the paused flag lives inside `PipelineHost::reload` (a save writes config and stays paused), and readers that matter while paused fall back to on-disk or cached data (`ZoneMapStore`, last monitor list). General rule: before reusing an "empty" state as a new mode, list every writer that leaves that state and every reader that renders it.

## DNS rebinding needs a hostname -- a Host allowlist can admit every IP literal
Tags: security, local-api, dns-rebinding, host-header
Applies-when: adding Host-header validation to a server bound to 0.0.0.0

The Host-allowlist plan first assumed per-OS enumeration of the machine's LAN IPs so a phone could still reach the WebUI by IP. Vite and webpack-dev-server show it's unnecessary: a rebinding attack runs under the attacker's domain, so `Host` always carries that hostname; a request with a bare IP literal in `Host` cannot be a rebinding vector. The Origin-vs-Host check from Aurora-5i3 doesn't stop rebinding, since a rebound page is same-origin with itself.

**Fix:** allow any IPv4/IPv6 literal, `localhost`/`*.localhost`, the machine's hostname and `.local` name, plus a user-set list; refuse other hostnames. Chrome's Local Network Access prompt (mandatory from Chrome 156) blunts rebinding in Chrome only, so keep the check.

## macOS and Windows ship `python3` as an installer prompt, not an interpreter -- helpers an app launches must be compiled or bundle a runtime
Tags: packaging, macos, windows, python, adapters
Applies-when: choosing a language for a helper process the app itself starts

Choosing "Aurora supervises adapters" rested on the assumption that python3 is on every desktop. It isn't: macOS's `/usr/bin/python3` is a stub that opens the Xcode Command Line Tools installer, and Windows' `python3` is an App Installer alias that opens the Microsoft Store. Linux distros do ship it. Hyperion gets Python everywhere only by embedding libpython plus a stdlib zip (Windows) or `Python.framework` (Mac bundle), with matching signing work.

**Fix:** helpers Aurora launches are built in the same CMake superbuild (C++, existing deps and signing path); Python/Node stays for things the user or another client launches (MCP stdio servers, dev tools). Verify "it's preinstalled" claims per OS before designing on them.

---

## A state GET plus a separate event stream loses changes in the gap; send the snapshot as the stream's first event
Tags: api, sse, events, state
Applies-when: adding an events stream next to a polling state route

[[external-control]] planned `GET /api/state` and `GET /api/events`. A client that fetches state and then opens the stream misses anything that changes between the two calls (a pause, say), and shows stale state until the next change. Hyperion's `serverinfo` with `subscribe` avoids it by returning the snapshot and subscribing in one call (`libsrc/api/JsonAPI.cpp`). This matters most for retained-state consumers such as the MQTT bridge.

**Fix:** the stream's first event is the current state, so clients can skip the GET. Test that a new stream's first event equals `GET /api/state`.

---

## Pause needs its re-check at the swap, and its own mutex
Tags: architecture, pipeline, pause, concurrency
Applies-when: implementing pause/resume or any "hold" state on PipelineHost

Checking the paused flag at the top of `PipelineHost::reload` is not enough: `reload()` builds outside the lock, so a `pause()` that lands during the build is undone when the build swaps in (the lights restart under a "paused" label). Two more traps from Aurora-3ddb. `resume()` twice at once would build two pipelines and open two capture-portal dialogs (Aurora-5t2). And `Pipeline::shutdown(false)` ends in Hue's blocking `disableStreaming` HTTP call, so running it under the pipeline lock stalls `tick()` and zone calls. A route that returned `false` for "no pipeline" (zone update, mapped to 404 `unknown_zone`) also gains a second cause once pause exists, and reports it wrongly.

**Fix:** re-check the flag under the lock at the swap and discard (`shutdown(true)`) the stale build; serialize `pause()`/`resume()` on their own mutex taken first; swap the pipeline out under the lock and shut it down outside. Give each route that depends on a live pipeline an explicit paused answer (409) instead of reusing its "not found" path.

---

## A tray label that mirrors app state should be read when the menu opens, not pushed
Tags: tray, pause, ui-state, cross-platform
Applies-when: adding a stateful tray item (Pause/Resume, Start/Stop) on more than one platform

State can change behind the tray's back (Dashboard button, `PUT /api/state`), so a label set only on click goes stale. A push needs per-platform plumbing (Linux `LayoutUpdated` signal and a thread-safe `refresh()`); an open-time read needs almost none. Aurora-5ipy.14/.15/.16 all read `isPaused()` at open: Windows builds the popup per `showMenu()`, Mac sets the title in `NSMenuDelegate menuNeedsUpdate:`, Linux returns needUpdate from `AboutToShow`. Linux also pushes, because SNI hosts can keep a menu rendered.

**Fix:** pass the tray an `isPaused` getter (lock-free atomic) and have the open hook read it. The click callback only posts a flag; the tick loop does the multi-second `setRunning`, so no UI or D-Bus thread blocks and there is no extra thread to join at shutdown.
