# WebUI design, pass 2.5: visual polish diffs

Bounded doc: captures the layout/styling diffs found so far comparing the
real, currently-shipped Dashboard against `Aurora-WebUI/Static_2.5_VisualPass`'s
new visual pass, worked out before any of it is built. Not a rebuild of
Pass 2's own rationale (`WebUI_Design_2ndPass.md`) — this is strictly "what
changed visually," confirmed against the actual Figma-derived source one
item at a time with the user, not guessed from the flattened export alone.

## Source material and its own limits

`Static_2.5_VisualPass/2_Pass/*.html` is this repo's own debug-export dump
(`app.js`'s `H`-key hotkey) — real class names, real live-rendered markup,
ground truth for "what's shipped today." `Static_2.5_VisualPass/2.5_Pass/*`
is a Figma-plugin export of the new visual pass, and it has real corruption
worth knowing about before trusting its raw HTML/CSS directly:

- Text content got used to derive HTML tag names in a few places: "Video"/
  "Audio" (the mode-toggle button labels) became literal `<video>`/`<audio>`
  media elements, and "Area" (the Interpolation dropdown's selected value)
  became an empty `<area>` void tag — all three lose their real text content
  in an actual browser render (`<audio>` with no `controls` renders at zero
  size; `<area>` structurally can't hold text at all).
- Every `background+border` class name is unescaped in the CSS, so
  `.background+border` parses as the sibling combinator (`+`) rather than a
  class selector — 11 rules covering the whole Zone Mapping canvas
  background/border, zone size-label positions, and the SVG/vector styling
  underneath it match nothing at all.
- A handful of multi-part text labels (e.g. "Zone 0 (Entranceway)") got
  split into a class plus a bogus bareword HTML attribute (`<p class="zone"
  Entranceway>`) -- harmless to a browser, but noise when reading the file.

None of this blocks reading the file for layout/spacing *intent* -- the
diffs below were confirmed against the actual numbers in
`2.5_Pass/Dashboard_Expanded.css` and cross-checked with the user against
the real Figma source, not inferred from guesswork.

## Confirmed diffs

**Top bar: "Running" badge removed, Stop moves into its corner, "Aurora"
grows.** Today the top bar has three slots -- empty left, "Aurora" centered
(`.top-bar-title`, `font-size: 16px`), and `.status-pill` "Running" in the
right-side trailing slot -- with Stop living entirely separately, below the
top bar in `.db-controls-row`. The new pass removes the "Running" pill
outright and moves Stop up into the top bar itself, taking the same
right-side corner the pill vacated (confirmed -- not assumed from the
export's own unreliable DOM order). "Aurora" itself grows from 16px to
20px (`2.5_Pass/Dashboard_Expanded.css`'s `.aurora`, `font-size: 20.00px`)
and stays centered -- Stop moving into the same row doesn't shift it,
confirmed.

**Accordion headers become a floating pill, wider than the content column,
sitting above it -- not a panel that extends down to cover the expanded
content.** Today, `.accordion-header` has no background at all -- a flat
row, with only `border-bottom: 1px solid var(--aurora-divider)` on the
section itself. The new pass gives every accordion header (Bridge, Tuning,
Zone Mapping) `background: #1a1a1a` (matches `--aurora-surface`) and full
padding on all four sides instead of just top/bottom, as a separate pill
that overhangs the normal content edge by 21px on each side (42px wider
overall than the canvas/buttons/etc. beneath it) -- the content itself
stays plain, unpanelled. Radius gets its own new dedicated token
(confirmed `8px`, not snapped to either existing `--aurora-radius-control`
6px or `--aurora-radius-panel` 12px) specifically so it can be tweaked
independently later without affecting either of those two.

**Entertainment configuration moves out of Zone Mapping, into Bridge.**
Today it sits in the top tier, between the zone canvas/selected-row and the
Auto-arrange zones button. In the new pass it's gone from Zone Mapping
entirely and reappears inside the Bridge accordion, directly under "Change
bridge" and above the per-zone active-toggle list.

**Auto-arrange zones moves to the top of Zone Mapping, and becomes a
centered, content-hugging button** -- not a full-width bar. Today it sits
near the bottom of the section (grouped with the Active toggle). In the new
pass it's the first thing in the accordion's content, above the canvas,
centered in the row rather than stretched edge to edge.

**"See all zones →" moves from a standalone line at the bottom of the
section up to sit directly above the Zone dropdown**, grouped with the
"Zone" label on the same line -- not a separate column, one combined label
row sitting above one dropdown that still spans the full column width.

**Zone / Active / Gamma become one three-column row instead of two rows.**
Today: Zone dropdown + Gamma slider share one flex row (`.zm-selected-row`),
and Active sits separately below in its own field, after Auto-arrange.
In the new pass all three are columns in a single row, with:
- all three labels ("Zone" + "See all →", "Active", "Gamma" + its "0.0"
  value) sharing one horizontal baseline, and
- a shared 35px-tall control band beneath the labels, inside which every
  control is vertically centered rather than sitting at its own natural
  height.

Below 480px, the three columns just stack (confirmed) -- same fallback
convention every other multi-item row in this app already uses
(`.zm-selected-row`, `.oc-actions`, `.md-actions`), no special-casing needed
for this one.

**The dropdown sets the band height (35px); every toggle switch app-wide
shrinks to match the slider, not just this one.** The Zone dropdown is
35px tall and is the tallest element in the row, which is what defines the
band. `.toggle-switch` shrinks from today's real 42x24px down to 35x20px
(`2.5_Pass/Dashboard_Expanded.css`'s `.frame .background`) -- the height
specifically to match a slider's own ~20px visual height (thumb included,
not just the 6px track), with the width shrinking proportionally as part
of that same resize, not a separately-decided change. This isn't scoped to
just the Zone-Mapping row's Active toggle -- it applies to every
`.toggle-switch` in the app: Bridge's per-zone toggle list and Tuning's
"Use fixed hue" checkbox both reuse the same class today and shrink along
with it.

### Zone Mapping layout, before/after

```
BEFORE -- shipped today                        AFTER -- 2.5 pass
================================                ================================
┌─ ZONE MAPPING (accordion) ─────┐             ┌─ ZONE MAPPING (accordion) ──────────┐
│                                 │             │            ┌─────────────────┐      │
│ ┌─ Canvas (SVG + zone tags) ──┐ │             │            │ Auto-arrange    │      │
│ │                             │ │             │            │ zones           │      │
│ └─────────────────────────────┘ │             │            └─────────────────┘      │
│                                 │             │                                     │
│ ┌─Zone ▾──────┐ ┌─Gamma slider┐│             │ ┌─ Canvas (SVG + zone tags) ────────┐ │
│ │(side by side)│ │             ││             │ │                                   │ │
│ └──────────────┘ └─────────────┘│             │ └───────────────────────────────────┘ │
│                                 │             │                                     │
│ ┌─ Entertainment config ▾ ────┐ │  (moves to  │  Zone   "See all →"  Active  Gamma "0.0"│
│ └─────────────────────────────┘ │   Bridge)   │ ┌────────────────┐ ┌──────┐ ┌───────┐  │
│ ┌─ Auto-arrange zones ────────┐ │             │ │  Zone 0  ▾     │ │ toggle│ │ slider│  │
│ └─────────────────────────────┘ │             │ │  (35px, sets   │ │ (20px)│ │(~20px)│  │
│ ┌─ Active toggle ─────────────┐ │             │ │  the band ht.) │ └──────┘ └───────┘  │
│ └─────────────────────────────┘ │             │ └────────────────┘  all centered in    │
│                                 │             │                     the 35px band       │
│ "See all zones →" (own line) ──┼─┘             └─────────────────────────────────────┘
└─────────────────────────────────┘
```

### Zone Mapping canvas styling

Confirmed by comparing two real screenshots of the canvas (not the corrupted
`2.5_Pass` export), one of the shipped app and one of the new pass:

**Zone-number badges are gone entirely.** Today, every zone's number sits
inside a small dark pill (`.zm-zone-tag`'s real `background:
var(--aurora-scrim)`, `border-radius: var(--aurora-radius-badge)`) --
selected or not. The new pass drops the badge for every zone; the number is
just plain text on the canvas background.

**The selected zone's own number goes bold.** No badge either way now, but
the selected zone's digit renders bold where every other zone's stays
regular weight -- the one remaining visual distinction for "this is the
selected zone" on the number itself.

**The size label is removed.** Today, `.zm-size-label` shows the selected
zone's dimensions as text (e.g. "33.3% x 50%") floating above it. The new
pass drops this entirely -- the selected zone's white outline/handles are
the only feedback on its size and position now.

**Selected zone's outline and handles go from grey to white.** Today,
`.zm-zone-rect.selected`'s `stroke` and `.zm-handle`'s `background` both use
`var(--aurora-accent)` (`#8b8b8b`) -- just a thicker version of the same
grey the unselected zones' dividers use. The new pass makes both pure white
(`var(--aurora-text-primary)`) instead, so the selected zone's outline reads
as a distinct color, not just a thicker one.

**Drag handles and slider thumbs become solid circles, matching
RockyRoad's real Play-scene scrub bar thumb exactly** (`RockyRoad/v2/
desktop.html:518-523`, `.seek-thumb`):

```css
.seek-thumb {
  width: 20px; height: 20px;
  background: #dadada; border-radius: 50%;
}
```

One flat fill, no border ring. Aurora's current `.zm-handle` is two-tone at
14px (`background: var(--aurora-accent)` + `border: 1px solid
var(--aurora-text-primary)`) -- the new pass drops the ring entirely in
favor of the flat fill, staying 14px (confirmed -- a size bump to 20px
would make handles overlap each other and clip against
`.zm-canvas-wrap`'s `overflow: hidden` edge for zones near
`MIN_RECT_SIZE`, so only the color/ring change carries over here, not the
slider-thumb resize below). `#dadada` isn't a new color either: it's
Aurora's existing `--aurora-button-light` token, already used for
`.btn-primary`/`.segmented-btn.active`.

This applies to two different kinds of control, with different real
implementation cost:
- **Zone canvas handles** (`.zm-handle`) are plain custom `<div>`s -- a
  direct CSS value swap.
- **Slider thumbs** (Gamma, every Tuning slider) are native
  `<input type="range">` elements, currently styled only via `accent-color:
  var(--aurora-accent)`. `accent-color` can tint the browser's native thumb
  but can't force an exact flat-circle-no-ring shape consistently across
  browsers -- matching `.seek-thumb` exactly needs
  `::-webkit-slider-thumb`/`::-moz-range-thumb` overrides instead.

## Not yet reviewed

Only `Dashboard_Expanded` has been compared screen a-vs-b so far. The other
`2.5_Pass`/`2_Pass` screen pairs (NUX Welcome, Hue Bridge, Entertainment,
Capture Source, Zone Mapping's own onboarding screen, Dashboard_Collapsed)
haven't been diffed yet.

The "Zone Mapping canvas styling" diffs above are confirmed as general
intent, not Dashboard-specific -- they apply to `ZoneCanvas`/`.zm-*`, which
Zone Mapping's own onboarding screen also uses. That screen's *layout*
(not just canvas styling) still hasn't been compared and remains part of
the unreviewed set above.

## Scoping + sequencing

One line per step, on purpose -- verification/findings once building starts
go to `WebUI_Fixes.md`'s Pass 2 section (or a new Pass 2.5 section there),
not inline here. Each phase should leave the app in a working state before
the next one starts.

### In scope

Every confirmed diff above, scoped to `Dashboard_Expanded` only: the top
bar (Running removed, Stop relocated, Aurora resized), the accordion
header pill (new radius token, overhang), Entertainment config's move into
Bridge, Auto-arrange's move to the top of Zone Mapping, "See all zones →"
regrouping with the Zone label, the Zone/Active/Gamma three-column row
(plus its <480px stacked fallback), the app-wide toggle-switch resize, and
the Zone Mapping canvas's visual refresh (no badges, bold selected number,
no size label, white selected outline, solid 20px handles/slider thumbs).

### Out of scope

The other five `2.5_Pass` screens not yet diffed against their `2_Pass`
counterparts (NUX Welcome, Hue Bridge, Entertainment, Capture Source, Zone
Mapping's own onboarding *layout*, Dashboard_Collapsed) -- separate
follow-up passes once each is actually compared, not assumed from this
one. The Video/Audio mode-toggle button styling and the zone-rect stroke
*width* (7px vs. today's 1px) -- both still unconfirmed/likely export
artifacts, not touched this pass. Any backend/C++ change -- this pass is
entirely `Aurora-WebUI` frontend (CSS + a small amount of JS), no new API
surface needed anywhere in it.

### Phase A -- shared primitives (tokens + classes several later phases depend on)

1. New `--aurora-radius-accordion: 8px` token in `tokens.css`, kept separate
   from `--aurora-radius-control`/`--aurora-radius-panel` on purpose.
2. `.accordion-header` restyle: `background: var(--aurora-surface)`,
   `border-radius: var(--aurora-radius-accordion)`, and horizontal padding +
   a matching negative `margin-inline` so it overhangs the content column by
   21px each side (`.accordion-header` has zero horizontal padding today --
   the token alone doesn't get applied anywhere without this). Also needs an
   `overflow-x: hidden` guard added somewhere sane (`body` or
   `#screen-container`) -- the content column's own side gutter
   (`--aurora-space-6`, 16px) is narrower than the 21px overhang, so the pill
   would otherwise push past the real viewport edge on narrow widths.
3. `.toggle-switch`/`.toggle-knob` resize 42x24 -> 35x20 -- one shared class,
   so Bridge's per-zone list, Tuning's fixed-hue checkbox, and Zone
   Mapping's Active toggle all pick it up with no per-consumer changes.
   `.toggle-knob::after`'s three hardcoded values (`top`/`left: 3px`, `18px`
   circle, `translateX(18px)`) are sized for the old box and have to move
   together: padding ~2px, circle 20 - 2x2 = 16px, travel 35 - 16 - 2x2 =
   15px.
4. `.zm-handle` restyle: drop the `border` ring, flat `#dadada` fill,
   size unchanged at 14px.
5. `.slider-input` thumb restyle to match (`::-webkit-slider-thumb`/
   `::-moz-range-thumb`, `#dadada`, 20px, no ring) -- one shared class
   already covers Gamma and every Tuning slider. Needs `-webkit-appearance:
   none` set on the `::-webkit-slider-thumb` pseudo-element itself, or some
   Chromium versions silently ignore the custom thumb styling.
6. `.zm-zone-rect.selected`'s `stroke`: `var(--aurora-accent)` ->
   `var(--aurora-text-primary)`.

*Testing:* visual check only -- pure style/size changes, no rendering-logic
touched yet.

### Phase B -- Zone Mapping canvas drawing logic (`ZoneCanvas.js`)

7. Stop rendering `.zm-zone-tag` badges entirely; the zone number becomes
   plain text on the canvas.
8. Add a bold-weight class to the selected zone's number specifically.
9. Stop rendering `.zm-size-label` (no more "33.3% x 50%" text).

*Testing:* live check in a real browser -- this changes `ZoneCanvas.js`'s
actual DOM-generation logic, not just CSS.

### Phase C -- Zone Mapping / Bridge structural reordering (moving existing pieces, no new layout yet)

10. Move "Auto-arrange zones" to the top of Zone Mapping's accordion content,
    above the canvas; restyle from full-width to centered/content-hugging.
11. Move `EntertainmentConfigSelect`'s mount point out of Zone Mapping's top
    tier into the Bridge accordion's content, under "Change bridge."
12. Move "See all zones →" to sit grouped with the "Zone" label, above the
    Zone dropdown, instead of standing alone at the bottom. Needs a new
    optional `onSeeAllZones` callback on `ZoneCanvas`'s constructor
    (rendered next to its own "Zone" label, only when passed), not a plain
    markup move -- today's `#db-see-all-zones` is wired once by Dashboard
    because it lives outside `ZoneCanvas`'s own DOM, but
    `_renderSelectedRow()` tears down and rebuilds that row on every zone
    selection, so a moved-but-not-rewired button would go dead after the
    first zone switch.

*Testing:* live check that Entertainment config still switches
configs/reloads zones correctly from its new mount point -- its own
`onChange`/`load()` contract doesn't change, only where it's mounted. Also
check "See all zones" still works after selecting a different zone, not
just on first render.

### Phase D -- Zone/Active/Gamma row rebuild

13. Replace `.zm-selected-row`'s two-item flex row plus the separate Active
    field with one three-column row (Zone / Active / Gamma), shared label
    baseline, 35px control band. Zone + Gamma already render inside
    `ZoneCanvas._renderSelectedRow()`; Active is currently a separate
    sibling Dashboard renders itself. Give `ZoneCanvas` a new opt-in
    constructor flag (default off) to render Active as its own middle
    column, reusing its existing `_queue` for the PUT -- opt-in specifically
    so the onboarding Zone Mapping screen (out of scope this pass, shares
    the same component) doesn't pick up the change too. Reordering
    `_selectZone()`'s `onSelect()`/`_render()` call isn't enough on its own:
    it fixes today's callback-ordering race but doesn't get three real flex
    children into one row unless Active's markup actually lives inside
    `ZoneCanvas`'s own re-rendered subtree.
14. Confirm the Zone dropdown actually lands at 35px tall once Phase A's
    sizing changes are in, adjusting its own padding if it doesn't.
15. Add the <480px stacked fallback.

*Testing:* live check at both desktop and <480px widths -- the biggest
structural layout change in this pass. Also re-check that changing the
selected zone (canvas click, tag click, dropdown) still updates Active
correctly now that it renders inside ZoneCanvas.

### Phase E -- Top bar

16. Remove `.status-pill` "Running" from the top bar.
17. Move the Stop button from `.db-controls-row` into the top bar's
    trailing slot. `renderTopBar` (`topBar.js`) needs a new optional param
    (e.g. `trailingButton: { label, onClick }`), wired the same way
    `onBack` already is -- it's shared by every screen, so this is a small
    shared-component change, not just a markup move. Dashboard's own call
    moves from `_renderControls()` to `_loadAll()`, passing
    `_openStopConfirm` as the callback.
18. Once Stop is gone from `.db-controls-row`, skip rendering `.db-controls`
    entirely when `!this.hasAudio` -- otherwise audio-disabled builds are
    left with an empty placeholder `<span>` and its own margin, with
    nothing in the row.
19. `.top-bar-title` font-size 16px -> 20px.

*Testing:* live check that Stop's click behavior is unchanged from its new
location, and that a mode switch (which re-renders the top bar via
`_loadAll()`) doesn't lose the Stop button.

## NUX Polish Pass

Confirmed against a screenshot of the user's touched-up Figma frames --
the export pipeline produced unusable HTML again (generic `frame`/`debug`/
`group` wrapper divs, the same class of corruption already documented above
for `2.5_Pass`), so this pass works from the visual reference directly plus
the user's own explicit call-outs, not a parsed export.

**Frame sizing/tokens check out against RockyRoad's own values.** 400x300
frame size, 12px radius, `#0a0a0a` background, `#333333` secondary-button
background all match `RockyRoad/v2/ui/v0.2.2/XR_Play.html`'s `.frame`/
`.button` rules exactly -- confirmed consistent with Aurora's already-
adopted tokens (`--aurora-bg`, `--aurora-button-dark`), not new values.

**All four frames (Welcome, Connect to your Hue Bridge, Choose your
lights, Capture Source) are a visual refresh of already-built screens,
1:1 -- not new screens.** Titles match exactly: `WelcomeScreen.js`,
`OutputConnectScreen.js`, `EntertainmentZoneSelectScreen.js`,
`ModeDeviceScreen.js`. Every element shown already exists as a real built
component: `EntertainmentConfigSelect`'s dropdown, `ChannelList`'s plain
"Zone N (light names)" list (already an exact format match, not just
conceptually similar -- see `ChannelList.js`'s `_channelLabel`), the
Video/Audio `.segmented` toggle, the `.field-label` + dropdown pattern.

**Back(bottom-left)/Continue(bottom-right) is already the real structure
for all four -- via `NavFooter.js`, not a new pattern.** Its own doc
comment confirms it: it *replaced* an earlier top-bar-back-arrow approach
for exactly this inconsistency reason. All four screens already call
`renderNavFooter`, with each screen's own `renderTopBar` call passing
`showBack: false` -- confirmed by reading each screen file, not assumed.
**However, `.nav-footer` currently has zero CSS** (grepped across every
stylesheet, no match at all) -- unstyled today, not merely untweaked. Real
build work here, not a small correction.

**Zone Mapping (onboarding) is the one real structural outlier, exactly as
flagged.** Today it renders Back in the top bar
(`renderTopBar({ showBack: this.showBack, onBack })`) and a lone `Save`
button via its own bespoke `.zm-actions` markup -- no `NavFooter` at all.
Bringing it in line means: drop the top bar's `showBack`/`onBack`, remove
`.zm-actions`' own Save button, and mount `NavFooter` instead (Back ->
`onBack`, Continue -> whatever `Save`'s click handler currently does, i.e.
`onComplete()`).

**Welcome/Hue-Bridge's primary+secondary text pairing: 2px gap, stated
explicitly by the user, not derived from the screenshot.** "Welcome to
Aurora" (primary) + "Let's get you setup" (secondary) on frame 60, same
pairing/gap on frame 61's "Press the button on your bridge" + "then
Continue."

**Back/Continue spacing+sizing maps to the real, shared `.frame .actions`
bar** (`RockyRoad/v2/ui/v0.2.2/panel.css`, the actual reusable panel
component behind both the Play and Song XR-panel exports -- not the
`BeforeExport/Desktop/Song.html` draft, which predates this shared
component and was a dead end):

```css
.frame .actions {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  padding: 0 10px 10px 10px;
}

.frame .actions .button {
  width: 150px; height: 36px;
  padding: 8px; border-radius: 5px;
  font-size: 13px; font-weight: 400;
}

.button.primary-dark  { background: #333333; color: #ffffff; } /* secondary */
.button.primary-light { background: #dadada; color: #111111; } /* primary */
```

This corrects the row layout from what `NavFooter.js`'s own doc comment
describes ("Back (bottom-left) / Continue (bottom-right)", implying
`space-between`) -- the real reference **centers** the pair with a fixed
**10px gap**, not edge-to-edge. Button size (150x36, 8px padding, 5px
radius) matches what was already found at the standalone "🔄 Reposition"
button; this shared rule is the more authoritative source since it's the
actual reusable component, not a one-off duplicate. Font-size rounds to
Aurora's existing 14px same as before. Colors need no change at all --
`primary-dark`/`primary-light`'s exact values are already Aurora's
`--aurora-button-dark`+white-text (`.btn-secondary`) and
`--aurora-button-light`+dark-text (`.btn-primary`), respectively, so Back
(secondary) and Continue (primary) can reuse the existing classes as-is
for color. The one genuinely new value for `.nav-footer` itself is the
**150px button width + centered layout + 10px gap** -- `NavFooter.js`'s
own markup (which button is Back vs. Continue) doesn't need to change,
only its currently-nonexistent CSS.

**Back also gets RockyRoad's real `back-arrow.svg`, not a plain text
label.** Confirmed asset (`RockyRoad/v2/public/back-arrow.svg`, 32x32
viewBox, single white-filled path -- same shape/export family as the
chevron-down/up and power icons already adopted in Aurora-WebUI's own
`icons/`), used across RockyRoad's real XR screens (`play.uikitml`,
`song.uikitml`, `settings.uikitml`, `calibration.uikitml`) for their own
"Library" back button, always icon-first: `<img class="icon"> <span>
Library</span>`. Same treatment for Aurora's own Back: `back-arrow.svg` +
"Back" text, replacing `NavFooter.js`'s current plain-text button --
consistent with already swapping the dropdown/accordion chevrons and the
Stop button's icon in for text/glyphs earlier this pass.

**"Wrong Bridge?" / "Change address" stays always-visible -- decided.**
Confirmed unconditional in the current code (`_renderPairing`, line 158;
not gated on the `_autoAdvance()` bridge-count logic at lines 204-226 the
user recalled, which governs a different, earlier decision -- whether
`_autoAdvance()` skips straight to `pairing` or falls back to the `entry`
address form). Keeping it matches the code's own existing rationale
comment (lines 24-28): a safety net for "checking" having been wrongly
confident even in the single-bridge auto-advance case.

**"Wrong Bridge?" moves from a body-level text link into `NavFooter`'s own
left slot, next to Continue -- matching the mockup's matched-weight button
pair, not today's link+button split.** Today's `_renderPairing` renders
this as a loose `<button class="btn btn-link">` labeled "Change address"
in the body, while `NavFooter` alongside it only shows a lone Continue
(`showBack: false`). The mockup shows "Wrong Bridge?" and "Continue" as one
pair of equal-weight buttons. `NavFooter.js`'s left button label is
hardcoded to `"Back"` today with no override (unlike `continueLabel`,
which already is one) -- needs a symmetric `backLabel = 'Back'` param so
`_renderPairing` can pass `showBack: true, backLabel: 'Wrong Bridge?'`
(copy confirmed -- replaces "Change address" everywhere it's user-facing;
the underlying handler/id can keep its existing internal name) while
reusing the exact same button/position/icon treatment `NavFooter` gets
everywhere else. The existing "no Back during pairing" code comment (lines
166-169) stays *correct* -- there's still no literal "abandon and leave
this screen" affordance -- but needs a small update once this ships so a
future reader isn't confused by a button appearing there.

**Dead CSS found while reviewing this screen, unrelated to the visual
pass but worth clearing out while in here:** `output-connect.css`'s
`.oc-actions` rule (plus its `<480px` media query) matches nothing in the
current DOM -- grepped `OutputConnectScreen.js`, no `oc-actions` anywhere.
Leftover from before this screen was refactored onto `NavFooter.js`; the
rule's own comment even describes the pre-refactor behavior ("the pairing
phase's holds two [buttons]") that no longer applies.

**The `entry` phase's own address-field layout gets the same label+control
convention as every other screen in this pass, fixing a long-standing
spacing complaint.** Today "Bridge address" sits in its own `.field`,
separate from the input's `.field`, with `.oc-address-row`'s
`margin-top: var(--aurora-space-4)` (10px) standing in for a real label-to-
control gap. Every other pairing in this pass (Entertainment configuration
-> dropdown, "Connected to" -> "Change bridge") uses `.field`'s own built-in
4px gap (`--aurora-space-1`) by keeping label and control inside one
`.field` -- this screen never got that treatment. Fix: merge the label into
the input's own `.field`:

```html
<div class="oc-address-row">
  <div class="field">
    <label class="field-label" for="oc-address-input">Bridge address</label>
    <input id="oc-address-input" ... />
  </div>
  <button ...>Autodetect</button>
</div>
```

Autodetect stays a flex sibling in the row (`align-items: flex-end` still
bottom-aligns it with the input, unchanged); `.oc-address-row`'s own
`margin-top` becomes dead weight once the label moves inside and should
come out with it.

**The `entry` phase's own Continue button needs no label change -- already
"Continue"** (confirmed: none of `OutputConnectScreen.js`'s three
`renderNavFooter` calls pass a custom `continueLabel`, so all three phases
already use the default). It only needs the same footer *styling* work as
every other screen -- 150x36, centered, 10px gap, `.btn-primary` color
already matching -- which it inherits automatically once `NavFooter.js`'s
CSS exists, no screen-specific change beyond the address-field fix above.

**Zone Mapping's own Continue should say "Finish," not "Continue."** Same
mechanism as the rest -- `NavFooter`'s existing `continueLabel` override
(already used for exactly this kind of per-screen wording), just passed as
`continueLabel: 'Finish'` when Zone Mapping mounts `NavFooter` (see the
Zone Mapping outlier note above) -- it's the last step in the onboarding
sequence, not one more "Continue" into another step.

### Open items before Phase work starts on this pass

- "Choose your lights" and "Capture Source"'s own exact spacing deltas from
  what's built today haven't been diffed number-by-number yet -- only
  structurally confirmed as already matching in shape/components.
- Zone Mapping onboarding's own screen-specific spacing/sizing against the
  new frame set, beyond the Back/Continue/NavFooter swap covered here.

### Scoping + sequencing

#### Phase A -- shared primitives (multiple screens depend on these; nothing screen-specific yet)

1. `.nav-footer` CSS from scratch (currently zero CSS anywhere):
   `display: flex; justify-content: center; align-items: center; gap: 10px`,
   plus a sizing rule putting `.nav-footer-back`/`.nav-footer-continue` at
   150x36. Colors need no new rule -- `.btn-primary`/`.btn-secondary`
   already match RockyRoad's `primary-light`/`primary-dark` exactly.
2. Add `back-arrow.svg` to `icons/`; `NavFooter.js`'s Back button renders it
   (icon + "Back" text) -- same `<img>`-swap pattern already used for
   Stop's power icon and the dropdown/accordion chevrons.
3. `NavFooter.js` gains a `backLabel = 'Back'` param, mirroring the
   existing `continueLabel` -- purely additive, every current caller keeps
   working unchanged with the default.
4. New shared primary/secondary text-pair pattern (2px gap), needed by both
   Welcome and OutputConnect's pairing phase. RockyRoad's own
   `.text-primary`/`.text-secondary` (`panel.css`) map directly onto
   Aurora's existing `--aurora-text-primary`/`--aurora-text-secondary`
   tokens -- a new shared class pair, not new colors.

*Testing:* load all 5 onboarding screens (Welcome, OutputConnect x3 phases,
Choose your lights, Capture Source), not just the ones discussed this
pass -- confirm Back/Continue still render and click correctly everywhere,
since this CSS lands under every one of them at once, including the two
screens not yet individually diffed.

#### Phase B -- OutputConnectScreen + WelcomeScreen (the screens actually reviewed this pass)

5. `_renderEntry`: merge "Bridge address" label into the input's own
   `.field`; drop `.oc-address-row`'s now-dead `margin-top`; delete the
   stale `.oc-actions` rule (and its media query) from `output-connect.css`
   -- matches nothing in the current DOM, confirmed by grep.
6. `_renderPairing`: split the combined message into the new primary/
   secondary text pair; move "Wrong Bridge?" (label confirmed, was "Change
   address") into `NavFooter`'s `backLabel` slot (`showBack: true`), delete
   the old `.btn-link` markup and its click listener; update the "no Back
   during pairing" code comment (lines 166-169) to reflect what's actually
   there now.
7. `WelcomeScreen`: same text-pair split for "Welcome to Aurora" / "let's
   get you set up."

*Testing:* live check both screens -- text pairing renders with the 2px
gap, "Wrong Bridge?" still resets to the entry phase correctly, entry-
phase spacing looks right at desktop and <480px.

#### Phase C -- Zone Mapping's NavFooter swap

8. Add a `.nav-footer-slot` to `mount()`'s own container markup -- it has
   none today (`top-bar-slot` + `zm-body` only, unlike every other
   onboarding screen's three-slot template), confirmed by reading `mount()`
   directly. Easy to undercount if this phase is framed as just "swap Save
   for NavFooter."
9. Drop the top bar's `showBack`/`onBack`; remove `.zm-actions`' own Save
   button/markup.
10. Mount `NavFooter` (Back -> `onBack`, Continue -> `onComplete`,
    `continueLabel: 'Finish'`).

*Testing:* live check Back/Finish both work; confirm the non-onboarding
path (still `.zm-actions` + Save, untouched by this pass) still renders
correctly.

### Sniff test (run against the sequencing above before building)

- **Phase A's CSS isn't scoped to reviewed screens.** `.nav-footer` is one
  shared component under all 5 onboarding screens, including "Choose your
  lights"/"Capture Source," which this doc's own "Not yet reviewed"
  section still lists as undiffed. Landing Phase A changes their footer
  layout too, sight-unseen -- not a blocker, but Phase A's testing above
  explicitly includes those two screens for exactly this reason, not just
  the ones discussed in conversation.
- **Zone Mapping's `mount()` has no `.nav-footer-slot` at all today** --
  the one real scope gap a naive "drop Save, mount NavFooter" framing would
  miss. Called out as its own numbered step (Phase C, #8) rather than
  folded silently into #9-10.
- **Watch, don't fix now:** `continueLabel`/`backLabel` get their first
  real non-default uses in this pass ("Finish," "Wrong Bridge?"). Low risk
  (simple string substitution into existing markup), but worth an explicit
  visual check that a longer label doesn't overflow the fixed 150px button
  width -- "Wrong Bridge?" in particular is noticeably longer than "Back."
