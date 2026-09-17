# WebUI design-process lessons

Gotchas and hard-won calls from planning Aurora's native WebUI
(`Analysis/WebUI/WebUI_Design_1stPass.md`) — screen/flow design and component-reuse
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

## A screen's jsdom test suite passing is proof its logic works, not proof it looks or behaves correctly in a real browser

Five build-order steps' worth of jsdom tests (Zone Mapping and Output
Connect especially) were all green going into step 19's dedicated
cross-width QA pass — the first time any screen was actually rendered in a
real Chromium (via Playwright) rather than jsdom, which does no real CSS
layout, no SVG layout, and no real hit-testing at all. That pass found
three concrete bugs jsdom structurally could not have caught, plus a fourth
of the same root cause found the step before it:

- Zone Mapping's canvas SVG uses `viewBox="0 0 100 100"` with
  `preserveAspectRatio="none"`, deliberately stretching non-uniformly to
  fill a 16:9 box — correct for the zone rects themselves (UV space should
  map directly onto the box), but that same stretch silently distorts any
  *fixed-size* shape or text drawn in the same coordinate space: a
  `.zm-handle` meant to be a circle measured ~24×14px in a real render, and
  the selected-zone size label rendered as squished, overlapping text.
- The centered zone-ID/active-checkbox badge sits exactly where a user's
  first click to select a zone naturally lands, and `pointer-events: auto`
  on the whole badge (needed so its own digit/checkbox are clickable) meant
  any click landing on the badge's own padding — not its digit, not its
  checkbox — was swallowed with no listener attached, never reaching the
  zone rect's own selection handler underneath. Found by literally trying
  to click a zone while writing the QA pass's own Playwright automation.
- A `@media (max-width: 480px)` rule on Output Connect's `.oc-actions`
  (`width: 100%` + `justify-content: stretch`) was written and verified
  against the entry phase, where that container only ever holds one button
  — trivially "full width" there. The pairing phase's own `.oc-actions`
  holds two buttons in the same still-`flex-direction: row` container; two
  100%-wide flex children in a row don't stack, they just both shrink to
  fit — measured directly at 390px, each button came out ~170px instead of
  the intended ~343px.
- A step earlier (18): `index.html` never linked `styles/zone-mapping.css`
  at all, built back in step 15 — it had been rendering completely
  unstyled in every real browser since, caught only once a routing change
  made that screen reachable from a cold boot rather than only a manual
  Dashboard click.

**Fix:** budget a real-browser pass — even a lightweight one, static files
served as-is with `/api/*` mocked via route interception, no live backend
or real device needed — for any screen with real CSS layout, SVG, or
interactive hit-testing, before considering it actually verified. Treat a
fully-green jsdom suite as "the logic is correct," not "the screen is
correct" — jsdom's inability to lay out CSS/SVG or hit-test real geometry
means an entire class of real, user-visible bugs (distorted shapes, dead
click zones, a responsive rule that silently breaks for a second consumer
of the same class, a missing stylesheet `<link>`) can hide behind 100%
passing tests indefinitely, surfacing only once something forces an actual
render.

---

## A component's own test suite can pass fully while never actually testing "committing a different value changes what's displayed" -- a coverage gap, not a jsdom capability gap

Distinct from this file's own entry above: this one isn't something jsdom
is structurally unable to check (no layout or real hit-testing needed,
just DOM attribute/text assertions) -- the test just never wrote it.
`Dropdown._commit()` closed the menu and called the caller's `onSelect`
but never updated its own trigger label or `aria-selected`, so a real
click that correctly changed the underlying value left the dropdown
looking like nothing happened. Step 8's own ARIA/keyboard suite was
extensive and fully passing, but every one of its assertions fell into
one of two buckets: checking the *initial* rendered state, or checking
that *browsing* (arrow keys) deliberately does not change selection --
never "commit a value different from the initial one, then check the
label/aria-selected actually moved to it." A test suite built around
"does browsing leave selection alone" can be complete on its own terms
and still never exercise the one state transition (commit-a-new-value)
that the component's entire purpose is to make useful. Found only via
real user testing, not any layout/rendering concern -- confirmed the
underlying value was always correct (the real PUT/POST body sent showed
it) before finding the display never followed.

**Fix:** fixed `_commit()` to update its own label and `aria-selected`
before calling the caller's `onSelect`; added a regression assertion
committing a genuinely different option than the initial selection and
checking both the label and `aria-selected` moved. General principle:
when a stateful component's test suite is organized around "initial
state" and "interacting without committing doesn't corrupt it," add an
explicit third case -- "committing a different value than the initial one
updates every derived display," since the first two categories can both
be airtight while structurally never exercising that transition at all.

---

## A shared component's internal value-matching can silently assume every caller's option value is a string

Reusing `Dropdown` for Zone Mapping's new zone-selector (`value: zone.zoneId`,
a number) after the entertainment-config picker had only ever used it with
string values (bridge UUIDs): clicking any option did nothing, no error, no
console warning. Root cause: the menu's click handler matched
`this._options.findIndex((o) => o.value === btn.dataset.value)`, and
`dataset.value` is always a string by DOM contract regardless of what's
assigned to it -- `btn.dataset.value = opt.value` coerces a number to its
string form on write, but the original numeric `opt.value` stored on the
option object itself stays a number. `5 === "5"` is `false`, so the option
was never found, and `_commit()` was simply never called -- a silent no-op,
not a thrown error, with zero surface area to be found until a caller
finally supplied a non-string value.

**Fix:** compare `String(o.value) === btn.dataset.value` instead of a raw
`===`. General principle: a reusable component's internal comparisons
against a DOM-derived value (a dataset entry, an input's own `.value`, an
attribute) need to normalize types explicitly, since the DOM's own
coercion (always-string) can silently diverge from whatever type a
caller's own domain naturally uses (a numeric ID, a boolean) -- and because
the mismatch fails silently rather than throwing, it can pass unnoticed
through every existing test until a caller with a different value type
actually exists to exercise it.

---

## A static fetch mock that was accurate can become a false failure once the code under test grows a read-after-write dependency it didn't have before

`zone_mapping_test.mjs`'s mock for `GET /api/hue/connection` returned one
fixed value regardless of any prior `POST` in the same test run -- correct
when written, since `_setEntertainmentConfig` only updated local state on
success and never re-fetched anything. A later fix in the same area (this
session: `_setEntertainmentConfig` now calls `_load()` on success so the
zone list reflects the newly-selected config) added exactly that
read-after-write dependency, and the still-static mock started making the
switch look like it reverted itself on every test run -- a failure that
looked like a regression in the new reload code, when the reload code was
actually correct and the mock had simply fallen out of sync with a new
real behavior it was never updated to model.

**Fix:** made the mock stateful -- a successful POST updates a local
variable the subsequent GET handler reads back -- matching how
`CredentialsStore` genuinely persists on the real backend. General
principle: when a fix adds a "write, then read the same thing back" cycle
to any request flow, audit whether existing mocks for the read side of
that cycle are static -- a static mock is silently invalidated by that
class of change, and the resulting test failure is easy to misdiagnose as
a bug in the new code rather than what it actually is: a test double that
no longer models the real endpoint's behavior.

---

## A screen's JTBD pass validates its own interaction model against assumed inputs, not against what a different build step actually decided to supply

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

## Reuse by shared final-layout position and reuse by shared component are different kinds of reuse, and conflating them can make an elegant architecture collapse on the first concrete counter-example

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

## Checking a UI pattern against a live reference implementation's actual source can surface both a domain mismatch and an unrelated visual-collision risk that a pros/cons comparison alone would miss

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
`engineering-hygiene.md` already apply to code applies just as much to
borrowing an interaction pattern, and it can surface risks (a styling
collision with an unrelated existing control) that no side-by-side feature
comparison would think to check for.

---

## A default chosen to fix one screen's bug can silently block a feature designed in a completely separate, much later pass

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

## Cheap, disposable ASCII diagrams surface layout/state gaps before any code exists, cheaper than jsdom or a real build -- but they can't validate real visual proportions either

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

## Checking a new pass's decision against the previous pass's actual code, not just its design doc, surfaces breakage neither document's own text records

Deciding to flip `ZoneReconciler`'s `active` default for the pass-2 NUX
redesign, `WebUI_Design_1stPass.md`'s own prose gave no reason to expect
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

## A build-order plan's own testing shape defaults to "one verification phase at the end" unless a predecessor's actually-successful practice is deliberately re-derived

Scoping the pass-2 build order, testing landed entirely in its final phase
by default -- not a deliberate choice to defer it, just the natural shape a
numbered "build these things in order" list falls into when nobody
explicitly asks how testing should be distributed across it.
`WebUI_Design_1stPass.md`'s own actual history already demonstrated the
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

## A component whose parent fully rebuilds its DOM on every render needs its fetch and its draw split into two calls, or it either re-fetches needlessly or goes stale

Extracting `EntertainmentConfigSelect` out of `ZoneMappingScreen.js`
(pass 2's Phase B, step 7), the natural first design bundled "fetch the
config list" and "render the dropdown" into one `mount(container)` call,
matching how `Dropdown` itself works. That breaks the moment the *caller*
is considered: `ZoneMappingScreen._render()` wipes and rebuilds
`.zm-body`'s entire `innerHTML` on every render (already true before this
extraction, for reasons unrelated to this component), so a persistent
`EntertainmentConfigSelect` instance would need re-mounting into a fresh
container node on every one of those renders -- and a bundled
fetch+render would silently re-fetch the bridge's config list every single
time, including re-renders triggered by something that has nothing to do
with entertainment configs at all (a zone-selection change, a patch
failure banner).

**Fix:** split the component's API into `load()` (fetch only, resolves the
data) and `mount(container)` (draw only, from whatever `load()` already
fetched, safe to call repeatedly with a fresh container). The caller fetches
once and mounts as many times as its own re-render cadence requires.
General principle: before bundling "get the data" and "show the data" into
one method on a new component, check how often the *parent's* own render
cycle will need to redraw it -- a component that looks simpler with one
combined call can hide an accidental repeated side effect the moment its
consumer's redraw frequency is higher than its data's actual staleness
requires.

---

## An `onChange`/`onSelect` callback should never fire during a component's own construction

`ZoneCanvas`'s constructor resolves an initial selected zone (falling back
to the first zone when none is given, same "always a real selection" rule
`EntertainmentConfigSelect` already uses) and was nearly wired to call its
own `onSelect` callback for that resolved value before returning, so a
sibling component could learn the initial selection without the caller
having to separately read a property. Rejected: a callback firing before
the constructor returns fires before the caller has anywhere to have
stored the new instance yet, an ordering trap that's invisible until some
future caller's callback closure tries to reference `this.zoneCanvas` and
gets `undefined`.

**Fix:** `onSelect` only fires on a later, genuinely-a-change event (a tag
click, a dropdown pick) -- the caller reads `.selectedZoneId` directly
right after construction for the initial value instead. General principle
for any new component with a change-notification callback: a callback is
for telling a caller about something that happened *after* they already
have a live reference, never for the resolved value construction itself
produced -- that belongs in a return value or a readable property, not a
callback.
