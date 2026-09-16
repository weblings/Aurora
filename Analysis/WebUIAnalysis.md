# WebUI screens, jobs, and component research

Detail doc for `ImplementationPlan.md`'s Phase 3 Milestone 2 (native-facing WebUI).
Covers the screen list, the navigation model, per-screen layout at two widths, and
what existing huenicorn/RockyRoad/RockyRoadImport code was actually checked (not
assumed) as reusable for building it. Written 2026-09-15, before any of this is
built — a planning doc, not a record of what exists yet.

## How this plan was built (iteration log)

This plan wasn't drafted once. It went through several real rounds of
proposal → challenge → verification, each round changing the actual
recommendations, not just wording:

1. **Research pass** — surveyed huenicorn's real setup/UI code and config
   surface, and RockyRoad's actual (not assumed) UI-toolkit situation, before
   drafting anything.
2. **First screen/flow draft** — a linear wizard shape (including a Welcome
   screen) with a first pass at jobs-to-be-done per screen.
3. **Challenged on navigation** — "does going back to screen 2 force redoing
   3-5?" surfaced that the linear framing only applies to first-run, not a
   returning user; adopted RockyRoad's hub-and-spoke shell pattern instead.
4. **Component research, round 1** — matched each screen's elements against
   real, read (not assumed) huenicorn/RockyRoad source, building the first
   component audit.
5. **Re-examined the audit itself** — asked "is the component picked actually
   the best fit, or just the first one found" and "has a reference screen
   already solved this exact job with something overlooked," surfacing
   several corrections (`RockyRoadImport`'s forms page, `.lib-badge`,
   `.pre-toggle-row`, `.seek-section-tick`).
6. **ASCII layout pass, two widths** — desktop and constrained wireframes per
   screen, checked against a real RockyRoad desktop-vs-XR layout comparison
   for what should actually change with available space.
7. **Jobs-to-be-done re-audit** — asked, separately from "could this be
   reused," whether each screen's job actually needed each element; cut a
   real fraction of the component list as a result.
8. **Final concern pass** — walked back one over-applied lesson (Zone
   Mapping's forced mobile restructuring) after checking real numbers, closed
   an apparent credentials-recovery gap by pointing at an already-planned
   action, and made a final scope cut (live preview/swatches deferred out of
   v1 entirely).

Generalizable lessons from this process are filed in
[`Analysis/lessons/web-ui.md`](lessons/web-ui.md), not repeated here.

## Shell conventions (apply to every screen, every width)

- A centered max-width content column (`RockyRoadImport/SongConverter`'s real
  `#app{max-width:640px;margin:0 auto}`, verified).
- One top bar formula, everywhere: `[← Back or blank] [Screen title, centered]
  [status pill — Dashboard only] [⚙]`. The title lives in the bar itself, not a
  separate heading line in the body — recovers a full line of vertical space on
  every screen. `← Back` is absent on Output Connect during first-run only
  (nothing exists yet to return to); its label is the same everywhere but its
  target differs by context (previous wizard step during first-run, Dashboard
  during hub-and-spoke return visits).
- The macro vertical order of a screen never changes between desktop and a
  constrained (phone) width. What changes with width is how densely each
  *section's own content* packs (columns within a section), not the page
  structure — this rule came out of comparing RockyRoad's desktop `.active-bar`
  (one dense toolbar row) against its XR `play.css` equivalent (the same
  controls spread across several stacked rows in a fixed 400×300 panel): tight
  space and lower-precision input (touch, or a ray) call for stacking
  functional groups into their own rows, not shrinking one row to fit.
- Settings gear + modal + scrim: RockyRoad's `#settings-btn`/`#settings-overlay`/
  `#settings-scrim`, verified real, reused directly, unchanged from the first
  pass.

## Navigation model

Two distinct flows, not one linear wizard:

- **First-run (nothing persisted)**: linear, since each step depends on data the
  previous one produced — Output Connect → Mode+Device → Zone Mapping → Tuning →
  Dashboard.
- **Returning user (state already valid)**: hub-and-spoke off the Dashboard. Each
  of Output Connect / Mode+Device / Zone Mapping / Tuning is an independently
  reachable panel that returns straight to the Dashboard on completion, not a
  forward chain into the next screen.

A dedicated "Welcome" screen was considered and cut — it collected no data of its
own, and the one thing it did (warn that pairing needs physical access to the
bridge) folds into Output Connect's own header copy instead. There's no
in-screen "skip" decision anywhere in this flow — branching happens
automatically upstream, from what's compiled in and what's already persisted,
before the user sees a screen.

The hub-and-spoke shape is modeled directly on RockyRoad's own shell: `App.ts`
mounts/unmounts screens into one fixed `#screen-container`, and the persistent
settings modal returns to whatever screen was open, never a forward navigation.

```
                                   ┌──────────────────────┐
                                   │   Aurora daemon boot  │
                                   └───────────┬──────────┘
                                               ▼
                          ┌───────────────────────────────────────┐
                          │ Probe Registry: which Input/Output      │
                          │ plugins are compiled in? (build-time)   │
                          └───────────────────┬───────────────────┘
                                               ▼
                          ┌───────────────────────────────────────┐
                          │ Load persisted state: Config + Hue      │
                          │ Credentials + ZoneMap — all present      │
                          │ and valid?                               │
                          └───────┬───────────────────────┬────────┘
                             ANY MISSING/INVALID       ALL VALID
                                   ▼                         │
                    >1 Output plugin compiled? ──yes──▶ pick which          │
                                 │no (just Hue today)   output(s) to enable │
                                 ▼◀────────────────────────────┘            │
                    ┌─────────────────────────────┐                        │
                    │ 1. OUTPUT CONNECT (per output)│  SKIPPED (returning   │
                    │ Job: discover/enter bridge IP,│  user) if that        │
                    │ push-link pairing, pick        │  output's credentials│
                    │ entertainment config           │  are already valid   │
                    └────────────┬────────────────────┘                    │
                                 ▼                                          │
              audio input compiled AND video input compiled?               │
                    │yes                          │no → auto-pick the      │
                    ▼                              one that exists         │
     ┌───────────────────────────┐      ┌──────────────────────────┐       │
     │ 2a. MODE + DEVICE SELECT  │      │ 2b. DEVICE SELECT ONLY   │       │
     │ Job: video/audio toggle,  │      │ Job: monitor picker      │       │
     │ then monitor (video) or   │      │ only — mode fixed        │       │
     │ sink (audio, Linux only)  │      └────────────┬─────────────┘       │
     └─────────────┬──────────────┘                   │                    │
                   └───────────────┬────────────────────┘                  │
                                   ▼                                       │
                          mode == video?                                  │
                    │yes                          │no (audio)              │
                    ▼                              ▼                       │
     ┌───────────────────────────┐      (no zones screen — audio has       │
     │ 3. ZONE MAPPING           │       no spatial concept at all,        │
     │ Job: drag-resize UV rect  │       hidden the same way the demo      │
     │ per zone, per-zone active,│       hides options that don't apply)   │
     │ gamma                     │                                        │
     └─────────────┬──────────────┘                                       │
      SKIPPED (auto-reconciled) if saved ZoneMap already                  │
      matches live zone IDs (reconcileZoneMap)                            │
                   └──────────────┬──────────────────────────────────────┘
                                  ▼
                    ┌───────────────────────────┐
                    │ 4. TUNING / SETTINGS      │  always reachable
                    │ Job: video knobs OR the   │  later too, not just
                    │ full audio-effect block   │  during onboarding
                    └────────────┬───────────────┘
                                 ▼
                    ┌───────────────────────────┐
                    │ 5. DASHBOARD              │◀── returning user with
                    │ Job: mode toggle, Stop,   │    everything valid
                    │ links back into 1/2/3/4   │    lands here directly
                    └───────┬───┬───┬───┬───────┘
                        re-enter each of 1/2/3/4 from here;
                        each returns straight back to 5 on
                        completion, no forced chain onward
```

## Screen-by-screen: jobs, layout at two widths, and research

### 1. Output Connect

**Job:** get the daemon talking to the physical target — discover or enter a
bridge address, run push-link pairing (a bounded window during which the user
physically presses the bridge's button), surface failure states, and pick among
however many entertainment configurations exist.

**"Entertainment configuration," explained:** a Philips concept, not
huenicorn's or Aurora's. In the official Hue app, a user groups a subset of
lights and gives each a 3D position specifically for the low-latency
Entertainment API (the DTLS streaming path both huenicorn and Aurora use) —
distinct from a normal on/off/brightness "room." A bridge can have more than
one: `output.md` already has this as a filed lesson, an empty-ID auto-select
picking "the first one" isn't safe to treat as the only one. Neither huenicorn
nor Aurora creates or edits these, only the official Hue app does; this screen
only picks among what already exists.

**Layout:**
```
DESKTOP                                                    CONSTRAINED
┌──────────────────────────────────────────┐   ┌────────────────────────────┐
│         Connect to your Hue Bridge  [⚙]  │   │ Connect to your Hue    [⚙] │
│  ────────────────────────────────────     │   │ ──────────────────────      │
│  Bridge address                            │   │ Bridge address              │
│  ┌───────────────────┐ ┌────────────────┐ │   │ ┌────────────────────────┐│
│  │ 192.168.1.42       │ │  Autodetect    │ │   │ │ 192.168.1.42           ││
│  └───────────────────┘ └────────────────┘ │   │ └────────────────────────┘│
│                                             │   │ ┌────────────────────────┐│
│                       ┌────────────────┐  │   │ │      Autodetect         ││
│                       │   Continue      │  │   │ └────────────────────────┘│
│                       └────────────────┘  │   │ ┌────────────────────────┐│
└──────────────────────────────────────────┘   │ │       Continue           ││
                                                 │ └────────────────────────┘│
                                                 └────────────────────────────┘
```
No `← Back` on this screen during first-run — nothing exists yet to return to.
Address input + Autodetect sit side-by-side on desktop, stack full-width on
constrained. Waiting/success/error states (indeterminate "Waiting for you to
press the button…" text, inline "✓ Paired…", inline "⚠ Couldn't reach…") render
the same way at both widths, just full-width text wrap on constrained.

**Cut from the first pass:** a collapsible "I already have credentials
(advanced)" manual-entry fallback, mirroring huenicorn's own field. Huenicorn
built it mainly for migrating an *already-paired* identity to a second
install, not primarily for corruption recovery — Aurora doesn't have an
existing user base with pre-existing credentials to migrate yet, so the field
was solving a problem that can't occur. The corruption-recovery case this was
also worried about is already covered elsewhere at zero added cost: the
Dashboard's Settings modal already has a "Re-pair bridge" action that reruns
this exact same physical-button flow. The one real capability given up by
cutting this is cross-machine credential migration without re-pairing —
accepted as an explicit, deliberate v1 limitation, not an oversight.

**Research:**
- huenicorn's actual `SetupBackend`/`mainSetup.js` flow (`/api/autodetectBridge`
  → `/api/registerNewUser` within a time window → `/api/finishSetup`) is a
  directly reusable *flow shape*, read from its real route/JS source.
- The "waiting on an async call" pattern (label shown while pending, replaced
  with an explicit failure message on rejection) has a concrete precedent in
  RockyRoad's `TunerScreen.ts`: `#tuner-mic-wait`, shown while
  `PitchDetector.create()` is pending, hidden on success, replaced with an
  explicit failure message on rejection.
- Real gap in Aurora today, not just missing UI: both `Aurora-App-Windows` and
  `Aurora-App-Linux`'s `registerOutputs()` require three env vars
  (`AURORA_HUE_BRIDGE_ADDRESS`/`_USERNAME`/`_CLIENTKEY`) set at process start,
  with the code's own comment admitting "no pairing flow exists yet." None of
  `HueOutput`'s real constructor needs are persisted in `Config` today, by
  design. This screen is new persistence plus new plumbing, not a port.

### 2a/2b. Mode + Device Select

**Job:** toggle audio vs video capture (only when both are compiled in), then
pick the concrete device within that mode — a monitor for video, a PipeWire
sink for audio on Linux (Windows audio has no device picker at all, WASAPI
loopback always captures the default sink).

**Layout:**
```
DESKTOP                                                    CONSTRAINED
┌──────────────────────────────────────────┐   ┌────────────────────────────┐
│ ← Back      Capture source         [⚙]   │   │ ← Back  Capture source [⚙] │
│  ┌───────────────┬───────────────┐        │   │ ┌────────────┬───────────┐│
│  │ ▣ Video        │    Audio       │        │   │ │ ▣ Video     │  Audio    ││
│  └───────────────┴───────────────┘        │   │ └────────────┴───────────┘│
│  Monitor ┌──────────────────────┐▾        │   │ Monitor                    │
│          │ Display 1 — 2560x1440│         │   │ ┌────────────────────────┐▾│
│          └──────────────────────┘         │   │ │ Display 1 — 2560x1440 ││
│                       ┌────────────────┐  │   │ └────────────────────────┘│
│                       │     Done        │  │   │ ┌────────────────────────┐│
│                       └────────────────┘  │   │ │         Done             ││
└──────────────────────────────────────────┘   │ └────────────────────────┘│
                                                 └────────────────────────────┘
```

**Cut from the first pass:** the live level meter for the audio sink. Its job
would have been purely confirmatory ("does this device work"), not required to
complete device selection, and it needs new backend wiring (live device-level
data before the pipeline is fully running) to support a nice-to-have. The
Dashboard's own status becomes the actual first real confirmation instead.

**Research:**
- The audio/video toggle needs **no CMake change** to exist as a UI control —
  it's already just two `Config` string fields
  (`Aurora-App-Windows/src/main.cpp:141-144`'s `useAudioMode` derivation,
  confirmed identical in the Linux app). CMake flags only gate whether a
  plugin is compiled into the binary at all, not an either/or design split.
- `RockyRoad`'s `TunerScreen.ts` (read in full) is a strong template for the
  device-select half regardless of the level-meter cut: it enumerates devices
  into a `<select>` and recreates the underlying processor on change. One
  thing doesn't transfer literally: it calls
  `navigator.mediaDevices.enumerateDevices()` directly in the browser, but
  Aurora's audio device is a PipeWire sink on the daemon's own machine, so the
  device list has to come from a new REST endpoint instead.

### 3. Zone Mapping

**Job:** show a preview, overlay each output zone as a draggable/resizable
rectangle, toggle each active/inactive inline, and set a per-zone gamma.

**Layout — one design at both widths, not a fork:**
```
                    ┌──────────────────────────────────┐
                    │┌──────┬──────┬──────┐            │
                    ││ 1 ☑  │ 2 ☑  │ 3 ☑  │            │
                    │├──────┼──────┼──────┤            │
                    ││ 4 ☑  │      │ 5 ☑  │            │
                    │├──────┼──────┼──────┤            │
                    ││ 6 ☑  │ 7 ☑  │ 8 ☐  │            │
                    │└──────┴──────┴──────┘            │
                    └──────────────────────────────────┘
                    Selected: Zone 2   Gamma ●───○── 0.4
```
Header: `← Back   Zone mapping   Save [⚙]` at both widths.

The first pass had drawn a fork here (a "one zone at a time" pager for
constrained width, reusing RockyRoad's `.speed-group` stepper), reasoning from
RockyRoad's XR panel needing bigger/simpler drag targets in a tight, fixed
space. Checked the actual numbers before keeping that: Aurora's real zone
count is small (8 for the 3×3 scheme, likely single digits for a room-fixture
map), and a phone in portrait gives a full-width canvas around 360–400px, a
3-column grid puts each cell around 120px wide, well above the ~44–48px
minimum touch target. The fork isn't justified at today's actual zone counts.
It's kept on file as a **documented fallback only**: if a future zone scheme
ever pushes the count high enough that cells get too small to drag reliably,
reintroduce the `.speed-group`-based pager (`◂ Zone N of M ▸` plus a single
enlarged rect) rather than redesigning from scratch.

**Cut from the first pass:** the separate active/inactive two-list panel.
Huenicorn's two-bucket drag-and-drop list solves "which of many possibly
registered bridge lights should be used at all," an open-ended membership
problem. Aurora's zone count is fixed by the capture scheme, so "active" is
just a per-zone on/off flag on an already-fixed set — a toggle directly on
each zone's own rectangle does the same job without a second UI surface, and
avoids porting huenicorn's native HTML5 drag-and-drop at all (confirmed
directly in `WebUI.js`: `<p draggable=true>` + `dataTransfer`), which is
touch-fragile in any case.

**Research:**
- Aurora's own `ZoneConfig` (`zoneId`, `uvs` min/max rect, `active`, `gamma`)
  is structurally identical to huenicorn's per-channel model.
- Read huenicorn's actual `webroot/ScreenWidget.js` and `WebUI.js` directly,
  not a secondhand summary. `ScreenWidget.js`'s `Handle`/`GammaHandle`/
  `Rectangle` classes already do exactly what `ZoneConfig` needs — drag a
  corner, clamp and snap to the subsample grid, notify a UV update, live
  percent-size label, dimmed preview overlay of every other active zone
  (`showPreview()`). Two real gaps worth fixing while porting: it's mouse-only
  (`mousedown`/`mousemove`/`mouseup`, no touch at all — port to the Pointer
  Events API instead), and its gamma control is a second hand-rolled SVG
  drag-slider, more code than a native `<input type="range">` needs.
- huenicorn's `_toggleAdvancedDisplay`/`advancedSettingsCheckbox` (a checkbox
  toggling `display:block/none`, confirmed directly, no chevron/animation) and
  its `Legends.noChannel`/`pleaseDrag`/`pleaseSelect` empty-state strings are
  real, minimal, working precedent for this screen's own empty state (no
  channels registered on the bridge yet).
- Nothing in RockyRoad fits the drag-rect job itself. It has no UV-drag-rect
  widget anywhere — this piece leans entirely on huenicorn.

### 4. Tuning / Settings

**Job:** expose the numeric knobs for whichever mode is active — ~4 for video
(`refreshRate`, `subsampleWidth`, `interpolation`, `transitionSmoothing`), ~11
for audio (the full `AudioEffectSettings` block, plus `audioTargetSinkName` on
Linux) — without dumping all of them on screen at once.

**Layout:**
```
DESKTOP — 2-up per section                              CONSTRAINED — 1-up
┌──────────────────────────────────────────┐   ┌────────────────────────────┐
│ ← Back    Settings — Audio        [⚙]   │   │ ← Back  Settings — A. [⚙] │
│  ──────────────────                        │   │ ─────────────────          │
│  Response speed                            │   │ Response speed              │
│  Bounce smooth  ●──○── 0.12s  Brightness   │   │ Bounce smooth time          │
│                          ●○── 0.08s        │   │ ●──○────────────── 0.12s    │
│  Drift base rate ●────○── 14°/s           │   │ Brightness smooth time      │
│                                             │   │ ●○────────────────  0.08s   │
│  Color character                           │   │ Drift base rate             │
│  Vibrancy sat  ●───○── 0.95  Vibrancy val  │   │ ●────○─────────────  14°/s  │
│                          ●───○── 0.95      │   │  …                          │
│  Fixed anchor hue  ☐ Use fixed hue        │   └────────────────────────────┘
└──────────────────────────────────────────┘
```
Label moves above the track instead of beside it whenever a row can't fit
label+track+value on one line.

**Cut from the first pass:** tabs for the three named groups (response
speed / color character / sensitivity). At ~11 fields total, tabs solve a
scrolling problem that doesn't really exist at this scale, for real
interaction cost (tap targets, extra state). A single scrollable column with
plain section headings (the same heading+divider treatment as screen 1, no new
interactive component) does the grouping job just as well. This is
threshold-dependent, not permanently settled — if the audio tuning block grows
substantially, tabs are worth reconsidering.

**Research:**
- huenicorn's own "Advanced settings" collapsible (confirmed above, a plain
  checkbox) solves this for its own ~4-field surface; Aurora's block is
  roughly triple that, so grouping matters more here, just not via tabs.
- `RockyRoadImport/SongConverter/index.html` (checked directly after being
  flagged as overlooked, not RockyRoad's own gameplay UI) is the strongest
  single precedent for this screen: consistently styled text/number inputs, a
  native `<input type="range">` with `accent-color` instead of a custom
  slider, a disabled-button state, and a bordered warning card
  (`#hand-disclaimer`) for caveats like "entertainment configs must be created
  in the official Hue app first."
- The 2-column desktop grid reuses RockyRoad Library's `.lib-grid`
  `auto-fill` technique (verified real), just applied to sliders instead of
  song cards, not a new mechanism.
- `TunerScreen.ts`'s gain-slider-plus-live-readout pattern is the right
  micro-component to repeat for every slider here.

### 5. Dashboard

**Job (reduced from the first pass):** offer the quick mode toggle, Stop, and
entry points back into every other screen.

**Deferred out of v1 entirely (per this round's discussion):** the live
MJPEG/SSE preview and the per-zone color swatch row. Both were video-mode-only
(audio mode has no source frame to preview and, since `AudioOrchestrator`
broadcasts one color to every zone by design, would need a single swatch, not
a row, if ever built) and neither is required for the Dashboard's actual job —
confirming the pipeline is alive and giving quick controls. This is a real
feature cut, not just a layout simplification: it removes the MJPEG/SSE
consumption work from this milestone's browser-side scope entirely, though the
native-side endpoints themselves are unaffected (still worth building per
`ImplementationPlan.md`, just not consumed by this Dashboard screen yet).

**Layout:**
```
DESKTOP                                                    CONSTRAINED
┌──────────────────────────────────────────┐   ┌────────────────────────────┐
│      Aurora           [● Streaming][⚙]  │   │  Aurora     [● Streaming][⚙]│
│  ┌───────────────┬──────┐┌────┐┌──────┐  │   │ ┌────────────┬───────────┐│
│  │ ▣Video │ Audio │  │⏸ ││Stop│         │   │ │ ▣ Video     │  Audio    ││
│  └───────────────┴──────┘└────┘└──────┘  │   │ └────────────┴───────────┘│
│  Bridge — Connected                   › │   │ ┌────────┐ ┌─────────────┐│
│  Zones — 7 active                      › │   │ │   ⏸    │ │    Stop      ││
│  Tuning — Adjust                        › │   │ └────────┘ └─────────────┘│
└──────────────────────────────────────────┘   │ Bridge — Connected      › │
                                                 │ Zones — 7 active         ›│
                                                 │ Tuning — Adjust           ›│
                                                 └────────────────────────────┘
```
Stop click → confirm overlay, replicated close to verbatim from huenicorn's
own real logic (see Research below), not the earlier speculative Pause+Stop
pairing — Pause is cut for v1 entirely, since `Orchestrator` has no concept of
holding without exiting its loop and would be new backend work, not a UI
addition.

**Cut from the first pass:** the card-tile grid for navigation (`Bridge` /
`Zones` / `Tuning` as three boxed tiles). Three plain links with no imagery
were borrowing Library's rich, thumbnail-driven browsing pattern for a job
that's really just navigation — a row list (reusing the same row shell as
screen 3's zone rows, label + status + trailing chevron) does the same job
more simply.

**Research:**
- **Stop**, confirmed directly in `WebUI.js`: `stopButton` opens a confirm
  overlay (`_askStopConfirmation()`, showing confirm/cancel sections),
  `_stop()` POSTs `/api/stop`, then swaps to a "stopped" info section on
  success. Directly portable, close to verbatim.
- RockyRoad's shell (`App.ts` + `#settings-btn`/`#settings-overlay`) remains
  the direct template for the hub-and-spoke navigation this screen anchors.
- Status badge: RockyRoad Library's `.lib-badge`/`.badge-lead` (small colored
  rounded-corner text pill), verified real, reused for the connection-status
  indicator, kept only on this screen (cut from screens 1–4 last round —
  those already have their own more specific in-context feedback, a generic
  pill there was redundant).
- Nav row: RockyRoad's `.pre-toggle-row` shell (label left, content right,
  bottom border, `:last-child` border removed), verified real, adapted with a
  trailing chevron in place of the switch — the chevron glyph is the only
  genuinely new piece.

## Final component inventory

| Component | Screens | Source / status | Gap |
|---|---|---|---|
| Shell: top bar with centered title, back link, settings gear | all | RockyRoad `#settings-btn`/overlay/scrim, verified; title placement is new but trivial | Small |
| Centered max-width column | all | `RockyRoadImport`: `#app{max-width:640px}` | None |
| Text input + button row | 1 | `RockyRoadImport` input + `.btn-primary` | Small |
| Indeterminate waiting message | 1 | huenicorn `_showLoading`, RockyRoad `#tuner-mic-wait` | None |
| Inline success/error text | 1, 3 | RockyRoad `.tuner-check`, `RockyRoadImport` `#hand-disclaimer` | Small |
| Dropdown | 1, 2 | RockyRoad `Dropdown.ts` (kept deliberately for WebXR/touch reasons over a native `<select>`, which remains strictly better on ordinary keyboard/ARIA grounds) | Small–Medium: missing `aria-haspopup`/`aria-expanded`, `role=listbox/option`, arrow-key nav, Escape-to-close, managed focus |
| Segmented 2-option toggle | 2, 5 | `RockyRoadImport` `.tab-btn`, generalized to 2 | Small |
| Section heading + divider | 1, 4 | `RockyRoadImport` `<h2>` + `.tab-panel::before` | Small |
| Draggable zone rect + corner handles | 3 | huenicorn `ScreenWidget.js`, read in full | Medium — proven logic, needs a Pointer Events rewrite for touch |
| Per-zone inline active toggle | 3 | Assembly of two proven pieces (checkbox + absolute position) | Small |
| Zone pager (`◂ N of M ▸`) | 3 — **documented fallback only, not built for v1** | RockyRoad `.speed-group` compound stepper | Small, deferred until zone count justifies it |
| Gamma slider | 3 | Native `<input type=range>` | None |
| Empty-state text | 3 | huenicorn `ScreenWidget.js`: `Legends` strings | Small |
| Slider + live readout, 2-col grid on desktop | 4 | RockyRoad tuner gain slider + `RockyRoadImport` range + Library's `auto-fill` grid | Small, plus one open decision: accent-color token conflict (`#2a6eff` vs `#8b8b8b`) needs settling before building |
| Boolean checkbox | 4 | RockyRoad `.pre-toggle-switch` | None |
| Segmented mode toggle + Stop + confirm overlay | 5 | huenicorn `WebUI.js`: `_askStopConfirmation()`/`_stop()`, near-verbatim | None |
| Status badge | 5 only | RockyRoad Library `.lib-badge` | Small |
| Nav row (label + status + chevron) | 5 | RockyRoad `.pre-toggle-row` shell + new chevron glyph | Small |
| ~~Live preview~~ | **cut from v1** | N/A | Deferred, not a gap |
| ~~Per-zone color swatch row~~ | **cut from v1** | N/A | Deferred, not a gap |
| ~~Live level meter~~ | **cut from v1** (screen 2) | N/A | Deferred, not a gap |
| ~~Manual-credentials fallback~~ | **cut from v1** (screen 1) | N/A | Superseded by the existing "Re-pair bridge" Settings action |
| ~~Active/inactive two-list panel~~ | **cut from v1** (screen 3) | N/A | Superseded by per-zone inline toggle |
| ~~Settings tabs~~ | **cut from v1** (screen 4) | N/A | Superseded by plain section headings |
| ~~Card-tile nav grid~~ | **cut from v1** (screen 5) | N/A | Superseded by nav rows |

Almost everything remaining is **Small** or **None**. The two real pieces of
engineering left, not styling, are the zone-drag touch rewrite and the
dropdown's ARIA/keyboard work — both already known, nothing new surfaced in
this pass. Everything else in the inventory is a verified, token-traceable
reuse of something that already exists in huenicorn, RockyRoad, or
`RockyRoadImport`.

## Cross-cutting findings

**Design tokens: real drift exists, and the codebase has no structural
protection against it.** Compared RockyRoad's actual current shell CSS
(`v2/desktop.html`'s inline `<style>`, the real source) against
`TunerScreen.ts`'s own rules directly. The settings overlay is in sync with
the shared XR tokens (`#dadada`→`#bebebe`, `12px`/`6px` radii, matching
`panel.css`'s `.button.primary-light`). `TunerScreen` uses a completely
separate ad hoc system (translucent-white overlays, a `#2a6eff` blue accent
absent from `panel.css` entirely). `RockyRoadImport/SongConverter`'s own CSS
comment claims its range-slider accent "matches the Tuner's gain slider," but
Tuner's slider actually uses the blue, not the gray this file uses — a second,
independent piece of evidence that even RockyRoad's own authors' mental model
of consistency has drifted from the actual CSS at least once. There's no
shared token file anywhere connecting `desktop.html`'s inline styles to the
`.css` files `src/xr/index.ts` imports. **For Aurora: define real CSS custom
properties once (colors, radii, spacing scale) and have every screen reference
the same variables**, rather than repeating this copy-by-convention approach.

**Mouse/touch scaling to XR, and the "author twice" pattern.** RockyRoad
depends on `@pmndrs/pointer-events` ("framework agnostic pointer-events
implementation for threejs," confirmed via its own `package.json`), which
normalizes mouse, touch, and WebXR-controller-ray input into one pointer-event
model — but only for elements rendered as 3D uikit panels inside the Three.js
scene. It has no bearing on plain page DOM. A DOM screen built with the
standard Pointer Events API scales correctly to touch on a flat page and would
keep working inside a WebXR session's `domOverlay`, but does **not** extend to
a true in-scene, ray-interactable uikit panel — that needs the same second
authoring pass RockyRoad already does for every one of its own screens
(`Dropdown.ts` for desktop, `OptionDropdown.ts` + `@pmndrs/pointer-events` for
XR). Plan for that second pass explicitly whenever phase 4 wants a true
in-scene dashboard rather than a flat `domOverlay`.

**HTTPS is available cheaply if/when phase 4 needs it.** cpp-httplib
`v0.46.0` (huenicorn's exact pinned fetch version) already implements
`CPPHTTPLIB_MBEDTLS_SUPPORT`, and huenicorn already links
`mbedtls`/`mbedx509`/`mbedcrypto` for its DTLS bridge client — serving real
HTTPS costs a compile define and a cert, not a new dependency. WebXR requires
a secure context; localhost is exempt, but a real headset hitting the daemon
over LAN by IP is not localhost and needs a genuinely trusted cert — the
remaining gap is cert-trust *distribution*, which Vite's `vite-plugin-mkcert`
automates in RockyRoad's dev setup and cpp-httplib has no built-in equivalent
for.

**Live reload: nothing watches the config file today.** Everything (`Config`,
`ZoneMap` via `reconcileZoneMap`, called only inside `Orchestrator::init()`) is
derived once at process start. No `SIGHUP`/inotify/watch mechanism exists
anywhere in the repo. Recommend one generic reload entrypoint (reload `Config`
+ `ZoneMapStore`, tear down and reconstruct Input/Output/Orchestrator) that
every settings PUT funnels into, rather than special-casing the mode toggle
alone.

## Decisions log (this round)

- Zone Mapping ships as one design at all widths; the one-zone-at-a-time pager
  is documented as a fallback, not built, until a real zone count actually
  makes handle spacing a problem.
- Credentials-corruption recovery needs no new UI — the "Re-pair bridge"
  Settings action already covers it. Cross-machine credential migration
  without re-pairing is an accepted, explicit v1 gap, not silently dropped.
- Live preview and the per-zone swatch row are deferred out of v1 entirely
  (video-mode-only, and not required for the Dashboard's core job). Native-side
  MJPEG/SSE endpoints from `ImplementationPlan.md` are unaffected — they're
  just not consumed by this Dashboard yet.

## Build order

Sequenced by actual dependency, not by the screen numbering used above — a
screen can't be usefully built before the backend surface and shell pieces it
depends on exist. Preview streaming, which `ImplementationPlan.md` lists first
among Milestone 2's "three native surfaces," is intentionally pushed to the
end here, since nothing in v1 consumes it (see Decisions log above).

**1. Backend foundation**
1. ~~`Analysis/HttpServerAnalysis.md`~~ — **done (2026-09-15)**. Confirmed
   huenicorn's server is a genuinely generic, transport-agnostic abstraction
   worth adopting near-verbatim, that it needs its own dedicated thread
   separate from the tick loop (huenicorn's own `Runtime::_initWebUI`
   pattern), and that Aurora's planned full-pipeline-reconstruction design
   (unlike huenicorn's in-place mutation) needs one consistent lock around a
   swappable pipeline unit, not huenicorn's narrower single-mutex approach.
2. ~~New HTTP server skeleton~~ — **written (2026-09-15)**: `core/Network`
   (`Aurora::Network::Http::Server`), a near-verbatim port of huenicorn's
   `HttpServer`/`Impl`/`HttpDataStructs` shape plus `serveStaticFiles()` atop
   cpp-httplib's own mount-point support, in the new shared `core/` module
   `HttpServerAnalysis.md` called for (not duplicated per app repo). Compiles
   and links cleanly as a library (`AuroraNetwork.lib`, confirmed via a real
   build). Its Catch2 tests (`core/tests/NetworkTests.cpp` — a route
   round-trip, a path-param/body round-trip, and static-file serving, each
   over a real bound socket) are written but **not yet executed**: linking
   any test binary in this environment currently fails on a pre-existing,
   environment-wide issue unrelated to this module (a stale vcpkg-cached
   `Catch2d.lib` ABI-incompatible with this machine's Windows SDK/MSVC
   toolset — confirmed by the same failure on an untouched pre-existing test
   target; see `engineering-hygiene.md`'s new entry). Fixing that needs a real
   from-source rebuild of the vcpkg manifest (binary-cache bypass), not
   attempted here as out of scope for this step.
3. A `/api/capabilities`-style endpoint reflecting the Registry (what
   Input/Output plugins are actually compiled in) — the frontend's
   capability-probe step needs this before anything else.
4. Hue credential persistence (new `Config` fields or a sibling
   `credentials.json`, mirroring huenicorn's own file split) + update
   `registerOutputs()` to read from it first, env vars staying as a dev-only
   fallback.
5. Pairing endpoints (autodetect/validate/register/finish, entertainment-config
   list/select), modeled directly on huenicorn's `SetupBackend`.

**2. Frontend foundation (shell, no real screens yet)**
6. Settle the accent-color token conflict (`#2a6eff` vs `#8b8b8b`) and define
   real CSS custom properties (colors, radii, spacing) once — this blocks
   every screen's styling, cheaper to settle before anything is built against
   the wrong token.
7. App shell: the `#screen-container`-style mount point, the top bar formula
   (back/title/gear), the settings modal + scrim.
8. Port `Dropdown.ts` and close its ARIA/keyboard punch list once, up front
   (`aria-haspopup`/`aria-expanded`, `role=listbox/option`, arrow-key nav,
   Escape, focus management) — it's used on screens 1 and 2, fixing it once
   here is cheaper than fixing it twice later.
9. A bare Dashboard shell: nav rows only (Bridge/Zones/Tuning, no mode toggle
   or Stop yet), wired to the capability-probe/persisted-state routing logic.
   Built early and mostly empty on purpose — gives every screen after this a
   real place to be linked into and manually reached as it's finished, rather
   than only reachable via a dev shortcut until the whole flow is done.

**3. Screens, in dependency order**
10. **Output Connect** — the first real screen, and the first full vertical
    slice through the whole stack (server, credential persistence, pairing
    endpoints, Dropdown, waiting/error states). Proves the plumbing before
    investing in the rest.
11. **Backend:** generic settings REST endpoints over `Config`'s user-facing
    fields, plus the one generic reload entrypoint (tear down and reconstruct
    Input/Output/Orchestrator from a freshly-loaded `Config`+`ZoneMapStore`)
    that every one of them funnels into, plus monitor/sink listing endpoints.
12. **Mode + Device Select** — needs step 11.
13. **Tuning/Settings** — also only needs step 11, not zone data. Can be built
    in parallel with Zone Mapping below rather than strictly after it.
14. **Backend:** `ZoneMap` REST endpoints (list with live-reconciled state,
    set UV rect, set gamma, set active) atop the existing `reconcileZoneMap`.
15. **Zone Mapping** — the heaviest remaining lift (the `ScreenWidget.js` port
    plus its Pointer Events rewrite for touch). Build after Output Connect and
    Mode+Device exist, since it needs a real paired output and video mode
    selected to have anything real to test against.
16. **Backend:** the Stop endpoint, close to a verbatim port of huenicorn's
    `_askStopConfirmation()`/`_stop()`.
17. **Dashboard, filled in:** add the mode toggle and Stop button to the shell
    built in step 9, now that their endpoints exist. This is the natural last
    piece, not because it's hard, but because everything it links to and
    controls needs to already exist first.

**4. Wiring and polish**
18. Wire the full first-run-vs-returning-user routing end to end across all 5
    screens (each screen up to now can be reached and tested individually via
    the Dashboard shell from step 9).
19. A real desktop-vs-constrained QA pass per screen.

**Deliberately last, not first:** the MJPEG+SSE preview streaming endpoints.
Worth building only if the live-preview cut gets revisited, not as a
prerequisite for anything above.
