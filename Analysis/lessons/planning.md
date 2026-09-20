# WebUI planning

Reuse research, JTBD, doc hygiene, and design-process lessons. See [README.md](README.md) for filing rules.

---

## A described "existing component" is a claim to verify, not a fact to build on
Tags: webui, reuse, verification
Applies-when: building on a claimed existing component

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

---

## Component-reuse research answers "could we use this," not "does this screen need it at all"
Tags: webui, reuse, scope
Applies-when: auditing whether a screen needs an element at all

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

---

## A flagged UI gap can already be covered by a normal-path action elsewhere in the same flow
Tags: webui, scope, navigation
Applies-when: adding UI for a gap possibly covered by an existing action

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

---

## A living plan doc's own sections can drift out of sync with each other, not just with the external reality they describe
Tags: docs, planning, webui
Applies-when: editing a living plan doc out of build order

Recurred twice more since first filed (steps 13 and 17), all in
`WebUI/WebUI_Design_1stPass.md` itself — the Dashboard section's own layout mockup still
drawing a "⏸ Pause" button after the same section's own prose had already
cut Pause for v1, and the same mockup's "● Streaming" status-badge wording
outliving the point at which building it honestly turned out to be
impossible (see `output.md`'s `DtlsClient` entry). Four confirmed instances
now across five build-order steps — treat spot-checking a doc section
against whatever else in the same doc it depends on as a checklist item
before relying on it, the same way `using namespace` not resolving a
sibling namespace's own name earned that treatment after its own second
occurrence.

Two separate instances first surfaced this round, both in `WebUI/WebUI_Design_1stPass.md`
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

---

---

## A screen's JTBD pass validates its own interaction model against assumed inputs, not against what a different build step actually decided to supply
Tags: webui, jtbd, zone-mapping
Applies-when: validating interaction models against assumed inputs

Re-examining Zone Mapping's selection model after a live bug report ("zone
5 hides zone 4") traced back to a JTBD question the original pass never
asked. The original pass (build-order step 15) correctly reasoned about
the *shape* of the active/inactive job in isolation and cut huenicorn's
two-list panel for a sound reason -- Aurora's zone count is fixed, not
open-ended membership. But canvas-click-to-select, the interaction model
chosen for the same screen, silently assumed every zone already occupies a
distinct position on screen. That assumption is only true *after* a user
has manually dragged each zone somewhere -- before that, `ZoneReconciler`
(a different step, decided independently) defaults every unmapped zone to
the identical full-canvas rect, so click-to-select is structurally unable
to distinguish between them the moment more than one zone exists unedited.
Neither step's own reasoning was wrong; nothing cross-checked the seam
between them. Distinguishes this as a real process gap, not just an
inherent hands-on-only limit like this file's jsdom-layout entries above:
the question was concretely askable on paper, before any code was written,
by reading `ZoneReconciler`'s default alongside Zone Mapping's selection
design -- it just wasn't part of the JTBD checklist.

**Fix:** treat "what does this screen's chosen interaction model assume
about its own default/never-touched state, and which other already-decided
step actually guarantees that" as its own explicit JTBD question, not just
"does the job need this element" (this file's earlier entry on
component-reuse research). Ask it specifically at any point a screen's
interaction model depends on state (positions, membership, an ordering)
that persists across sessions and is populated by a *different* part of
the system -- the two decisions can each be locally correct and still
combine into a bug that only a live pass surfaces, unless the seam between
them is checked on paper first.

---

---

## Reuse by shared final-layout position and reuse by shared component are different kinds of reuse, and conflating them can make an elegant architecture collapse on the first concrete counter-example
Tags: webui, architecture, reuse
Applies-when: sharing layout or components across wizard and Dashboard

Designing the onboarding wizard for the new accordion Dashboard, "the
wizard *is* the Dashboard, with sections unlocking in place as each
prerequisite is met" looked like the better architecture for a while --
one shell, a new user learns the actual page instead of a throwaway
sequence, zero page-transition cost, and it avoided the (correctly
identified) risk of duplicating fetch/render logic between wizard screens
and Dashboard sections. It broke the moment a new onboarding step
(read-only entertainment-config + channel-name preview, introduced before
device selection) was actually slotted into the plan: that step's content
straddles two *non-adjacent* regions of the final page -- the config
picker lives in Zone Mapping's top tier, the full channel list lives
inside the collapsed Bridge section -- so "reveal the final layout
progressively, top to bottom" has no coherent order to reveal them in.
The idea wasn't wrong because unifying two contexts into one shell is
inherently bad; it was wrong because it assumed reuse had to mean literal
shared DOM/position, when what actually mattered (and what the wizard and
the Dashboard genuinely could share) was the underlying fetch+render
components themselves.

**Fix:** re-scoped to separate screens per context (wizard steps stay
distinct pages, matching today's `showBack`/`onBack`/`onComplete`
convention) built on small, independently-mountable components
(`EntertainmentConfigSelect`, a new read-only `ChannelList`, `ZoneCanvas`,
`ZoneActiveToggle`, `DeviceField`, `TuningSliderGroup`) that each screen
composes in whatever arrangement serves its own job. General principle:
when two UI contexts need "the same thing" but one is a linear
one-topic-at-a-time introduction and the other is a dense always-visible
hub, look for reuse at the component/data level before reaching for one
shared page instance -- a shared shell only works cleanly when every
consumer's own content decomposes into the *same regions in the same
order*, and that's a real constraint worth testing against a concrete
example (not just the cases already in mind) before committing to it.

---

---

## Checking a UI pattern against a live reference implementation's actual source can surface both a domain mismatch and an unrelated visual-collision risk that a pros/cons comparison alone would miss
Tags: webui, reuse, verification
Applies-when: comparing UI patterns without reading the reference source

Asked whether `RockyRoadImport`'s tab-bar pattern would suit Aurora's
Dashboard better than an accordion, rather than reasoning from general tab-
vs-accordion UX tradeoffs, its actual source was read
(`SongConverter/index.html`/`main.ts`). That surfaced two independent, only
code-visible facts: its three tabs are genuinely mutually-exclusive,
non-overlapping tools (pick one converter, the others' state doesn't
matter meanwhile) -- the opposite domain shape from Aurora's
Bridge/Capture/Zone/Tuning, which are simultaneously-true facets of one
running pipeline, not alternatives. And separately, `forms.css` already
explicitly ports its own section-divider styling *from* that same
`RockyRoadImport` tab strip, and Aurora's real Video/Audio segmented
control already shares its pill-radius token with that tab bar's own
buttons -- meaning a real tab component, if ever added, would risk visually
reading as a second version of a control that (unlike a tab) has genuine
side effects (a live pipeline reload). Neither fact was visible from
comparing tabs and accordions as abstract patterns; both came from reading
one specific reference's real markup and this project's own CSS history.

**Fix:** recommended accordion over tabs for the Dashboard on the domain-
shape mismatch, and flagged the shared-styling risk as a reason any future
tab component would need deliberately distinct visual treatment. General
principle: when deciding whether to borrow a UI *pattern* (not just a
function) from a reference implementation, read that reference's actual
usage before comparing it in the abstract -- the same "verify the real call
path, don't trust a plausible-looking match" discipline this file and
`debugging-method.md` already apply to code applies just as much to
borrowing an interaction pattern, and it can surface risks (a styling
collision with an unrelated existing control) that no side-by-side feature
comparison would think to check for.

---

---

## A default chosen to fix one screen's bug can silently block a feature designed in a completely separate, much later pass
Tags: zonemap, defaults, webui, onboarding
Applies-when: choosing defaults consumed by other screens

`ZoneReconciler`'s `active{false}` default for a never-mapped zone exists
for a good, already-documented reason (this file's own JTBD entry above --
it stops a newly-added zone's default full-canvas rect from visually
conflicting with every other zone). Designing the NUX redesign's "Mode +
Device save should make the lights instantly react" step much later,
nothing about that design's own reasoning touched zones at all -- it was
only caught by explicitly reading `ZoneMap.hpp` and `AudioFrameCompositor`
to check the assumption "channels are on by default for a new user," which
turned out to be false. Had that check not happened, the first live test
of the finished onboarding flow would have shown zero reacting lights at
exactly the moment the whole redesign was built to make impressive, with
the actual cause (a boolean default set for an unrelated screen, in an
unrelated part of the codebase, for a good reason) far from obvious from
the symptom alone.

**Fix, once actually settled:** simpler than the first instinct (an
onboarding-only force-activate step) -- just flip the shared default itself,
`active{false}` to `active{true}` in `ZoneMap.hpp`. Re-examining *why* the
`false` default existed turned up that its real justification (protecting
against "zone 5 hides zone 4") was about the *editor's* click-target/z-order
handling, which by this point already had its own independent, permanent
fix (dropdown-based selection decoupled from the canvas, always-paint-
selected-last) -- the active-default was never actually the thing doing
that protection by the time this question came up, it just hadn't been
re-checked. General principle, now two-layered: when a new feature's design
implicitly depends on existing state being in some assumed condition, trace
that assumption against the actual code that sets it (this file's own point
above) -- and once a constraining default is found, check whether the
concern it was originally protecting against still needs *that* default at
all, or has since been independently handled by a different fix. The
workaround that first comes to mind (route around the old default) is worth
comparing against just re-deriving whether the old default is still load-
bearing before building it.

---

---

## Cheap, disposable ASCII diagrams surface layout/state gaps before any code exists, cheaper than jsdom or a real build -- but they can't validate real visual proportions either
Tags: webui, design, ascii, prototyping
Applies-when: exploring layout or state before writing code

Iterating the accordion Dashboard and NUX redesign entirely in ASCII boxes
(no code written) caught several real gaps that stayed invisible in prose
description alone, each concretely because there was a literal artifact to
point at: `OutputConnectScreen`'s Connected state, drawn with only a
"Change bridge" button and no Back/Continue, immediately read as a dead
end once boxed -- the same fact described in a sentence ("shows the
connection status") hadn't raised the question. A drawn active/inactive
toggle list stacked above a column of one-line collapsed headers made a
vertical-space imbalance obvious at a glance that "added a toggle row per
zone below the canvas" in prose never surfaced. Drafting the entertainment-
zone-select step's diagram forced deciding exactly which fields it needed,
which is what exposed that those fields straddle two non-adjacent regions
of the final accordion layout (this file's shared-position-vs-shared-
component entry, above) -- a mismatch no amount of describing the wizard
order in words had surfaced across several prior rounds of the same
discussion. Even shorthand notation inside a diagram needed correcting
once drawn ("Zone 1 ● Zone 2 ○" read as ambiguous between a boolean toggle
and a color swatch until asked directly) -- a diagram makes an
underspecified detail visible in a way prose glosses over.

**Fix:** kept using disposable ASCII mockups as the default iteration
medium for screen/flow design discussions in this project, revising them
freely across many rounds before any component gets built -- the cost of
redrawing a box is close to zero compared to building, testing, and
reworking a real screen. Real limit, worth remembering alongside this:
an ASCII diagram is even more abstracted than jsdom (this file's own
no-headless-browser entry) -- box-drawing characters can't represent true
pixel proportions, real CSS layout behavior, or how something actually
feels to scroll past, so agreement on an ASCII mockup is agreement on
*content and state coverage*, not a substitute for a live look at the
real, built layout once it exists.

---

---

## Checking a new pass's decision against the previous pass's actual code, not just its design doc, surfaces breakage neither document's own text records
Tags: webui, verification, planning
Applies-when: building a design pass over a previous pass

Deciding to flip `ZoneReconciler`'s `active` default for the pass-2 NUX
redesign, `../WebUI/WebUI_Design_1stPass.md`'s own prose gave no reason to expect
trouble -- it never states anywhere that `active` defaulting to `false` is
being relied on as a presence signal. The actual breakage only showed up by
reading `app.js`'s real, current `probeState()` line by line:
`!zonesResult.zones.some((z) => z.active)` is exactly the kind of implicit
dependency a design document doesn't record, because it was never a
deliberate, documented decision -- just how the check happened to get
written at the time, incidentally leaning on a fact that was true then.

**Fix:** when a later pass changes a shared field's default or behavior,
grep the actual codebase -- not just the sibling design doc -- for every
place that field is read, especially checks phrased as "is everything still
at its default" or "has this ever been touched." Those are exactly the
spots most likely to be silently relying on a specific default value as an
implicit signal, and they're invisible from a design document's own prose
since the original author likely never thought of it as a decision worth
writing down either.

---

---

## A build-order plan's own testing shape defaults to "one verification phase at the end" unless a predecessor's actually-successful practice is deliberately re-derived
Tags: webui, testing, planning
Applies-when: writing a build-order plan with verification phases

Scoping the pass-2 build order, testing landed entirely in its final phase
by default -- not a deliberate choice to defer it, just the natural shape a
numbered "build these things in order" list falls into when nobody
explicitly asks how testing should be distributed across it.
`../WebUI/WebUI_Design_1stPass.md`'s own actual history already demonstrated the
better shape: nearly every one of its 19 steps ends with its own "Tested
with jsdom: ..." paragraph, verified as it was built, and its own late
cross-width QA pass caught only three bugs specifically because everything
else had already been individually verified by that point. None of that
shows up by outlining a fresh build order from scratch; it only surfaces by
re-reading the predecessor's actual step-by-step history for *how* it
distributed verification, not just what it decided or found.

**Fix:** added a short testing note to the end of every phase, matching
Pass 1's own demonstrated cadence rather than one verification phase at the
very end. General principle: when planning phase N+1 of a project that
already completed phase N, check phase N's own demonstrated testing cadence
specifically, not just its findings/lessons -- a plan drafted fresh,
however well-designed otherwise, defaults to batching verification at the
end unless a predecessor's better practice is deliberately carried forward.

---

---

## Splitting one screen's responsibility across two needs an audit of *every* edge-case branch the original had, not just its main happy path
Tags: webui, refactor, edge-cases
Applies-when: splitting a screen's responsibility across two screens

Moving entertainment-config selection out of `OutputConnectScreen` into the
new `EntertainmentZoneSelectScreen` (pass 2 steps 14-15), the natural
approach was porting the happy path (pick a config, save it) and treating
everything else as already covered elsewhere. That would have silently
dropped a real, already-shipped case: `OutputConnectScreen`'s original
`configSelect` phase had its own "zero entertainment configurations found"
branch (an error message plus a "Check again" button, for a bridge with no
entertainment areas set up in the official Hue app yet) -- nothing about
the new screen's own design mockup mentioned it, because the mockup was
drawn around the *normal* multiple/single-config cases, the same ones
every other design discussion this pass focused on.

**Fix:** before deleting a phase/branch from the screen that's losing a
responsibility, grep that screen's *own prior code* for every phase it
had, not just the ones the new design's mockups happened to draw -- a
redesign's mockups are drawn around the interesting/common cases by
nature, and a real edge case an earlier pass already had to solve for
doesn't announce itself for re-inclusion just because responsibility moved
elsewhere. Ported the same message/"Check again" affordance into
`EntertainmentZoneSelectScreen`'s own zero-configs branch, with Continue
disabled since there's nothing valid to advance with.

---
