# WebUI components

Component behavior, callbacks, data shapes, and side effects. See [README.md](README.md) for filing rules.

---

## An ARIA pattern that commits a value on every interaction needs adapting when the commit callback has real side effects
Tags: webui, aria, dropdown
Applies-when: reusing an ARIA pattern with side-effecting commit callbacks

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

---

## A shared component's internal value-matching can silently assume every caller's option value is a string
Tags: webui, dropdown, types
Applies-when: passing non-string option values through dataset

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

---

## A component whose parent fully rebuilds its DOM on every render needs its fetch and its draw split into two calls, or it either re-fetches needlessly or goes stale
Tags: webui, components, data-fetching
Applies-when: building components under re-rendering parents

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

---

## An `onChange`/`onSelect` callback should never fire during a component's own construction
Tags: webui, components, callbacks
Applies-when: writing component constructors with callbacks

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

---

---

## Not every reusable UI piece fits the "class that owns and replaces its container's innerHTML" shape every other component here uses
Tags: webui, components, architecture
Applies-when: forcing a UI piece into the shared component shape

Extracting `TuningSliderGroup` (pass 2's Phase B, step 10), the default
move -- matching `DeviceField`/`EntertainmentConfigSelect`/`ZoneCanvas`/
`ZoneActiveToggle*`, all classes that fully own a container and replace its
`innerHTML` -- ran into a real layout constraint none of those had:
`TuningScreen`'s "Color character" section interleaves two sliders, a
checkbox row, and a conditional third slider *inside one shared CSS grid*
(`.tuning-grid`'s `auto-fit` column flow), not as separate stacked blocks.
A component that owns its whole container and draws its own internal grid
wrapper would force that checkbox row either outside the grid (a real
layout change, not the "no behavior change" this phase promised) or
inside a second, separate grid it doesn't share with the sliders above it.

**Fix:** `TuningSliderGroup` shipped as two plain functions
(`sliderGroupHtml`/`wireSliderGroup`) instead of a class -- the caller
still owns the grid container and can freely interleave other markup
into it, exactly as `TuningScreen` already did before extraction. General
principle: before defaulting a new reusable piece to the same
stateful-class-with-owned-container shape every previous extraction used,
check whether an existing consumer's layout requires *sharing* a container
with sibling content the new piece doesn't own -- when it does, a
component that insists on exclusive ownership is solving a problem the
call site doesn't have, at the cost of a real layout change to make room
for it. (Separately, the `ZonePatchQueue` extraction deferred in step 8
until step 9's second real usage existed paid off cleanly here too --
`TuningSliderGroup` had no analogous shared-state need and stayed
stateless, confirming the "wait for a second real usage" call from step 8
wasn't just deferring inevitable work.)

---

---

## Two independently-correct component decisions can combine so that the *first* real usage of one silently exercises a global side effect of the other
Tags: webui, components, side-effects
Applies-when: combining independently-correct component decisions

`AccordionSection`'s "collapsed content stays mounted, not torn down" (built
Phase B, no real consumer yet) and `Dropdown`'s "install one lazy, never-
removed `document.addEventListener('click', ...)` on the very first
`Dropdown` construction anywhere in the page" (built long before
`AccordionSection` existed) were each individually reasonable when written.
Pass 2's step 20 put a real `Dropdown`-constructing component
(`TuningFields`'s Interpolation dropdown) inside an `AccordionSection` for
the first time -- and because collapsed content still fully renders,
`DashboardScreen` now installs that global click listener on its very
first mount, regardless of whether Tuning is ever expanded. Two jsdom test
files (`dashboard_test.mjs`, `dashboard_controls_test.mjs`) had never
needed `global.Node = dom.window.Node` before, since nothing they exercised
had ever constructed a `Dropdown` -- both started throwing
`ReferenceError: Node is not defined` from deep inside jsdom's own event
dispatch on every subsequent click, silently swallowed by jsdom's virtual
console rather than failing the test run (`exit 0`, "All ... tests passed"
still printed), so this was noise easy to miss rather than a hard failure.

**Fix:** added the missing `global.Node` to both files, matching every
other test file that already constructs a `Dropdown`. General principle:
when composing an existing component into a container it was never
previously placed inside (not just a new *layout* context -- see this
file's `.zat-single-toggle` entry above -- but a new *lifecycle* context,
like "mounted but hidden"), check whether that component has any one-time/
global side effect on construction, since a container that keeps content
alive-but-hidden will trigger that side effect on every mount regardless of
visibility, possibly for the first time anywhere the two components are
combined.

Recurred again, this session's 2.5 visual pass, in a new form: even a
genuinely real browser doesn't guarantee a synthetic-input testing method
is "real enough." Playwright's own `page.mouse.down()`/`.move()`/`.up()` --
CDP-dispatched mouse actions, the obvious way to script a drag -- fired
real `mousedown` events in this headless Chromium but never fired
`pointerdown` at all, confirmed by a direct comparison: a manually
`dispatchEvent`-ed `PointerEvent` fired a listener instantly, while the
identical drag driven through `page.mouse` produced zero pointer events on
the same element. `ZoneCanvas.js`'s drag handles listen for `pointerdown`/
`pointermove`/`pointerup` exclusively (support for touch, not just a
mouse -- this file's own header comment), so a mouse-only simulation
silently drags nothing and looks like a no-op, not an error -- the
handle's own `style.left` and the expected `PUT /api/zones` body simply
never appeared. A related, narrower gap found in the same pass:
`getComputedStyle(el, '::-webkit-slider-thumb')` doesn't reliably resolve
a vendor-prefixed pseudo-element's real computed style in Chromium at all
(it isn't a CSSOM-recognized generated-content pseudo-element) -- it
returned the host `<input>`'s own unrelated values, plausible-looking
rather than an outright error, and only a cropped real screenshot could
confirm the actual thumb styling.

**Fix:** for any interaction that specifically depends on Pointer Events
(not just any-input hit-testing), dispatch synthetic `PointerEvent`s
directly (`element.dispatchEvent(new PointerEvent(...))`) instead of
trusting a mouse-simulation API to produce them; for a vendor pseudo-
element's visual styling, verify with an actual (even cropped) screenshot,
never a computed-style probe. General principle: a real browser closes
jsdom's layout/hit-testing gap, but its own *scripting* surface (mouse
simulation, computed-style introspection) has narrower gaps of its own
that don't announce themselves as failures -- they look like the
interaction simply had no effect, or like a plausible-but-wrong style
value. Treat "runs in real Chromium" as necessary, not sufficient, for
verifying event-model-specific or pseudo-element-specific behavior.

---

---

## A config field's real domain is defined by its actual backend consumer, not its wire type or its current UI widget -- and checking already-exposed data beats assuming new backend surface is needed
Tags: webui, config, backend
Applies-when: exposing a config field in the UI

Replacing Tuning's raw `subsampleWidth` number input started as a UI-taste
question (slider vs. stepper vs. dropdown) until
`IVideoInput::subsampleResolutionCandidates()`
(`Aurora/core/Input/include/Aurora/Input/IVideoInput.hpp`) was actually
read: the field isn't a continuous pixel count at all, it's meant to be one
of a small, monitor-resolution-dependent set of common divisors (16
candidates for a typical 1920x1080 display) the backend already computes to
pick a clean "auto" default -- information the existing raw number input
never reflected, silently allowing (harmlessly, but not ideally) any
arbitrary width the backend never intended as a real choice. Separately,
the first cost estimate for surfacing that candidate list assumed a new
backend route was needed, before checking that `/api/monitors` already
returns each monitor's `width`/`height` -- exactly the two inputs the
divisor math needs, making the whole thing a small pure JS function with no
backend change at all.

**Fix:** ported the computation to `SubsampleCandidates.js`, verified by
real execution against several resolutions before wiring it in, and reused
`/api/monitors`'s already-fetched data instead of adding an endpoint.
General principle: before picking a UI control for a config field, trace
what its actual backend consumer treats as valid, not just its persisted
type -- and before estimating the cost of exposing backend data to a UI,
check what an existing route already returns rather than assuming new
surface is required.

---

---

## Mirror the wire format, not the storage struct
Tags: webui, api, wire-format
Applies-when: shaping frontend payloads against backend models

Seeding the demo shim from Config.hpp field values nearly shipped
interpolation: 2 (the storage int for Area) -- but SettingsRoutes
serializes names ('Area') and the TuningFields dropdown matches names.
An int seed would have silently displayed the fallback while disagreeing
with the real value on any non-default setting. The HTTP layer is its own
representation with its own defaults and fallbacks; the struct is not it.

**Fix:** derive every shim seed and shape assertion from the route's own
_toJson/parse code, and keep one contract test per route so a serializer
change fails loudly. Never seed from the struct definition.

---
