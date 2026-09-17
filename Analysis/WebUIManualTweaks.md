# WebUI manual tweaks

Follow-up to `WebUIAnalysis.md`. That doc's 19-step build order is done and
each screen passed its own jsdom/live verification, but "verified" isn't
the same as "actually usable" — this doc tracks the gap between the AI-built
first pass and a human sitting down and using it, found by hands-on use
after the build order closed out.

Keep entries short: what's wrong, why it matters, a proposed fix if one's
obvious. Full investigation/fix details belong in the commit or PR that
closes the task, not here — see `Analysis/lessons/engineering-hygiene.md`'s
entry on build-log doc density for why.

## Open tasks

- [ ] **Menu redesign.** Dashboard's four separate screens (Bridge/Capture
  source/Zones/Tuning) collapse into an accordion under one persistent
  Dashboard, informed directly by huenicorn's own single-page priority
  ordering (canvas+gamma, then entertainment config, then channel list all
  always visible; only "Advanced settings" collapsed). Cuts the dead
  Settings button/modal entirely — no real content ever lived there, and
  huenicorn has no gear icon either. Folds Capture Source away completely
  (its only real content, one device field, moves to a shared top-tier slot
  that swaps between a monitor dropdown and a sink field depending on
  mode). Also closes out the Back-button task above as part of the same
  pass (`OutputConnectScreen`'s "already connected" state). See "Menu
  redesign: accordion Dashboard" at the bottom of this doc for the full
  design discussion, the tabs-vs-accordion comparison against
  `RockyRoadImport`, and the final ASCII layouts (collapsed/expanded ×
  video/audio). The onboarding sequence that leads into this menu is
  worked out separately in "New user setup flow (NUX) redesign," further
  down the same doc.
- [x] **Fixed: fresh install — HTTP server never binds, and even once it did,
  onboarding couldn't reach Output Connect.** Two stacked bugs, not one:
  (1) `Pipeline::build()` threw when zero outputs were registered, before
  `httpServer.bind()` ran, so nothing listened on the port at all (confirmed
  live: deleting `%APPDATA%\Aurora` and relaunching printed a fatal error).
  (2) Even after fixing that, `/api/capabilities`' `outputs` list came
  straight from `registry.outputNames()`, and `registerOutputs()` only adds
  `"hue"` to that registry once credentials are *already* configured —  a
  chicken-and-egg gate. `app.js`'s `hasHue` and `DashboardScreen`'s Bridge
  row both read that same list to mean "is Hue compiled into this build,"
  so a genuinely fresh install would see `hasHue: false`, skip Output
  Connect entirely, and land on a Dashboard with the Bridge row permanently
  disabled ("not available in this build") — no path to pairing at all.
  Root-caused by asking "what's the intended new-user flow?" instead of
  accepting the crash fix alone as done.
  **Fix (1):** output-agnostic, not Hue-specific — `main()`'s initial
  `Pipeline::build()` call is now wrapped in try/catch (matching how
  `PipelineHost::reload()` already treated a failed rebuild as recoverable),
  and `PipelineHost` now tolerates holding no `Pipeline` at all
  (`tick()`/`shutdown()` no-op, `listMonitors()`/`listZones()` return empty,
  `updateZone()` returns false) until a reload — e.g. after pairing
  completes — first succeeds. Matches huenicorn's separate-setup-server
  pattern.
  **Fix (2):** `registerCapabilitiesRoute()`'s `outputs` list now always
  includes `"hue"` when `AURORA_OUTPUT_HUE_IO_AVAILABLE` is compiled in,
  independent of `registry.outputNames()` — matching the route's own
  documented contract ("compiled with," not "already paired").
  `registerOutputs()`'s Pipeline-facing registration is untouched (still
  conditional on configuration, so an unpaired boot doesn't try to init a
  bogus Hue connection).
  Confirmed live end-to-end with `%APPDATA%\Aurora` deleted:
  `/api/capabilities` now reports `outputs: ["hue"]`, `/api/hue/connection`
  reports `configured: false`, which is exactly what `app.js`'s
  `probeState()` needs to route a fresh install to Output Connect first —
  Output Connect → Mode+Device → Zone Mapping → Tuning → Dashboard, with
  the existing `onConnectionChanged` reload callback building the first
  real `Pipeline` once pairing completes. Applied identically to
  `Aurora-App-Windows` and `Aurora-App-Linux` (both rebuilt clean, Linux
  verified via WSL2).
- [x] **Pairing persistence — resolved, not a real bug.** Live repro with
  temp `[pairing-debug]` logging confirmed the full flow (validate →
  register retry after button press → entertainment configs → save) works
  and persists correctly. Earlier "never saved" reports were real attempts
  that likely never completed the register retry, not a persistence bug.
  Debug logging since stripped from `CredentialsStore.cpp`/
  `PairingRoutes.cpp` (the `configRoot` line in `main.cpp` stays until the
  double-click crash below is root-caused).
- [ ] **No way to discover the WebUI's URL.** Root cause found: the printed
  line was `config.boundBackendIP()` verbatim, which defaults to `"0.0.0.0"`
  — a bind-all address, not something a browser can reliably navigate to
  (behavior varies by browser/OS, matching the flaky "0.0.0.0 worked/didn't
  work" reports). Fix in progress: `browsableAddress()` substitutes
  `127.0.0.1` for that case; auto-launch the browser on first setup only,
  print a clickable link (not auto-launch) otherwise. Same bug existed
  identically in both `Aurora-App-Windows` and `Aurora-App-Linux`.
- [ ] **Back navigates to the previous onboarding *step*, which is correct,
  but the step it lands on doesn't show what you already did there.**
  Original report: Back from Tuning (audio mode, mistaken for the
  Dashboard) returned to Output Connect, several steps earlier than
  expected. Root cause found in a later pass: chain-level Back is already
  correct as "literal previous screen in sequence" — the actual bug is that
  `OutputConnectScreen` always mounts into its blank entry form regardless
  of whether a connection is already saved, so going back after already
  pairing looks and behaves like starting over (worse: continuing from
  there re-runs `_register()` for real, silently demanding the physical
  link button be pressed again). Fix: `OutputConnectScreen.mount()` checks
  for an already-configured connection first and renders a "Connected to
  `<address>` — Change bridge" status phase instead of jumping straight
  into pairing; Back itself needs no change. Applies identically whether
  reached via chain Back or via Dashboard's own Bridge row.
  **Note:** this will likely get fixed as a byproduct of the NUX redo
  rather than as its own standalone change — see "New user setup flow (NUX)
  redesign" at the bottom of this doc, which redraws every onboarding
  screen with a consistent Back/Continue footer and works through this
  exact Connected-state question directly.
- [x] **Fixed: clicking a Dropdown entry looked broken but wasn't.**
  `Dropdown._commit()` closed the menu and called the caller's `onSelect`,
  but never updated its own trigger label or `aria-selected` — the
  committed value was always correct (confirmed via the real PUT/POST body
  sent) but the label never visibly changed, indistinguishable from a
  broken click. Fixed in `Dropdown.js`; regression coverage added to
  `dropdown_test.mjs`. Neither real call site (`OutputConnectScreen`,
  `ModeDeviceScreen`) needed changes — both already just stash the value.
  Re-reported as still broken once — served file confirmed correct via
  direct curl; likely a stale ES-module cache in an already-open tab, not
  reopened as a task unless a hard-refreshed repro still shows it.
- [x] **Fixed: entertainment config pickable without redoing physical
  pairing.** `OutputConnectScreen` had no path to `configSelect` except the
  full `entry → pairing → configSelect` sequence, even with valid
  credentials already saved. Matches huenicorn's own real design
  (`WebUI.js`'s entertainment-config `<select>` lives on its main
  zone-mapping page, decoupled from setup) — added the picker to Zone
  Mapping instead of special-casing Output Connect, hidden at exactly one
  config same as elsewhere. `POST /api/hue/connection` is now merge-style
  (PATCH), same convention `/api/config`/`/api/zones` already use, since
  the frontend never has `username`/`clientkey` to resend a full body;
  `PUT /api/hue/entertainment-configurations` falls back to the persisted
  connection when the body omits bridgeAddress/username. Verified live
  against the real bridge (switched "TV area" → "TV" and back with no
  re-pairing); jsdom regression coverage added to `zone_mapping_test.mjs`.
  `[pairing-debug]` logging stripped from `PairingRoutes.cpp`/
  `CredentialsStore.cpp` now that the persistence question is resolved
  (the `configRoot` line in `main.cpp` stays until the double-click crash
  is root-caused).
  **Update:** the "verified live" claim above only checked that the switch
  persisted, not that it took visible effect — real gap found afterward:
  `registerOutputs()`'s Hue factory closed over `HueConnection` by value at
  registration time (main.cpp, both apps), so switching configs never
  changed which channels the *running* output actually reported; the zone
  canvas kept showing whichever config was loaded at boot (one zone
  "TV"-shaped instead of the seven-light "TV area" set). Fixed: the factory
  now re-reads `CredentialsStore` fresh on every call, and
  `registerPairingRoutes` gained an `onConnectionChanged` reload callback
  (same convention as `SettingsRoutes`' `onConfigChanged`), called after
  `POST /api/hue/connection` saves. `ZoneMappingScreen._setEntertainmentConfig`
  also now re-fetches `/api/zones` after a successful switch instead of only
  updating the picker's own label. Re-verifying surfaced a further UI gap
  (occluded/unselectable zones) — see "Zone Mapping: channel selection &
  identification" below for the full follow-up plan, confirmed working live.
- [ ] **No single-instance enforcement — a second launch can silently run
  headless.** `httpServer.bind()` failing (port in use) just logs to
  stderr and the process keeps running with no WebUI at all; nothing tells
  the user which of possibly several running copies is the real one. Real
  design constraint: must scope the lock to the resolved config root, not
  globally — this session's own testing runs multiple instances at once
  against different `AURORA_CONFIG_DIR`s, and a real future setup might
  legitimately run two instances for two different bridges. A named mutex
  derived from the config-root path, not a global one. Related: a
  double-click-launched console closes instantly on exit, so even a
  correct error message is never seen — worth fixing together (log to a
  file, or keep the window open on error).
- [x] **Fixed: live Video→Audio mode switch — light silently stopped
  responding.** Root-caused via live `[audio-debug]`/`[hue-debug]` logging:
  audio capture and processing were working correctly the whole time (real,
  changing samples/colors every tick) — the bug was that
  `PipelineHost::reload()` builds the new pipeline (including starting its
  stream) fully before tearing down the old one, and `HueOutput::shutdown()`
  unconditionally sent an authoritative "stop streaming" call for its
  entertainment config. When old and new outputs share the same config (the
  common case — same bridge, same "TV area"), that late stop silently killed
  the brand-new stream at the bridge, while every local signal
  (`isConnected()`, computed colors) kept reporting healthy. Not Hue-specific
  in cause (any output plugin with external session state could hit the same
  race) — fixed at the `IOutput` interface: `shutdown()` now takes
  `isReplacement`, and only a real app exit (not a reload) tells Hue to
  actually stop the bridge-side stream. `Aurora-Output-Hue`'s test suite (94
  assertions) still passes after both the fix and the debug-logging cleanup.
  Confirmed fixed live. Temp `[audio-debug]`/`[hue-debug]` logging stripped
  from `AudioGrabber.cpp`, `AudioOrchestrator.cpp`, `HueOutput.cpp`,
  `ApiTools.cpp`, and both apps' `main.cpp` (the `[pairing-debug]`
  `configRoot` line in `main.cpp` stays until the double-click crash is
  root-caused).
- [ ] **Autodetect needs two clicks to work.** Root cause found, not yet
  fixed: `HttpClient.cpp`'s `sendHttpRequest` hardcodes `CURLOPT_TIMEOUT` to
  1 second for every outbound call this module makes, including
  `ApiTools::autodetectedBridge()`'s call to `https://discovery.meethue.com/`
  — a real internet round trip (DNS + TLS + response), unlike every other
  caller of this function, which talks to a bridge on the local LAN. 1s is
  short enough to plausibly miss on a cold connection and succeed on retry,
  which is exactly the reported symptom. Already flagged once before in
  `Analysis/lessons/engineering-hygiene.md`'s live-E2E-test entry, but only
  worked around there in a *test's* wait time — never fixed at the source.
  Fix: give this one call (only this one — local bridge calls should keep
  failing fast) a longer timeout, e.g. 5s.

## Zone Mapping: channel selection & identification

Follow-up to the entertainment-config task above. Root cause of "zone 5 hid
zone 4": every zone with no saved mapping defaults to the exact same
full-canvas UV rect (`ZoneReconciler`/`ZoneConfig`'s default), so their
outlines, tags, and click targets all land on the same pixels — the topmost
DOM element eats every click, the others become unreachable.

Items 1-7 built and confirmed live. Some visual nits noted for follow-up,
not yet itemized here.

1. [x] Removed the on-canvas per-zone checkbox; kept the bare zoneId label
   (already rendered for every zone, not just the selected one).
2. [x] Added a zone-selector dropdown (same `Dropdown.js` component as the
   entertainment picker) as the primary way to choose which zone is being
   shape-edited/gamma-tuned, decoupled from clicking the canvas. Canvas
   click still works too, as a shortcut.
3. [x] Added a separate active/inactive toggle list below the canvas+gamma
   block, one row per zone, reusing the existing `.toggle-row`/
   `.toggle-switch` pattern (`forms.css`) — not huenicorn's two-column
   drag-and-drop, which solves an open-ended bridge-light-membership
   problem Aurora's fixed zone count doesn't have. Fully decoupled from
   which zone the dropdown/canvas has selected.
4. [x] Fixed `_renderCanvas`'s paint order: zones used to draw in array
   order regardless of selection. Now the selected zone always paints
   last (on top), so picking it from the dropdown reliably surfaces its
   shape/handles even when another zone's rect covers the same region.
5. [x] Zone Mapping now always has a real selection on load (defaults to
   the first zone) instead of starting with none selected, matching the
   entertainment dropdown's always-a-value behavior.
6. [x] Wired `ApiTools::matchDevices`/`parseEntertainmentConfigurationsChannels`
   (already ported and unit-tested, never called from the live path) into
   `loadEntertainmentConfigurations()`, and added `GET /api/hue/channels`
   so the dropdown and toggle list show real light names ("Zone 5 (Floor
   Lamp)") instead of bare numbers where the bridge has them.
   **Side effects found along the way:** `Dropdown.js` itself had a latent
   bug — option matching compared `dataset.value` (always a string)
   against the option's raw value, so a numeric value (zoneId) silently
   failed to select on click; fixed with a `String()` coercion. Rewriting
   the jsdom tests to cover the entertainment-config-switch flow with a
   stateful mock (matching how the real persisted connection actually
   behaves) also confirmed last session's "not yet re-verified live"
   reload fix genuinely works end to end. Verified via jsdom
   (`zone_mapping_test.mjs`) and the `Aurora-Output-Hue` unit suite (94
   assertions), then confirmed live.
7. [x] Verification pass: backed up the live (all-default, all-inactive)
   `hue.json`, dropped in a real prior zone layout for the test, confirmed
   the UI rendered it correctly. No migration path exists from huenicorn's
   old config format (checked, none found) — a fresh Aurora config always
   starts with every zone defaulted to the full-canvas rect, which is why
   they all rendered identically before any manual dragging.

## Menu redesign: accordion Dashboard

Follow-up to the "Menu redesign" task above. Prompted by hands-on nits after
the Zone Mapping work above shipped: the Settings button does nothing on any
page, Back/Forward availability is inconsistent screen to screen, and the
Dashboard duplicates its own Video/Audio toggle inside Capture Source. Worked
through as a design discussion (not yet implemented) — captured here in full
since it changes what several existing screens are for, not just one bug.

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
of whether a connection is already saved. Fix (tracked in the open task
above): mount() checks saved state first and shows a "Connected to
`<address>` — Change bridge" status view instead. Once that's true, Back
naturally shows "what you already did there," matching the reference
`WebUIManualTweaks.md` back-navigation task's own resolution.

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
Bridge.** The 7-item Zone Mapping plan above added an always-visible toggle
row per zone below the canvas — revisited here because in an accordion
layout, a list that grows with zone count sitting directly above a stack of
one-line collapsed headers reads as lopsided (tall on top, thin below).
Resolved as two controls, not one: a single active-bool tied to whichever
zone the dropdown/canvas currently has selected (fixed height, right where
you're already looking while shape-editing — this was the original
pre-redesign idea, before the decoupled list was built), plus the full
per-zone list relocated into the Bridge section for the rare "what's even in
the mix" glance, reachable via a "See all zones →" link that expands the
Bridge accordion and scrolls it into view
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
(video's top tier), Tuning (audio's top tier, its two most-nudged sliders
promoted, the rest collapsed), Bridge (collapsed either way: connection
status, re-pair action, and the full zone list). Entertainment config
selection is mode-agnostic and stays visible in both, matching huenicorn's
own unconditional placement.

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
│  Response speed      ──●──           │
│  Brightness smooth   ──●──           │
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
│  Response speed      ──●──           │
│  Brightness smooth   ──●──           │
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

- **Zone-active default breaks the "instant reaction" goal — needs an
  onboarding-only fix, not a global one.** `ZoneMap.hpp:17` defaults a new
  zone to `active{false}`; `AudioFrameCompositor`/video frame composition
  both skip inactive zones outright, so Screen 3's reload would produce
  *zero* reacting lights as currently written. The `false` default exists
  for a real reason (it's what stops a zone added later to an
  already-configured setup from silently sharing the same unmapped
  full-canvas rect as every other zone — the original "zone 5 hides zone 4"
  bug this doc started with) and shouldn't change globally. Proposed fix:
  the onboarding flow itself explicitly activates every zone once, right
  when they're first discovered (Screen 2 or right after Screen 3's first
  successful reload) — a first-run-only action, not a change to
  `ZoneReconciler`'s general default. **Still an open decision, not yet
  agreed** — needs confirmation before implementation.
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
  **Open verification item:** the smooth transition depends on Hue's Light
  PUT supporting a duration field (recalled as `dynamics.duration`,
  milliseconds) — not verified against an authoritative source. Hue's own
  dev docs are login-gated (a live `WebFetch` attempt hit the login page,
  not the API reference), and huenicorn never uses the regular Light API
  itself (only the entertainment/DTLS path), so there's no in-repo
  precedent to confirm the exact field name against either. Needs checking
  against a real bridge (or the actual docs once logged in) before this
  gets built — flagged here rather than assumed.
- **`OutputConnectScreen`'s CONNECTED state** needs the same `showBack`/
  `onBack`/`onComplete` footer every other screen already takes, plus
  "Change bridge" as a visually distinct third action — not built yet (see
  the Back-button task above, which this section resolves).
