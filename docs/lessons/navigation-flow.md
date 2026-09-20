# Navigation flow

Back/Continue, gating, races, interaction models, NUX crossings. See [README.md](README.md) for filing rules.

---

## A screen's own interaction model (when a selection actually takes effect) is a design decision that needs stating, not something a debugging session can reverse-engineer from behavior alone
Tags: webui, design, interaction-model
Applies-when: choosing when a selection takes effect

Live-testing reports across several sessions ("clicking Video/Audio on the
capture-select screen doesn't do anything," "lights don't react until Zone
Mapping loads") drove an extended diagnostic chain: cross-file wall-clock
logging added across three repos, a DTLS handshake's own duration isolated
and measured, `Orchestrator`/`AudioOrchestrator`'s silent empty-buffer/
no-frame-yet early-return investigated. All of it was real, correct, and
useful -- and all of it was downstream of the actual disconnect.
`ModeDeviceScreen.js` was built with a deferred-apply model (nothing sent to
the backend until Continue is clicked, deliberately, per its own header
comment citing an earlier build step's simplification); the person testing
it expected a live-apply model (Video connects the moment the screen loads,
clicking Audio switches immediately) -- the same model `DashboardScreen`'s
own equivalent control already uses elsewhere in this exact codebase. Both
models are reasonable, both already existed somewhere in this project, and
nothing in the code was broken -- the screen was doing precisely what it had
been built to do. No amount of timing or protocol investigation could ever
have found this, because the mismatch wasn't in any mechanism the logging
could observe.

**Fix:** implemented the live-apply model to match the intent, once the
intent was actually stated in plain language. General principle: when a
live-test report describes something "not reacting," check what the
screen's own interaction contract actually promises (deferred-save vs.
live-apply, in this case) before instrumenting the mechanism that would
produce the reaction -- a screen can be functioning exactly as designed and
still not match what a report assumes it should do, and that specific kind
of gap never shows up in a log, no matter how much of the pipeline it
covers.

---

---

## A UI that displays a resolved default value looks identical to one that has actually persisted it, and that gap can recur in more than one place before it's worth fixing structurally
Tags: webui, config, presence, nux
Applies-when: displaying resolved defaults as selected

Chasing "the NUX lands back on an earlier onboarding screen after
completing it and relaunching," the same shape of bug turned up twice,
independently, in different components. First:
`EntertainmentConfigSelect.mount()` renders no dropdown at exactly one
entertainment config, showing a static "Using: `<name>`" label instead
(via `getSelected()`'s own fallback to `configs[0]`) -- but the *only*
thing that ever persisted a selection was that dropdown's own `onChange`,
so the label looked exactly like a real, saved choice while nothing had
actually been written. Fixing that surfaced the same shape again, one
level up: `ZoneMappingScreen`'s Save button doesn't require or record any
edit, so every zone's `everConfigured` flag stayed `false` forever for a
user who found the crop defaults acceptable and never touched anything --
`probeState()`'s `needsZoneMapping` check (deliberately requiring a real
edit, not just a visit, so it can't be fooled by an unconfigured zone that
merely exists) had no way to tell "the user is fine with the defaults"
from "the user never got here." Two different components, same underlying
mistake: treating "the UI is currently showing X as selected" as
equivalent to "X has been persisted," when the former can be true from a
fallback/default alone.

**Fix:** patched the first occurrence locally (`EntertainmentConfigSelect.load()`
now silently persists an unset default the moment it resolves one), but
didn't chase the second one the same way -- added a single `Config::nuxCompleted`
flag instead (see `docs/WebUI/WebUI_Fixes.md`'s writeup) once the
second occurrence confirmed this wasn't a one-off. General principle: the
first instance of "displayed but not persisted" is a local bug fix; the
second instance of the *same shape*, in an unrelated component, is a
signal to stop patching occurrences and fix the class instead -- in this
case, by no longer needing any individual "was this specific thing ever
touched" signal to be right at all once the wizard has been through once,
rather than trying to make every such signal in the app correct.

---

---

## A feature named for two screens needs confirming both screens actually route through the code being edited, not just that a component with the right job exists
Tags: webui, navigation, grep
Applies-when: adding a feature spanning multiple screens

Asked to add an "Auto-arrange zones" button to "the NUX and Dashboard zone
mapping UI," the button was added to `ZoneMappingScreen.js` and reported
done. `ZoneMappingScreen` is only ever constructed from the onboarding
boot chain (`app.js`) -- `DashboardScreen.js` builds its own separate
top-tier zone UI directly from `ZoneCanvas`/`ZoneActiveToggle*`, and never
mounts `ZoneMappingScreen` at all. The two screens look like "the same
zone mapping feature" to a user and share several of the same extracted
sub-components (this file's own shared-component-vs-shared-position entry,
above, is exactly why that extraction happened), which made it easy to
assume editing one had covered both. The gap wasn't caught until the user
reported the button missing from the Dashboard; grepping for
`ZoneMappingScreen` afterward found zero references anywhere in
`DashboardScreen.js`, a one-command check that would have caught it before
reporting the task done.

**Fix:** added the same auto-arrange logic separately to `DashboardScreen.js`'s
own `_renderTopTier()`, duplicating the PUT/refetch calls rather than
sharing them, since the two screens refresh completely different state
afterward (one screen's own body vs. the Dashboard's top tier + Bridge
section list). General principle: when a task names two or more screens a
feature should reach, grep for the actual class each named screen
constructs before declaring the work done after editing just one file --
"these render the same feature" is not evidence they're the same
component, especially in a codebase that deliberately extracted shared
pieces so different screens *could* compose them differently.

---

---

## An expensive operation doesn't need a cheaper implementation to go live -- it needs a gesture-end commit signal, not a more frequent or debounced one
Tags: webui, reload, performance, gestures
Applies-when: wiring expensive backend ops to UI gestures

The actual design decision behind this one: the accordion Dashboard had two
sections with opposite interaction models for no reason a user could see --
Zone Mapping applied every edit live, Tuning required an explicit Save. The
goal was making every option on the Dashboard behave the same way, not a
technical curiosity about commit signals for their own sake; the commit-
signal work below is what made that consistency goal actually achievable
without also making the expensive case (Tuning) unaffordable. Chasing
whether Tuning's sliders could match Zone Mapping's live-PUT-per-edit model,
the real blocker wasn't operation cost in the abstract --
`PipelineHost::reload()` (`Aurora-App-Windows`/`Aurora-App-Linux`'s
`main.cpp`) genuinely tears down and reconstructs the whole pipeline,
including a Hue DTLS handshake measured elsewhere this session at 1-3+
seconds. The instinct that followed -- debounce the spam with a timer --
still treated this as a *frequency* problem. The actual fix was recognizing
that native form controls already expose the same "gesture started/ended"
signal Zone Mapping's own drag-release already relies on: a mouse/touch
drag's `change` fires once, on release. Keyboard needed its own
`keydown`/`keyup` tracking specifically because `change` *also* fires per
discrete keyboard step, including every OS key-repeat while a key is held
-- a naive `change`-only listener would still have spammed reload() during
a held arrow key. Once commit was tied to the actual end of a real user
gesture instead of either "every tick" or an arbitrary delay, the expensive
operation's cost stopped mattering: it now fires once per completed
interaction, the same rate a manual Save button always fired at.

**Fix:** `TuningSliderGroup.js`'s `wireSlider` commits via `change`
(pointer) and paired `keydown`/`keyup` tracking (keyboard), no timer at
all. General principle: before reaching for a debounce to tame a "fires too
often" concern, check whether the interaction already has a real,
event-driven start/end signal (pointerdown/up, keydown/up, drag/drop) that
represents "the user is done" more precisely than any fixed delay could --
a timer is the right tool only once no such signal exists.

---

---

## Moving a navigation affordance from "always rendered" to "rendered in the main content branch" silently drops it from every early-return branch
Tags: webui, navigation, rendering
Applies-when: moving navigation into conditional renders

The NUX Polish Pass moved Zone Mapping onboarding's Back button from the
top bar (rendered unconditionally in `mount()`, present regardless of what
`_render()` later does) to `NavFooter` (rendered inside `_render()`
itself). A first-draft implementation would have put that `renderNavFooter`
call where the old `Save` button lived -- at the bottom of `_render()`,
after the three early-return branches for `zones === null`, `!outputName`,
and `zones.length === 0`. Each of those branches returns before reaching
that call, so a daemon-unreachable error (or any of the other two) would
have rendered with *no way out at all* -- worse than before, since the top
bar's Back at least still worked in every one of those states.

**Fix:** moved the `renderNavFooter` call to the very top of `_render()`,
before any early return, so Back (and Finish, as a skip-out) are present
in every branch, not just the one with real content. General principle:
when a navigation affordance moves from a place that renders unconditionally
(a `mount()`-time call, a shared shell) to a place that renders conditionally
(inside a screen's own `_render()`, alongside its content), audit every
early-return branch of that render method explicitly -- an affordance added
only in the "happy path" silently vanishes from every error/empty/loading
state that returns before reaching it, and this class of gap doesn't show
up in a normal-case visual check, only in one that deliberately exercises
each early-return branch.

---

---

## A Continue button that only navigates must still wait for the screen's own in-flight save, when the next step is decided by re-reading that save
Tags: webui, navigation, race, nux
Applies-when: navigating after a save the next step re-reads

NUX's Capture screen (`ModeDeviceScreen.js`) live-applies every toggle via
an async `PUT /api/config` that triggers a multi-second backend pipeline
rebuild — and Continue was pure navigation into `goToZoneMappingStage()`,
which re-probes (`probeState()` in `app.js`) to decide Zone Mapping vs.
Dashboard. Hitting Continue while the last toggle's save was still landing
let the probe read the *pre-switch* pipeline (e.g. the old audio pipeline's
empty zones) and wrongly skip Zone Mapping straight to the Dashboard on a
fresh NUX — even though every toggle had visibly "worked" on the screen
itself. Slow to catch because it needs a fast click after a slow save, and
the resulting skip looks identical to the legitimate already-configured
skip (zones with `everConfigured: true`), which was the first — wrong —
suspect.

**Fix:** `_applyMode()` tracks its run on `this.applyPromise`; Continue goes
through `_onContinue()`, which awaits it before navigating (a rejected apply
still navigates — its error already shows inline). Verified with a jsdom
harness driving the real screen module against a slow stub backend: pre-fix
navigates on the stale config, post-fix waits for the fresh one. General
principle: whenever navigation's target is derived from re-reading state the
current screen itself just wrote, the navigate handler must join the
screen's pending write first — "save on change, navigate on click" is only
safe if the click can never overtake the save, and a slow backend makes
"overtake" the normal case, not an edge case.

---

---

## Trace what the navigation target actually reads before gating navigation on a write
Tags: webui, navigation
Applies-when: gating navigation on a write

Proposed awaiting ZoneMapping's background decoration in onboarding Finish
to protect its silent entertainment-config persist -- then traced the real
path and retracted it: Finish's target (`toDashboard` in `app.js`) reads
nothing (no `probeState()`, fire-and-forget `nuxCompleted`), zone edits
already PUT immediately per edit with no staged concept, and the persist
being "protected" had already landed a full stage earlier
(`EntertainmentZoneSelectScreen` awaits `load()` before rendering
Continue). The gate would have added bridge latency to an instant-exit
button for zero data benefit.

**Fix:** a wait before navigation is only justified when the target
derives state from the awaited write -- verify by reading the target
handler, not the source screen. General principle: "don't navigate until X
lands" needs a named reader of X on the other side, or it is pure cost.

---
