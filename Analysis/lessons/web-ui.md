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
