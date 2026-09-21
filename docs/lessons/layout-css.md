# Layout and CSS

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
