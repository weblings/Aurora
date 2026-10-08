# Layout and CSS

Id: lesson-layout-css

Responsive layout, pseudo-elements, flex, resets. See [README.md](README.md) for filing rules.

---

## A layout lesson learned in one constrained context doesn't transfer to another without checking the actual numbers
Tags: webui, layout, responsive
Applies-when: applying a layout lesson to a different constrained context

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

---

## A style built ahead of its first real consumer can drift from the very precedent it cites, and nothing catches that until something actually uses it
Tags: webui, css, drift
Applies-when: writing shared styles before their first use

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

---

## Overriding just a pseudo-element's own style, without resetting its host's native rendering mode, can be silently ignored entirely
Tags: webui, css, slider
Applies-when: styling pseudo-elements like the slider thumb

The 2.5 pass's slider-thumb restyle added `.slider-input::-webkit-slider-
thumb { -webkit-appearance: none; width: 20px; ...; background: #dadada; }`
alongside the existing `.slider-input { accent-color: ...; }` -- and a
zoomed screenshot during that phase's own verification showed a plausible
flat gray circle, read as confirmation the override worked. It never did:
Chrome only honors a `::-webkit-slider-thumb` override once the *input's
own* `-webkit-appearance` is also reset away from `slider-horizontal`
(accent-color needs that native mode to stay on), so overriding just the
thumb pseudo-element while the host keeps its native appearance leaves
Chrome silently rendering its own native thumb, ignoring the override
completely -- confirmed by isolating the exact rule in a minimal side-by-
side test page. The screenshot "worked" only because the native
accent-color thumb is *already* a flat, ring-free gray circle, coincidentally
close enough to the intended look that a glance didn't catch the color
(`#8b8b8b` native vs. the intended `#dadada`) was wrong the whole time.

**Fix (first pass):** reverted to plain `accent-color` -- it already rendered
a solid, ring-free thumb, so no override was needed for *that* ask. General
principle: a `::-pseudo-element` override is not guaranteed to apply just
because the selector is valid -- for any native form control with its own
"appearance" rendering mode (range/checkbox/radio thumbs, `<select>`
internals), check whether the *host* element's own appearance needs
resetting too, not just the part being restyled. And when a screenshot check
"confirms" a color change, compare the actual rendered value against the
specific token intended, not just the general shape -- two different grays
can look interchangeable at a glance.

**Later revisited:** a real ask arrived for a thumb color genuinely
different from the track's own accent-color fill (matching Zone Mapping's
white handles) -- and `accent-color` can't do that; it's one color for both
thumb and fill, no independent override. The fix that time was the full
reset this entry warns about, done deliberately: `-webkit-appearance: none`
on the host *and* the thumb, plus a hand-built fill (Chromium has no native
"already filled" track pseudo-element, so a `--slider-percent` custom
property set on `input` events paints a hard-color-stop gradient on
`::-webkit-slider-runnable-track`; Firefox's own `::-moz-range-progress`
needs no such workaround). Verified against the pre-change native rendering
pixel-by-pixel (track height/radius/fill color measured and carried over
exactly) rather than by eye, precisely because of this entry's own "a
screenshot glance isn't verification" lesson.

---

---

## Scoped resets don't cover the scope's own container
Tags: webui, css
Applies-when: writing scoped CSS resets

The demo's `.db-port * { box-sizing: border-box }` reset never reaches
`#dashboard-pane` -- the scope root's parent -- so the pane stayed
content-box and its 16px side padding added outside `width: 100%` in
portrait. The pane ran 32px past the viewport while `body { overflow:
hidden }` clipped it, which read as "right padding missing, left fine"
with no overflowing descendant and no scrollbar to blame.

**Fix:** declare `box-sizing` on the pane itself (demo-layout.css), and
when one-sided padding loss has no spiller, compare pane width against
the viewport (`paneW > vw`) before hunting descendants.

---

---

## Flex-shrink only saves the main axis
Tags: webui, css, flex
Applies-when: debugging flex overflow on the cross axis

The same 32px overflow was invisible in landscape -- row-axis flex-shrink
absorbed it -- and fatal in portrait, where cross sizes don't shrink.
"Works in landscape, broken in portrait" against symmetric CSS points at
the cross-axis box model, not at content or media queries.

**Fix:** treat landscape/portrait-only layout bugs as box-model suspects
first; content spillers would show in both orientations.

---

---

## First-match regexes lie on repeated selectors
Tags: webui, regex, css
Applies-when: matching repeated selectors with regex

A layout test matching `#dashboard-pane {` passed against the
aspect-ratio media-query block instead of the top-level rule carrying the
padding -- asserting the wrong block entirely.

**Fix:** match all blocks for a repeated selector and select by
distinguishing declaration (here: the block containing `padding`).

---

## A wider-than-column design needs nested gutters -- one gutter always clips
Tags: webui, css, responsive
Applies-when: full-bleed pills/rows touch screen edges on narrow viewports

Accordion pills and the dashboard top bar overhang the content column 21px
a side against a 16px page gutter. It fits only while the centering margin
covers the 5px excess: (vw-640)/2 >= 5, i.e. vw >= 650 -- below that the
design clips at every width, just most visibly at 292px. The demo never
showed it because its pane padding nests outside the ported container's own
gutter; the app has only the one gutter.

**Fix:** derive the breakpoint from the box model (640 + 2x16 + 2x5 = 650)
and scale the overhang back inside the single gutter below it (6px/side
leaves 10px breathing, matching the top bar's own top padding) instead of
copying the demo's nesting, which has no counterpart in the app.

---

## A symptom naming one element can have two owners -- grep the design value
Tags: webui, css, debugging
Applies-when: fixing an overhang/bleed reported on one element

"Accordions touch the edges" was also the Stop button: the top bar spans
the same 21px/42px overhang so the button sits flush with the pills' edge,
borrowing the accordion width rules. Fixing only `.accordion-header` would
have left the button on the edges.

**Fix:** when a literal design value causes the bug, grep the value, not
the selector -- every rule sharing the value shares the bug and the fix.
---

## On iOS every browser is WebKit -- a "works in Firefox" report is engine-ambiguous until the platform is known
Tags: webui, css, webkit, ios
Applies-when: verifying a WebKit- or Gecko-specific rendering fix, or triaging a mobile browser bug report

The 5jj slider misalignment reproduced in Firefox on iOS but desktop Firefox never showed it: iOS forces every browser through WKWebView, so iOS Firefox reads ::-webkit-slider-thumb and ignores ::-moz-range-thumb entirely, while desktop Firefox (Gecko) centers range thumbs natively. "Works on desktop" had verified the wrong engine.

**Fix:** triage and verify by rendering engine on the reporting platform, not by brand -- desktop Safari or Playwright-WebKit proxies iOS WebKit; desktop Firefox proves nothing about it. Name the engine in the task, not just the browser.

---

## A heading-only overlay's spacing rules assume nothing follows the heading
Tags: webui, css, overlay
Applies-when: adding body copy or buttons to an overlay panel that renders a bare heading today

forms.css's `.overlay-panel h2:last-child` zeroes the heading's bottom margin and centers it, written explicitly for the post-stop dead-end screen -- and button top-margin lives on the `.overlay-actions` wrapper, not the button. ewyz appended bare buttons (plus a paragraph) to that panel, so the heading kept full margin, the text added its own, and the button sat flush with zero gap: uneven spacing with no rule violated on its face.

**Fix:** keep the overlay's content contract, or wrap buttons in `.overlay-actions`. Before appending a sibling to a bare heading, check for `:last-child`/`:only-child` rules that assumed it was alone.

---

## `position: sticky` needs a tall parent AND no scroll-container ancestor -- jsdom sees neither
Tags: webui, css, sticky, jsdom, banner
Applies-when: pinning an element to the top of the page with `position: sticky`, or auditing one whose node tests pass

Aurora-cj11's shell banner passed every node test and never stuck. Two independent causes, both found only by scrolling in a real browser (headless Chromium, 3000px of injected content, banner top read back after `scrollTop = 1500`: it was -1500). (1) `.shell-banner` was the sticky element but its parent `#shell-banner-slot` was exactly as tall as it, and a sticky element can't leave its parent's box. (2) `body { overflow-x: hidden }` beside `html { overflow-y: scroll }` turns `body` into its own scroll container (a non-visible overflow on html stops the body's value propagating to the viewport), so sticky pinned to a body that never scrolls.

**Fix:** put `position: sticky` on a direct child of `body` that is as tall as the content it must stay over (here the slot itself), and use `overflow-x: clip`, which clips without creating a scroll container. Verify by scrolling a real page and reading `getBoundingClientRect().top`, at narrow and wide widths; jsdom does no layout.

---

## Giving a plain container a border/padding (or making it a flex item) can silently un-collapse a child's own top margin
Tags: webui, css, margin-collapse, flex, banner
Applies-when: adding a border, padding, or `display: flex` to an element whose child already carried its own `margin-top` for a different layout context

Aurora-x1lh (shell banner visual polish): `.status-text`'s `margin-top` (forms.css) assumes it follows some other element in normal flow, and previously got away with being the first/only child of `.shell-banner-row`, because that row had no border/padding of its own -- the child's margin collapsed straight through the parent and out into the row-to-row gap, landing as if it weren't there. Adding a border and padding to `.shell-banner-row` (for a bordered-card look) stopped that collapse (a border or padding on the parent blocks it), so the same margin started stacking on top of the row's own padding, pushing the text down past where an absolutely-positioned dismiss `x` was aligned -- read at first as "the x needs repositioning" when the actual text position had moved, not the x. Wrapping the row's content in a flex item (`.shell-banner-content`) for unrelated reasons (adaptive x alignment) didn't fix it either: a flex item is its own formatting-context root, which also blocks margin collapse from a child out through it.

**Fix:** when a container gains a border, padding, or becomes a flex/grid item, re-check whether any child's own margin was relying on collapsing through it -- `:first-child { margin-top: 0 }` (or auditing the child's margin's original assumption) on the new container, rather than chasing the symptom on an unrelated sibling element.

---

## Port the upstream value, not the fork's drifted one, when de-seaming scoped CSS
Tags: webui, css
Applies-when: moving a demo fork's scoped patch into scope-owned CSS so the vendored file needs no edit

Aurora-ifkn.2 absorbed the `shell-css-scope` seam (bare `*`/`html`/`body` rules rescoped under `.db-port`) into demo-owned `demo-layout.css`. The seam's frozen value was `overflow-x: hidden` on `.db-port`, but upstream's `body` rule has since moved to `overflow-x: clip` -- `hidden` beside a scroll container turns the element into a never-scrolling scroll container and a sticky banner pins to that instead of the real scroller (see the `position: sticky` entry in this file). Copying the seam verbatim would have perpetuated the breakage into every future re-vendor.

**Fix:** when absorbing a seam, diff it against current upstream first and port the current value, not the seam's frozen one; note the delta in the new block's comment so the next re-vendor doesn't "fix" it back.

---

## Moving a scoped reset into a later-loaded stylesheet raises its precedence -- wrap the scope in `:where()`
Tags: css, specificity, cascade, reset, vendor, demo
Applies-when: relocating a `*` reset (or any low-precedence base rule) into a different stylesheet, or scoping one under a class

Aurora-ifkn.2 moved the demo's `.db-port *` reset from the top of the vendored `shell.css` into `demo-layout.css`, which `index.html` loads last. `.db-port *` scores (0,1,0), the same as single-class component rules like `.segmented-btn`, so on equal specificity the later file won and zeroed every component's padding and margin: bare Video/Audio pills, no accordion chrome (Aurora-jwt7). In the app the reset is a bare `*` at (0,0,0), so it can never win. The byte-identity test, the layout test (which checked the reset's properties, not its precedence) and all node suites stayed green. A headless-Chrome screenshot next to one from the pre-refactor commit showed it at once.

**Fix:** `:where(.db-port) *` keeps the scope at zero specificity, so it behaves like `*` wherever the file loads. For any CSS move or rescope, compare a screenshot against the commit before the change. Rule-content tests don't see cascade order.

The same move also changed which box clips. The app's `body { overflow-x: clip }` clips at the window edge. Its demo stand-in on `.db-port` clipped at `#screen-container` itself, 5px inside the Dashboard's 21px overhang, which cut the top-right Pause button (Aurora-4jk4). When rescoping a page rule, put it on the element that plays the page's role, here the `#dashboard-pane` scroll container, not on the scope class.

---

## Font-metric math for inline-icon vertical alignment doesn't reliably beat eyeballing, even when the numbers check out
Tags: webui, css, icon, vertical-align, typography
Applies-when: sizing/positioning an inline icon (masked SVG, `<img>`) next to body text

Aurora-xrl1 replaced a bold `⚠` character with a masked SVG triangle
(`.warn-glyph`), starting at a 14x12px box with `vertical-align: -1px`
(matched the old glyph's rough footprint). Recalculating against Inter's
real cap-height at 13px (~9.5px) said the box should shrink to 12x10px --
and the top edge did land within half a pixel of a capital letter's actual
cap-height. It still looked wrong live: error copy is mostly lowercase
prose, and lowercase only reaches x-height (visibly shorter than cap-height),
so an icon sized to the one capital letter read as floating above the
lowercase bulk of the line. Recalculating again against x-height (~7px,
bottom on the baseline, no offset needed) was *more* theoretically
defensible -- and looked worse once rendered. The original, un-derived
14x12px/-1px box was the one that read as "good enough" after both
metric-driven revisions were tried and rejected live.

**Fix:** treat cap-height/x-height calculations as a starting hypothesis,
not a destination -- verify every iteration against the real rendered page
before treating the math as settled, and don't assume a later, more
rigorously-derived value is actually closer; it can read worse than the
value it replaced. For body text specifically, remember the icon sits next
to a mix of cap-height and x-height characters, not a pure sample of either,
so neither metric alone predicts the right box.

---

## A one-word last line in banner copy: `text-wrap: pretty` plus a non-breaking space in the line that must not orphan
Tags: css, typography, text-wrap, orphan, banner
Applies-when: a short message wraps with one word alone on its last line

Cutting a word fixed the Local Network banner at one width and not another: the break point moves with the window. `text-wrap: pretty` on `.shell-banner-content` makes supporting browsers rebalance the last lines at any width; browsers without it ignore the rule, so the specific line also joins its last two words with `&nbsp;` ("allow&nbsp;Aurora").

**Fix:** put `text-wrap: pretty` on the container, not on one message, so every banner row benefits; use `&nbsp;` only where an orphan must never happen.
