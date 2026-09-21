# WebUI testing

jsdom limits, mocks, fixtures, coverage, verification. See [README.md](README.md) for filing rules.

---

## A screen's jsdom test suite passing is proof its logic works, not proof it looks or behaves correctly in a real browser
Tags: webui, jsdom, testing
Applies-when: verifying screens with jsdom without a real browser pass

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

Recurred a third time, pass 2's step 22: `ChannelList.js` (built step 15,
the new Entertainment zone select screen) rendered a plain `<ul>`/`<li>`
with a `.channel-list`/`.channel-list-item` class pair that had *never had
any CSS written for it at all* — no missing `<link>` this time, the
stylesheet itself never existed, in any file, for the entire time this
component had a real screen using it. Three independent occurrences of
"a screen/component renders correctly-structured but unstyled or
unlinked-CSS markup, invisible to every jsdom assertion" is enough to
suggest a systematic gap, not three unrelated slips: nothing in this
project's own build-order step currently asks "does this new component's
markup have a stylesheet, and is it linked" as an explicit checklist item
the way a fetch/render/test triad already is for every new component.

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

Recurred once more, pass 2's step 17: `.toggle-switch`'s explicit
`width`/`height` only take visual effect because every existing consumer
places it inside `.toggle-row`, a `display: flex` container that
blockifies it per the flexbox spec — a bare `<label>` is `display: inline`
by default, where `width`/`height` are simply ignored. `ZoneActiveToggle.js`
already shipped a second variant, `ZoneActiveToggleSingle`, months before
step 17 gave it a real consumer with no `.toggle-row` wrapper (Zone
Mapping's onboarding single-zone toggle) — caught only by reading
`forms.css` directly and reasoning about `<label>`'s default `display`,
since jsdom's assertions on `.checked`/DOM structure had no way to notice
a control that would render at zero visual size. Fixed by giving
`.zat-single-toggle` its own explicit `display: inline-block`. Directly
relevant to Phase D (step 20): the accordion Dashboard rebuild moves
several of these same components (`ZoneCanvas`, `EntertainmentConfigSelect`,
`ZoneActiveToggle*`) into new top-tier/collapsed-section layout homes they
weren't originally styled for — check each one's CSS against its *new*
parent's display mode, not just against the DOM structure a jsdom test can
already confirm is unchanged.

---

---

## A component's own test suite can pass fully while never actually testing "committing a different value changes what's displayed" -- a coverage gap, not a jsdom capability gap
Tags: webui, testing, coverage, dropdown
Applies-when: reviewing a component's test coverage for commit paths

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

---

## A static fetch mock that was accurate can become a false failure once the code under test grows a read-after-write dependency it didn't have before
Tags: webui, testing, mocks
Applies-when: code under test grows a read-after-write the mock lacks

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

---

## A shared test fixture's placeholder value for an unused field becomes load-bearing the moment new code starts reading that field, silently invalidating every scenario built on it
Tags: webui, testing, fixtures
Applies-when: adding reads of previously-unused fixture fields

`bootstrap_test.mjs`'s `baseMocks()` had returned `entertainmentConfigurationId:
''` from `/api/hue/connection` since the field was first threaded through the
mock -- accurate-enough at the time, since nothing in `app.js`'s `probeState()`
read it yet. Wiring the new Entertainment zone select stage into the boot
chain (pass 2 step 18) made `probeState()` read exactly that field for a new
`needsEntertainmentZoneSelect` flag, and every existing scenario built on
`baseMocks()`'s default -- including "everything already valid, boot straight
to Dashboard" -- would have silently started showing the new onboarding
screen, not because those scenarios' own intent changed, but because a value
they never cared about had quietly become load-bearing underneath them. Same
root shape as this file's `active`→presence-signal entry above (a design pass
changing what an existing field means breaks a check nobody wrote down as
depending on it), specialized to test fixtures: the dependency was on a
mock's placeholder default, not on production code.

**Fix:** updated `baseMocks()`'s default to a real config id (`'cfg1'`) so
already-onboarded scenarios stay already-onboarded, and added dedicated
scenarios that explicitly vary the field to exercise the new flag. General
principle: when a step makes previously-unread endpoint fields load-bearing
for a new derived flag, grep every existing test fixture/mock for that same
endpoint -- not just the new scenario being added -- for defaults that were
only ever "accurate by coincidence" because nothing consumed them yet.

---

---

## A tooltip-key oracle proves presence, not placement -- put the title where the hover lands
Tags: webui, tooltips, i18n
Applies-when: verifying tooltip keys and placement

Dashboard Zone picker/gamma/active titles were all present in the descriptor
contract and the keycheck test passed (27 keys, zero Test leftovers), yet only
the Arrange button showed a tooltip in the browser: the Zone titles had been
applied to the `<label>` elements, and hovering the actual controls never
entered the label's hover box. Fixed by moving title application to the
row/container level (plus a zones.select descriptor for the picker, which had
no key at all).

**Fix:** a contract test that counts keys verifies the backend half; placement
-- which element carries the attribute relative to where the pointer actually
lands -- needs its own check (devtools title-attribute inspection or a hover
pass), or a green keycheck will certify an invisible tooltip.

---

## Strip CSS comments before parsing it -- prose poisons block splitters
Tags: webui, testing, css
Applies-when: writing regex/brace-count contract tests over stylesheets

A dashboard contract test split `@media` blocks by brace-counting the raw
stylesheet, but the comments themselves contained "@media" ("the
narrow-viewport @media below..."), so the splitter ate the top-level rule
as a phantom block and the test failed against correct CSS. An earlier
mirror script passed only because it stripped comments first -- the
implementation didn't.

**Fix:** strip `/* */` before any structural CSS parsing in tests, and
mirror the test's exact pipeline (not a cleaned-up variant) when node is
unavailable. Cross-file assertions are worth it: the same test resolves
tokens.css values to prove side breathing equals top padding, so a future
token change fails loudly instead of silently unmatching the frame.
---

## Assert the relationship, not the number
Tags: webui, testing, css
Applies-when: pinning a size or offset that derives from another value

The scene pill's bottom offset equals the top bar's top padding token, and the Welcome logo is 8x the title type -- so the tests assert token equality and the 8x multiple, never 10px or 160px. A token retune or type change then fails loudly at the contract instead of silently unmatching the frame.

**Fix:** when a value is defined as "same as X" or "Nx", write the test as the equation (resolve both sides from source); literals in tests are only for true design constants.
