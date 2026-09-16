# WebUI design-process lessons

Gotchas and hard-won calls from planning Aurora's native WebUI
(`Analysis/WebUIAnalysis.md`) — screen/flow design and component-reuse
research specifically, not rendering (`rendering-apis.md`/
`rendering-internals.md`) or general build/tooling
(`engineering-hygiene.md`).

## A described "existing component" is a claim to verify, not a fact to build on

Building the WebUI plan by surveying huenicorn's and RockyRoad's existing
screens, several recommendations initially rested on secondhand descriptions
(a first pass's summary of huenicorn's "Advanced settings" panel, RockyRoad's
Tuner screen, its own UI-toolkit) before the underlying source was actually
read. Reading the real files each time changed the actual recommendation:
huenicorn's "Advanced settings" toggle turned out to be a bare checkbox with
no chevron or animation, much rougher than assumed; RockyRoad's Tuner screen,
once read in full rather than just its CSS, turned out to be a much stronger
precedent than its summary suggested (device select + gain slider + live
level meter + a real waiting-for-permission state, all in one proven
pattern); and a sibling repo initially dismissed outright (`RockyRoadImport`)
turned out to hold the single best forms precedent of anything checked.

**Fix:** treat "there's a reusable component for that" as a claim pointing at
a file, not a fact — read the actual source before basing a design
recommendation or reuse estimate on it, the same rigor already applied to
third-party library APIs.

## A layout lesson learned in one constrained context doesn't transfer to another without checking the actual numbers

Comparing RockyRoad's desktop and XR versions of its Play screen surfaced a
real principle: a fixed, small, ray-pointer-driven surface (an XR panel)
stacks functional groups into separate rows instead of packing everything
into one dense row. Applying that same instinct directly to Aurora's own Zone
Mapping screen at phone width produced a "one zone at a time" pager design,
on the assumption that "constrained" implied the same restructuring was
needed there too. Checking the actual numbers (Aurora's real zone count,
around 8, against a phone's real content width) showed each zone's drag
handles would land around 100-120px apart even in a full multi-zone grid,
well above a comfortable touch-target minimum — the restructuring wasn't
justified by anything true about Aurora's own data or screen width, just by
importing a lesson from a different kind of constraint (a fixed 400x300 3D
panel with ray-pointer precision) without checking whether the same
conditions actually held.

**Fix:** when reapplying a layout principle learned in one constrained
context to a different one, check the concrete numbers (item count, real
pixel width, real target size) for the new context before restructuring —
"both are constrained" isn't itself evidence the same fix applies.

## Component-reuse research answers "could we use this," not "does this screen need it at all"

Iterating on the WebUI screens, an initial component-by-component audit (does
a reusable pattern already exist for each drawn element) was run before a
separate pass asking whether each screen's actual job required that element
in the first place. Re-running the jobs-to-be-done question against the drawn
screens, after the reuse audit was already done, cut a real fraction of the
list: a manual-credentials fallback (solving a migration problem Aurora has
no existing users to have yet), a live level meter (purely confirmatory,
needing new backend wiring to support a nice-to-have), a two-list
active/inactive panel (modeling an open-ended bridge-light membership problem
huenicorn has but Aurora's fixed zone count doesn't), and settings tabs
(solving a scrolling problem that doesn't exist at Aurora's actual field
count). Each of these had a real, verified reusable precedent — that they
*could* be reused was never in question, only whether the job actually called
for them.

**Fix:** run the "does this job need this element" pass as its own explicit
step, separate from and after the "what's already available to reuse" pass —
component availability makes reuse cheap, which is exactly what makes it easy
to mistake "we could build this" for "this screen needs this."

## A flagged UI gap can already be covered by a normal-path action elsewhere in the same flow

Cutting the WebUI's manual-credentials fallback screen (see above) raised a
real-sounding concern: with no way to type in credentials directly, there'd
be no recovery path if the daemon's persisted Hue credentials ever became
corrupted, only a full physical re-pair. That's not actually a gap — the
Dashboard's Settings modal already has a "Re-pair bridge" action, built for
the ordinary case of switching bridges or entertainment configs, that reruns
the exact same physical-pairing flow and covers corruption recovery just as
well without any new UI. The concern surfaced because the connection between
"a rare failure mode" and "an already-planned normal-path action" hadn't been
made explicit yet, not because the coverage was actually missing.

**Fix:** before adding new recovery or escape-hatch UI for a flagged failure
mode, check whether a normal-path action already elsewhere in the flow
already exercises the same recovery path — pairing/setup/reset actions built
for the common case often already cover the rare one for free.

## A style built ahead of its first real consumer can drift from the very precedent it cites, and nothing catches that until something actually uses it

`shell.css`'s `.status-pill` was written in the app-shell step, before any
screen existed to use it, citing RockyRoad's real `.lib-badge` as its
precedent — but the rule actually written was a generic pill shape (surface-
colored background, 20px radius, 12px text) that doesn't match `.lib-badge`
at all (accent-colored, 3px radius, 10px/500-weight text). Nothing caught the
mismatch at the time because nothing was rendering it yet — CSS with no
consumer doesn't fail to compile, it just silently sits there looking
plausible. It surfaced two steps later, once the Dashboard actually needed
the pill and its real appearance was checked against the cited source for
the first time.

**Fix:** treat a style/component written ahead of its first real use as
provisional, not verified — when its first real consumer actually lands,
re-check it against whatever precedent it originally cited before building
on it further, the same way a claimed-but-unread "existing component" gets
verified before reuse (see this file's own first entry). A rule with no
renderer exercising it is unverified by construction, no matter how
plausible it reads.

## An ARIA pattern that commits a value on every interaction needs adapting when the commit callback has real side effects

Porting `Dropdown.ts` to close its ARIA/keyboard gaps, the actual WAI-ARIA
APG "Collapsible Dropdown Listbox" pattern was fetched and verified before
implementing (not guessed) — its real, tested keyboard model is "select
follows focus": every arrow-key press both moves the visual cursor and
commits that option as the current value, live, the same way a native
`<select>`'s open dropdown behaves. Implementing that literally would have
called `onSelect` once per arrow-key press while a user is still browsing
options. Fine for the reference pattern's own plain-value example; not fine
for Aurora, where `onSelect` callbacks can trigger real side effects
(switching a capture device, a REST call) that shouldn't fire repeatedly
before the user has actually decided.

**Fix:** verifying the real spec first didn't mean adopting it unmodified —
it meant *knowing precisely* which piece to deliberately diverge from and
why. Kept `aria-activedescendant` moving live on every arrow press (so a
screen reader still correctly announces "now on option 3"), but decoupled it
from `aria-selected`/`onSelect`, which only fire on an explicit commit
(Enter/Space/click/Tab-out). Worth checking for on any future component
wrapping a reference interaction pattern around a callback that isn't a pure,
cheap value assignment — the pattern's own keyboard model may assume
committing is free, and it usually isn't in this codebase.

## A living plan doc's own sections can drift out of sync with each other, not just with the external reality they describe

Recurred twice more since first filed (steps 13 and 17), all in
`WebUIAnalysis.md` itself — the Dashboard section's own layout mockup still
drawing a "⏸ Pause" button after the same section's own prose had already
cut Pause for v1, and the same mockup's "● Streaming" status-badge wording
outliving the point at which building it honestly turned out to be
impossible (see `output.md`'s `DtlsClient` entry). Four confirmed instances
now across five build-order steps — treat spot-checking a doc section
against whatever else in the same doc it depends on as a checklist item
before relying on it, the same way `using namespace` not resolving a
sibling namespace's own name earned that treatment after its own second
occurrence.

Two separate instances first surfaced this round, both in `WebUIAnalysis.md`
itself rather than in a claim about huenicorn/RockyRoad. First: the navigation-model flow
diagram had always said a returning user reaches "each of 1/2/3/4" from the
Dashboard, but the Dashboard screen's own ASCII mockup and nav-row list had
never actually been updated to include a row for screen 2 (Mode+Device
Select) — the two sections had simply gone out of sync as steps got built
in a different order than the doc was first drafted in, and nothing forced
a re-check until step 12 actually needed to answer "how does someone reach
this screen." Second: the final component inventory table had listed
"Section heading + divider" as used by screens "1, 4" since an early
planning pass, but Output Connect (screen 1, built in step 10) never
actually used a heading anywhere — confirmed only by rereading its already-
finished source when step 13 went looking for a precedent to reuse, several
steps after the wrong attribution was written and never re-checked.

**Fix:** in both cases, fixed the inconsistency and said so explicitly in
the build-order writeup rather than quietly building around it. General
principle: a plan doc built incrementally across many steps needs the same
"is this claim still true" skepticism applied to its own earlier sections
as to an external source — a flow diagram, a component table, and a screen
mockup are all claims about each other that can silently drift apart as
later steps edit only one of them, not a single source of truth that stays
consistent by construction. When a step is about to rely on what an earlier
section of this same doc says, spot-check it against whatever it's actually
describing (another section, or the real built code) rather than trusting
that "it's already in the plan" means it's still accurate.
