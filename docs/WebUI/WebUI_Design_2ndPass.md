# WebUI design, pass 2: accordion Dashboard + NUX redesign

Follow-up to `WebUI_Fixes.md`'s Pass 1 — specifically its "Menu redesign"
task. Bounded design doc: the full rationale for collapsing the Dashboard
into an accordion and redesigning the onboarding flow that leads into it,
worked out before any of it is built. Scoping + sequencing (the actual
build order) is a separate section below, kept short on purpose — see
`docs/lessons/engineering-hygiene.md`'s entry on build-log doc density
for why design rationale and an unbounded build log don't share one file
well. Once pass 2 actually ships, hands-on nits go to `WebUI_Fixes.md`'s
Pass 2 section, not back into this doc.

## Menu redesign: accordion Dashboard
Status: in progress (Aurora-x7o).

Follow-up to the "Menu redesign" task in `WebUI_Fixes.md`'s Pass 1 Open
tasks. Prompted by hands-on nits after the Zone Mapping work there shipped:
the Settings button does nothing on any page, Back/Forward availability is
inconsistent screen to screen, and the Dashboard duplicates its own
Video/Audio toggle inside Capture Source. Worked through as a design
discussion (not yet implemented) — captured here in full since it changes
what several existing screens are for, not just one bug.

**Settings button/modal: cut entirely.** `app.openSettings()` just un-hides
`#settings-overlay`, and `#settings-body` has always been empty
(`<!-- Empty for now -->` in `index.html`). huenicorn has no gear icon or
settings modal at all — its one "rare/global" affordance (Shut down) sits as
a plain visible button, and version info is a plain footer, not behind
anything. Matches the decision below to keep Stop visible rather than
tucking it away.

**Back-button confusion: not a sequencing bug.** Original nit: Back from
Capture Source during onboarding dropped back to Output Connect's blank
entry form, several steps earlier than expected, and continuing from there
silently re-ran real bridge pairing (demanding the physical link button
again). The chain's own Back semantics are already correct — literal
"previous screen in sequence," no skip-logic needed. The actual bug is that
`OutputConnectScreen.mount()` always renders its blank entry form regardless
of whether a connection is already saved. Fix (tracked in `WebUI_Fixes.md`'s
Back-button task): mount() checks saved state first and shows a "Connected
to `<address>` — Change bridge" status view instead. Once that's true, Back
naturally shows "what you already did there," matching that same task's own
resolution.

**Tabs vs. accordion — checked against `RockyRoadImport`, accordion wins.**
`RockyRoadImport/SongConverter`'s tab bar switches between three genuinely
independent, mutually-exclusive converters (Piano MIDI / Rocksmith 2014 /
Guitar Pro) — pick exactly one, the others' state doesn't matter meanwhile.
Aurora's Bridge/Capture/Zone/Tuning aren't alternatives, they're
simultaneously-true facets of one running pipeline, and the valuable
property worth keeping is glancing at all of their statuses at once
("Bridge — Connected", "Zones — 4 active") — a tab bar would throw that
away by only showing the selected tab's content. Also a real visual-overlap
risk if a tab bar were ever added: `forms.css` already ports its
section-divider styling from `RockyRoadImport`'s own `.tab-panel::before`,
and `.segmented-btn` (Aurora's real Video/Audio toggle) already uses the
same pill radius token `RockyRoadImport`'s `.tab-btn` uses — a real tab bar
styled the same way would sit uncomfortably close to a control that (unlike
a display-only tab) has real side effects (a live pipeline reload). Tabs
would fit a genuinely mutually-exclusive future choice (e.g. picking between
two different output brands, if a second one ever existed) — not this.

**huenicorn's own single page gives a real, evidenced priority ladder** —
checked directly against `huenicorn/webroot/index.html`, top to bottom:

```
1. Screen-partitioning canvas + gamma (biggest, first, no collapse)
2. Entertainment configuration <select>                (always visible)
3. Active / Inactive channel lists                       (always visible)
4. ▸ Advanced settings (subsample, interpolation,        (COLLAPSED —
     refresh rate, transition smoothing)                  the only one)
5. Save profile / Shut down                              (always visible)
6. Version info                                          (plain footer, no button)

Bridge pairing: not on this page at all -- a fully separate setup.html,
visited once, never linked back to afterward.
```

"Advanced settings" is, field for field, Aurora's own video-mode Tuning
screen (subsample width, interpolation, refresh rate, transition smoothing)
— independent validation that those four are the right ones to collapse.
No gear icon anywhere on huenicorn's page either.

**Capture Source folds away entirely.** Checked `ModeDeviceScreen.js`
directly: beyond its own (redundant, already-cut) Video/Audio toggle, it
has exactly one field — a monitor dropdown in video mode, a sink-name text
input in audio mode (Linux only; Windows shows no field at all, just static
text). That one field becomes a single top-tier slot that swaps in place
depending on mode, matching the screen's own existing
`_renderVideoDevice`/`_renderAudioDevice` dispatch — no new logic, just
relocated. Once that's done, "Capture Source" has no unique content left to
justify its own accordion section.

**Zone active/inactive: compact control up top, full list demoted to
Bridge.** The 7-item Zone Mapping plan in `WebUI_Fixes.md`'s Pass 1 added an
always-visible toggle row per zone below the canvas — revisited here because
in an accordion layout, a list that grows with zone count sitting directly
above a stack of one-line collapsed headers reads as lopsided (tall on top,
thin below). Resolved as two controls, not one: a single active-bool tied
to whichever zone the dropdown/canvas currently has selected (fixed height,
right where you're already looking while shape-editing — this was the
original pre-redesign idea, before the decoupled list was built), plus the
full per-zone list relocated into the Bridge section for the rare "what's
even in the mix" glance, reachable via a "See all zones →" link that expands
the Bridge accordion and scrolls it into view
(`element.scrollIntoView({behavior:'smooth', block:'start'})` — universally
supported, degrades to an instant jump on the rare browser without smooth
scroll, a non-issue for a LAN app opened in a current browser). Zone
mapping/gamma editing for Audio mode is explicitly out of scope for this
phase (a deliberate design decision, not a gap to track) even though
`AudioFrameCompositor::composeAudioFrame` does honor both `zone.active` and
`zone.gamma` today — `PipelineHost::listZones()`/`updateZone()` block reads
and writes outright whenever `m_isAudioMode` is true, so neither is
reachable from Audio mode regardless; not being pursued this round.

**Final structure: three named areas instead of four** — Zone Mapping
(video's top tier), Tuning (always fully collapsed, both modes — see below),
Bridge (collapsed either way: connection status, re-pair action, and the
full zone list). Entertainment config selection is mode-agnostic and stays
visible in both, matching huenicorn's own unconditional placement.

**Audio's top tier stays minimal — no promoted sliders.** Earlier drafts
promoted two "hot" Tuning sliders (labeled "Response speed"/"Brightness
smooth") into Audio mode's top tier, mirroring Zone Mapping's role for
video. Cut: those labels didn't even correspond to real fields ("Response
speed" is `TuningScreen.js`'s own section heading over three sliders, not a
slider itself), and which two fields would actually deserve promotion was
never settled. Simpler and just as good: Audio's top tier is device field +
entertainment config select only; every tuning slider, for both modes,
lives exclusively in the collapsed Tuning section. Revisit promoting
specific sliders later if it turns out to matter in practice.

**Switching Video/Audio on the live Dashboard collapses open accordions,
doesn't try to swap their content live.** `DashboardScreen._switchMode()`
already does a full re-render after every mode change — resetting each
`AccordionSection`'s expanded state to `false` as part of that same
re-render is one extra line, not new machinery. The alternative (keep a
section open and swap its content to the new mode's fields in place) would
need `AccordionSection` to react to mode state it doesn't own while already
open, real new cross-component synchronization for no real benefit.

### Video mode — accordions collapsed

```
┌──────────────────────────────────────┐
│ [Video]  [Audio]              [Stop] │
├──────────────────────────────────────┤
│ Monitor: [Auto (primary) ▾]          │  ← swapped-in device field
│                                       │
│  ┌─────────────────────────────────┐ │
│  │       Zone Mapping canvas        │ │
│  │   (drag rects + gamma slider)    │ │
│  └─────────────────────────────────┘ │
│  Entertainment config: [TV area ▾]   │
│  Zone: [Zone 3 (Floor Lamp) ▾]  ●    │  ← single active bool, current zone
│  See all zones →                     │  ← expands + scrolls to Bridge
├──────────────────────────────────────┤
│ ▸ Tuning                             │
│ ▸ Bridge — Connected                 │
└──────────────────────────────────────┘
```

### Video mode — accordions open

```
┌──────────────────────────────────────┐
│ [Video]  [Audio]              [Stop] │
├──────────────────────────────────────┤
│ Monitor: [Auto (primary) ▾]          │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │       Zone Mapping canvas        │ │
│  │   (drag rects + gamma slider)    │ │
│  └─────────────────────────────────┘ │
│  Entertainment config: [TV area ▾]   │
│  Zone: [Zone 3 (Floor Lamp) ▾]  ●    │
│  See all zones →                     │
├──────────────────────────────────────┤
│ ▾ Tuning                             │
│    Refresh rate       [60      ]     │
│    Subsample width    [0 (auto)]     │
│    Interpolation      [Area ▾]       │
│    Transition smoothing  ──●──       │
├──────────────────────────────────────┤
│ ▾ Bridge — Connected                 │
│    Connected to 10.0.0.5             │
│    [Change bridge]                   │
│                                       │
│    Zone 1 (Ceiling)     ●            │
│    Zone 2 (Floor Lamp)  ○            │
│    Zone 3 (Floor Lamp)  ●            │
│    Zone 4 (Desk)        ●            │
│    Zone 5 (TV back)     ○            │
│    Zone 6 (Shelf)       ●            │
└──────────────────────────────────────┘
```

### Audio mode — accordions collapsed

```
┌──────────────────────────────────────┐
│ [Video]  [Audio]              [Stop] │
├──────────────────────────────────────┤
│ Audio device: [System default    ]   │  ← swapped-in device field
│                                       │
│  Entertainment config: [TV area ▾]   │
├──────────────────────────────────────┤
│ ▸ Tuning                             │
│ ▸ Bridge — Connected                 │
└──────────────────────────────────────┘
```

### Audio mode — accordions open

```
┌──────────────────────────────────────┐
│ [Video]  [Audio]              [Stop] │
├──────────────────────────────────────┤
│ Audio device: [System default    ]   │
│                                       │
│  Entertainment config: [TV area ▾]   │
├──────────────────────────────────────┤
│ ▾ Tuning                             │
│    Bounce smooth time    ──●──       │
│    Drift base rate       ──●──       │
│    Vibrancy saturation   ──●──       │
│    Vibrancy value        ──●──       │
│    Use fixed hue         [ ]         │
│    Dynamism floor        ──●──       │
│    Centroid strength     ──●──       │
│    Reference RMS         ──●──       │
│    Brightness floor      ──●──       │
│    Centroid range        ──●──       │
├──────────────────────────────────────┤
│ ▾ Bridge — Connected                 │
│    Connected to 10.0.0.5             │
│    [Change bridge]                   │
└──────────────────────────────────────┘
```

Note the asymmetry in the last diagram: Bridge's expanded content itself
doesn't change per mode, but nothing in Audio mode's top tier links to it,
since there's no per-zone control up there to link from (zone mapping is
video-only, by the design decision above).

## New user setup flow (NUX) redesign
Status: in progress (Aurora-x7o).

Follow-up to "Menu redesign" above. Once the steady-state menu becomes an
accordion, the onboarding wizard that leads into it needed its own pass —
worked through as a design discussion, not yet implemented.

### Architecture: separate wizard screens (not a shared shell), built on shared components

A tempting first idea was making the wizard *be* the accordion Dashboard
itself, with sections unlocking in place as each prerequisite is met, so a
new user learns the one real page instead of a throwaway sequence that
hands off to a different-looking one at the end. That idea broke on a
concrete example: the new "entertainment zone select" step (below) wants to
show a plain, read-only list of every channel in the chosen config — but in
the final accordion, that same information (as an editable list) lives
inside the *collapsed* Bridge section, while the entertainment-config
picker itself lives in Zone Mapping's *top tier*. The two pieces this one
wizard step needs don't correspond to one contiguous region of the final
page, so "reveal the final layout progressively" doesn't hold once this
step exists.

Resolution: keep the wizard as distinct full-page screens (as today, each
with its own `showBack`/`onBack`/`onComplete` plumbing), but build the
underlying pieces as small, independently-fetching, independently-mountable
components rather than one monolithic render function per screen:

- `EntertainmentConfigSelect` — the dropdown, fetch + render
- `ChannelList` — new; a plain, non-interactive list of channel/light names
  (no dropdown, no toggles) for the "here's what's in this config" moment
- `ZoneCanvas` — drag rects + gamma slider
- `ZoneActiveToggle` — single-bool variant (Zone Mapping's top tier) and
  list variant (Bridge's collapsed "See all zones" content) over the same
  underlying zone data
- `DeviceField` — monitor dropdown / sink field, swapped by mode
- `TuningSliderGroup` — a labeled group of sliders, reusable per section

Each wizard screen and each accordion section composes whichever of these
it needs, in whatever arrangement serves its own job — reuse happens at the
component level, not by forcing one page/DOM to serve two very different
purposes (a linear one-topic-at-a-time introduction vs. a dense
always-visible hub).

### Updated sequence

```
Bridge ──► Entertainment zone select ──► Mode + Device ──► Zone Mapping ──► Dashboard
(pair)      (pick config, see channels,    (video/audio +     (customize        (already
             Test Pulse to confirm)         device, reload    shape/gamma/      diagrammed
                                             → lights react)   active)          above)
```

Splitting "which lights" (a simple, low-effort choice) from "how they're
mapped" (the more involved dragging work) lets a new user see *something*
working before being asked to do the fiddlier part — closer to "introduce
one concept at a time" than the original chain, where nothing visibly
reacted until after both Mode+Device *and* a full Zone Mapping pass.

Every screen below uses one consistent nav footer — **Back, bottom-left;
Continue, bottom-right** — on every screen, replacing reliance on the top
bar's own back arrow, which was never consistently positioned or present
screen to screen (the root complaint that started this whole redesign).

### Screen 1 — Bridge

```
State: ENTRY (first run always starts here)      State: PAIRING
┌──────────────────────────────────┐             ┌──────────────────────────────────┐
│ Connect to your Hue Bridge       │             │ Connect to your Hue Bridge       │
├──────────────────────────────────┤             ├──────────────────────────────────┤
│ Bridge address                   │             │ Press the button on your bridge, │
│ [192.168.1.42        ] [Autodetect]│             │ then continue.                    │
│                                   │             │                                    │
│                                   │             │ [Change address]                  │
│                        [Continue]│(no Back --   │                        [Continue]│
└──────────────────────────────────┘ first step)  └──────────────────────────────────┘
```

State: CONNECTED (never seen during a first run — reached via Back from
Screen 2, or later via Dashboard's own Bridge row):

```
┌──────────────────────────────────┐
│ Connect to your Hue Bridge       │
├──────────────────────────────────┤
│ Connected to 192.168.1.42        │
│        [ Change bridge ]         │  ← the one real action here, kept
│                                   │    visually separate from nav below
│                                   │
│[Back]                  [Continue]│
└──────────────────────────────────┘
```
Back and Continue both just leave without changing anything (Back to
whatever came before this screen was opened, Continue to whatever comes
after — the next onboarding step, or straight back to Dashboard if opened
from there). "Change bridge" is the only action that mutates state, dropping
into the ENTRY form above.

### Screen 2 — Entertainment zone select (new)

```
State: MULTIPLE CONFIGS                          State: SINGLE CONFIG
┌──────────────────────────────────┐             ┌──────────────────────────────────┐
│ Choose your lights               │             │ Choose your lights               │
├──────────────────────────────────┤             ├──────────────────────────────────┤
│ Entertainment configuration      │             │ Using: TV area                   │
│ [TV area ▾]                      │             │                                    │
│ Zone 1 (Ceiling)                 │             │ Zone 1 (Ceiling)                 │
│ Zone 2 (Floor Lamp)              │             │ Zone 2 (Floor Lamp)              │
│ Zone 3 (Floor Lamp)              │             │ Zone 3 (Floor Lamp)              │
│ Zone 4 (Desk)                    │             │ Zone 4 (Desk)                    │
│                                   │             │                                    │
│ [ Test pulse ]                   │             │ [ Test pulse ]                   │
│                                   │             │                                    │
│[Back]                  [Continue]│             │[Back]                  [Continue]│
└──────────────────────────────────┘             └──────────────────────────────────┘
```
`ChannelList` (new component) renders the names, plain and non-interactive;
re-selecting the config swaps which names are listed. Dropdown never shows
when there's only one config, matching Output Connect's existing
single-config rule.

**Test Pulse**, mid-run:
```
│ [ Test pulse... ]  (disabled while the GET/PUT/wait/PUT sequence runs) │
```

### Screen 3 — Mode + Device

```
┌──────────────────────────┐     ┌──────────────────────────┐
│ Capture source            │     │ Capture source            │
├──────────────────────────┤     ├──────────────────────────┤
│ [Video]  [Audio]         │     │ [Video]  [Audio]         │
│                            │     │                            │
│ Monitor: [Auto (primary)▾]│     │ Audio device:              │
│                            │     │ [System default        ]  │
│[Back]          [Continue]│     │[Back]          [Continue]│
└──────────────────────────┘     └──────────────────────────┘
```
`DeviceField` is one component, swapped by `this.mode` — matches
`ModeDeviceScreen`'s existing `_renderVideoDevice`/`_renderAudioDevice`
dispatch, no new logic. Saving triggers a reload and goes straight to Zone
Mapping (no separate "Saved" screen); a `reloadError` shows inline above the
footer, same pattern every other screen already uses.

### Screen 4 — Zone Mapping (customize)

```
┌────────────────────────────────────┐
│ Zone Mapping                       │
├────────────────────────────────────┤
│ Using: TV area                     │  ← static label, not a dropdown --
│                                     │    already chosen in Screen 2
│  ┌───────────────────────────────┐ │
│  │       Zone Mapping canvas      │ │
│  │   (drag rects + gamma slider)  │ │
│  └───────────────────────────────┘ │
│  Zone: [Zone 3 (Floor Lamp) ▾]  ●  │  ← single active bool, current zone
│                                     │
│[Back]                    [Continue]│
└────────────────────────────────────┘
```
`EntertainmentConfigSelect` isn't composed into this screen during
onboarding at all — the value's already fixed from Screen 2, so it renders
as a plain label instead of re-prompting an already-made choice. The
interactive dropdown version only appears later, on the Dashboard, where
switching configs is a real, live action.

### Tech changes needed to support this

- **Zone-active default and the `everConfigured` field — see "Decisions/
  spikes" below for the full resolution.** Short version: `ZoneConfig`'s
  `active` default flips to `true` (fixes the "instant reaction" goal), and
  a new `everConfigured` presence field replaces `app.js`'s existing
  `needsZoneMapping` check, which currently (and would silently keep, if
  left alone) relies on `active` staying `false` as its "never touched"
  signal — a real breakage the `active` flip would otherwise cause.
- **New `ChannelList` component** — plain, non-interactive rendering of
  channel/light names. Doesn't exist today (`Dropdown.js` implies
  selection, `.toggle-row` implies editability; this needs neither).
- **New backend route for Test Pulse** (e.g. `POST /api/hue/test-pulse`,
  taking an entertainment config ID) — REST-only against each member
  light's own resource, *not* the entertainment/DTLS streaming path
  `HueOutput`/`Streamer` use, since this is a one-shot check, not
  continuous frame-rate control, and needs to work before any Pipeline
  exists:
  1. `GET /clip/v2/resource/light/<id>` per light in the config's channels
     (membership data already available via the already-ported
     `parseEntertainmentConfigurationsChannels`) — capture current
     color/brightness.
  2. `PUT` each light to magenta with a short transition.
  3. Wait for the transition to finish.
  4. `PUT` each light back to its captured original state, same transition
     on the way back.
  New helper in `ApiTools.cpp`, reusing the existing `sendHttpRequest`.
  **Field confirmed** (see "Decisions/spikes" above): request body is
  `{"color": {"xy": {"x", "y"}}, "dynamics": {"duration"}}` (milliseconds,
  sibling fields, CIE xy not RGB) — checked against `openhue/openhue-api`'s
  public OpenAPI spec, since Hue's own dev docs stayed login-gated and
  huenicorn never uses the regular Light API to check against in-repo.
  Converting magenta to xy should reuse `Aurora-Output-Hue`'s existing
  colorimetry conversion code, not new math.
- **`OutputConnectScreen`'s CONNECTED state** needs the same `showBack`/
  `onBack`/`onComplete` footer every other screen already takes, plus
  "Change bridge" as a visually distinct third action — not built yet (see
  `WebUI_Fixes.md`'s Back-button task, which this section resolves).

## Scoping + sequencing
Status: planning — sequencing for the above.

One line per step, on purpose — verification/findings once building starts
go to `WebUI_Fixes.md`'s Pass 2 section, not inline here. Each phase should
leave the app in a working state before the next one starts.

### In scope

Everything designed above: Settings removal, the accordion Dashboard
(three named areas), Capture Source folding into a shared device field, the
Bridge Connected state, the 4-screen onboarding sequence (Bridge →
Entertainment zone select → Mode+Device → Zone Mapping), Test Pulse, the
consistent Back/Continue footer.

### Out of scope

Zone mapping/gamma for Audio mode (design decision, not a gap — see above).
A shared wizard/Dashboard shell (Option B — ruled out above). Any change to
`Aurora-App-Linux`'s/`Aurora-App-Windows`'s backend beyond the two items
below — this pass is almost entirely `Aurora-WebUI` frontend work.

### Decisions/spikes that gate everything else

1. ~~Zone-active default~~ **Resolved, in two parts.** First: flip
   `ZoneConfig`'s default in `ZoneMap.hpp:17` from `active{false}` to
   `active{true}`, no onboarding-only special case needed. The `false`
   default's original justification (protecting against "zone 5 hides zone
   4") was actually about the *editor's* click-target/z-order handling,
   which already has its own independent, permanent fix (dropdown-based
   selection + always-paint-selected-last) — a new zone defaulting to
   active no longer recreates that problem, it just shows a generic
   whole-screen-average color until customized.
   Second, a real regression this flip would otherwise cause, found by
   checking against `WebUI_Design_1stPass.md`'s *actual code*, not its
   design intent: `app.js`'s `probeState()` detects "onboarding has never
   touched Zone Mapping" via `!zonesResult.zones.some((z) => z.active)` —
   once untouched zones default to active, that check goes false the
   instant any zone exists, for every install, forever. Using a
   semantically-meaningful field's default value as a "never configured"
   proxy is inherently fragile — it breaks the moment that default changes
   for an unrelated reason (exactly what just happened), or the moment a
   real configuration legitimately matches the default on purpose. The
   general fix, not a same-shape workaround: add `bool everConfigured{false}`
   to `ZoneConfig` as a dedicated presence flag, decoupled from `active`'s
   own meaning (protobuf3's scalar-field presence problem is the same
   shape — a zero-value default can't be distinguished from "never set"
   without a separate marker). `updateZone()` sets it `true` on any write;
   `app.js` checks `everConfigured` instead of `active`. No migration-on-
   load logic needed — with exactly one real save file in existence (the
   live `hue.json`), a missing field there means "predates this feature,"
   not "unconfigured," so it gets `everConfigured: true` added directly,
   once, alongside adding the field to the struct (Phase A) — not a
   generalized "old file missing this field" load-path rule, since there's
   no population of old files to handle (same reasoning `WebUI_Fixes.md`'s
   Pass 1 already used for "no huenicorn config migration path exists").
   Doesn't affect any already-saved zone's `active`/`uvs`/`gamma` values
   either way (`reconcileZoneMap` only applies defaults to zone IDs with no
   saved entry at all).
2. ~~Verify Hue's Light PUT transition field~~ **Resolved** — checked
   against `openhue/openhue-api`'s public OpenAPI spec on GitHub
   (`src/light/schemas/LightPut.yaml`/`LightDynamics.yaml`,
   `src/common/GamutPosition.yaml`), a well-maintained community mirror of
   Hue's real CLIP v2 API (Philips's own docs stayed login-gated). Confirmed
   shape for `PUT /clip/v2/resource/light/<id>`:
   `{"color": {"xy": {"x": <0-1>, "y": <0-1>}}, "dynamics": {"duration": <ms, integer>}}`
   — `color` and `dynamics` are sibling fields, not nested. Color is set via
   CIE xy, not RGB/hex, so Test Pulse's backend needs to convert magenta to
   an xy pair before the PUT (reuse `Aurora-Output-Hue`'s existing
   colorimetry conversion code from the RGB-vs-XYB work rather than writing
   new math). A live-bridge smoke test during Phase A step 4 still applies,
   as normal implementation verification — this was confirming the field
   exists and its shape, not a substitute for testing the real request.

### Phase A — backend

3. `ZoneMap.hpp`: flip `active`'s default to `true`, add `bool
   everConfigured{false}`; `updateZone()` sets it `true` on write; add
   `everConfigured: true` to every zone in the live `hue.json` directly (no
   load-path migration code — see decision 1).
4. `ApiTools.cpp`: GET/PUT/wait/PUT helper for Test Pulse, using the field
   name confirmed in decision 2.
5. New route: `POST /api/hue/test-pulse` (entertainment config ID → pulse
   every member light), wired in both apps' `main.cpp`.

*Testing:* unit tests for the default/`everConfigured` change and the Test
Pulse helper (`core/Runtime`'s and `Aurora-Output-Hue`'s existing suites);
the live-bridge smoke test for `dynamics.duration` from decision 2 actually
run here, not left as a mention.

### Phase B — extract reusable components (refactor only, no behavior change)

No accordion/collapsible-section primitive exists in `Aurora-WebUI` today
(checked — nothing in `styles/`) and none of the six components from the
design section above exist as standalone modules yet; all currently live
inline inside the screens that happen to need them today.

6. Extract `DeviceField` out of `ModeDeviceScreen.js`.
7. Extract `EntertainmentConfigSelect` out of `ZoneMappingScreen.js`.
8. Extract `ZoneCanvas` out of `ZoneMappingScreen.js`.
9. Extract `ZoneActiveToggle`'s **list** variant out of `ZoneMappingScreen.js`
   (that's what exists there today, from Pass 1's 7-item plan) *and* build
   its **single-bool** variant fresh (doesn't exist anywhere yet) — both now,
   not deferred, since Phase C step 17 (Zone Mapping's onboarding rebuild)
   needs the single-bool one immediately, before Phase D's Bridge ever does.
10. Extract `TuningSliderGroup` out of `TuningScreen.js`.
11. Build `ChannelList` (new — no existing equivalent).
12. Build `AccordionSection` (new — no existing equivalent). Needs a real
    external API from the start, not just internal click-to-toggle state:
    `.expand()`/`.collapse()` methods and an exposed content container.
    Without this, step 21's "See all zones" link (Zone Mapping's top tier
    commanding Bridge's section to open, from outside it) is unbuildable
    without reopening this component later. `DashboardScreen` will need to
    hold onto the section instances it creates, not just fire-and-forget
    mount them, so it can wire that cross-section link when composing the
    video top tier.
13. Re-verify `ZoneMappingScreen`/`ModeDeviceScreen`/`TuningScreen` still
    work unchanged against their extracted components (jsdom) before
    moving on — this phase should be invisible from the outside.

*Testing:* direct jsdom coverage for each extracted/new component itself,
not just "does the old screen still work" — a bug caught at the component
level is caught once, not once per future consumer. `AccordionSection`
especially needs its `.expand()`/`.collapse()` API tested as called from
*outside* the component, since that external control is the entire point
of building it that way.

### Phase C — onboarding screens

14. `OutputConnectScreen`: add the CONNECTED state, the consistent
    Back/Continue footer, cut the entertainment-config dropdown and Done
    phases (superseded by step 15).
15. New screen: Entertainment zone select, composing
    `EntertainmentConfigSelect` + `ChannelList` + the Test Pulse button.
16. Rebuild `ModeDeviceScreen` on `DeviceField`; consistent footer; drop
    the Saved phase (goes straight to Zone Mapping on success).
17. Rebuild `ZoneMappingScreen`'s onboarding variant: canvas +
    `ZoneActiveToggle` (single) + a static "Using: `<config>`" label
    instead of `EntertainmentConfigSelect` (value already fixed by step 15).
18. `app.js`: insert the new step into `probeState()`/the boot chain, drop
    the forced Tuning step, swap `needsZoneMapping`'s check from `active` to
    `everConfigured` (decision 1 — this is the step that actually needs the
    new field, not a separate action to call).

*Testing:* jsdom coverage per screen as it's built here, matching how Pass 1
actually verified each step rather than batching it all to the end — CONNECTED
state's Back/Continue/Change-bridge transitions, the single-config auto-skip
on Entertainment zone select, and most importantly a direct regression test
that onboarding shows Zone Mapping when `everConfigured:false` and skips it
when `true`, since that's the exact signal this whole phase just fixed.

### Phase D — accordion Dashboard

19. Remove the Settings gear/modal entirely: `index.html`, `shell.js`,
    `topBar.js`'s `onSettings` prop, and every screen's call site.
20. Rebuild `DashboardScreen`: top-tier `DeviceField`, video's
    `ZoneCanvas`+`EntertainmentConfigSelect`+single `ZoneActiveToggle`, or
    audio's `EntertainmentConfigSelect` alone (no promoted sliders — see
    above); collapsed Tuning `AccordionSection` (always the full field set,
    either mode); collapsed Bridge `AccordionSection` (status, Change
    bridge, the list-variant `ZoneActiveToggle`). Capture Source's nav row
    goes away entirely. Mode switch resets both `AccordionSection`s to
    collapsed as part of the existing full re-render.
21. Wire "See all zones →" (expand Bridge's `AccordionSection` +
    `scrollIntoView`).

*Testing:* jsdom for the Settings removal (grep-style check — no lingering
`onSettings`/`openSettings` references anywhere), "See all zones" actually
calling `.expand()` on the right section, and the mode-switch collapse
actually resetting an open accordion rather than leaving stale content
visible — this last one is a brand-new, not-yet-proven behavior, worth
catching here rather than first discovering it live.

### Phase E — verification

22. jsdom coverage for the new screen, the CONNECTED state, accordion
    expand/collapse (including the mode-switch reset), Test Pulse's states —
    a final consolidated pass, not the first time any of this is tested.
23. Live pass: fresh install through the full new chain against a real
    bridge, both modes, *and*: Back at every step (not just forward), a live
    mode switch on the finished Dashboard, "Change bridge" from an
    already-fully-configured Dashboard, and Test Pulse against a real
    multi-config bridge if available — not just one straight-through walk.
    Explicitly check `index.html`'s `<link>` tags cover any new stylesheet
    the Entertainment zone select screen needs — Pass 1 shipped Zone Mapping
    with a missing stylesheet link for several steps, invisible to jsdom
    (which never loads stylesheets), only caught once a live cold-boot path
    made that screen reachable. Also re-run the existing Pass 1 jsdom suites
    (`dropdown_test.mjs`, `zone_mapping_test.mjs`, etc.) once more here —
    Phase B verified them right after extraction, but Phase C/D touch the
    same files again afterward.
24. Real findings from step 23 go to `WebUI_Fixes.md`'s Pass 2 section —
    not back into this doc.
