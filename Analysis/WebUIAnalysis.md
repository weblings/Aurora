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
| Dropdown | 1, 2 | RockyRoad `Dropdown.ts`, ported with its ARIA/keyboard gaps closed — see build-order step 8 | None |
| Segmented 2-option toggle | 2, 5 | `RockyRoadImport` `.tab-btn`, generalized to 2 -- built in `forms.css` for step 12, screen 5 reuses it unchanged in step 17 | None |
| Section heading + divider | 4 | `RockyRoadImport` `<h2>` + `.tab-panel::before`, built in `forms.css` for step 13 | None — corrected from "1, 4": Output Connect (step 10) never actually used a heading, verified by reading its finished source before this row was next referenced |
| Draggable zone rect + corner handles | 3 | huenicorn `ScreenWidget.js`, read in full | Medium — proven logic, needs a Pointer Events rewrite for touch |
| Per-zone inline active toggle | 3 | Assembly of two proven pieces (checkbox + absolute position) | Small |
| Zone pager (`◂ N of M ▸`) | 3 — **documented fallback only, not built for v1** | RockyRoad `.speed-group` compound stepper | Small, deferred until zone count justifies it |
| Gamma slider | 3 | Native `<input type=range>` | None |
| Empty-state text | 3 | huenicorn `ScreenWidget.js`: `Legends` strings | Small |
| Slider + live readout, 2-col grid on desktop | 4 | RockyRoad tuner gain slider (adapted to a full-width vertical layout, not the source's fixed-narrow horizontal one) + Library's `.lib-grid` `auto-fit` technique, built for step 13 | None |
| Boolean checkbox | 4 | RockyRoad `.pre-toggle-switch`, built in `forms.css` for step 13 | None |
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

**Design tokens: real drift exists, but narrower than an earlier pass here
claimed — corrected 2026-09-15 after actually reading `desktop.html` and
`RockyRoadImport/SongConverter/index.html` directly instead of relying on a
prior summary.** The grayscale system is genuinely consistent and reused
throughout both repos: `#333333`/`#515151`/`#7c7c7c` (dark button + hover/
active), `#dadada`/`#bebebe`/`#9c9c9c` (light button + hover/active), and
`#8b8b8b` reused specifically as *the* interactive/active-state color —
slider `accent-color` (`.tuner-gain-slider`, and `RockyRoadImport`'s own
`input[type=range]`), a checked toggle-switch knob (`.pre-toggle-switch input:
checked + .pre-toggle-knob`), and `panel.css`'s `.secondary-dark` button.
`RockyRoadImport`'s comment claiming its range-slider accent "matches the
Tuner's gain slider" is **correct**, not a second piece of drift evidence as
an earlier pass here claimed — both really are `#8b8b8b`. The one genuine
outlier is `.tuner-exit-btn`'s `#2a6eff`/`#1a5ee0` — a conditionally-rendered
secondary "Done" button on the tuner-complete overlay, used nowhere else in
either repo, not part of the system. There's no shared token file anywhere
connecting `desktop.html`'s inline styles to the `.css` files `src/xr/
index.ts` imports, so nothing structurally prevents a future one-off like
`#2a6eff` from happening again. **For Aurora: define real CSS custom
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
- Aurora's design tokens are grayscale-only, no brand accent — `#8b8b8b`
  already carries the interactive/active-state role in RockyRoad's proven
  system, and a second, arbitrary UI color felt more likely to compete with
  Aurora's actual RGB lighting output than to clarify anything.
- The shared static frontend lives in its own new repo (`Aurora-WebUI`), not
  inside `core` or duplicated per app — justified by toolchain hygiene (future
  frontend build tooling shouldn't live in a CMake/vcpkg repo), not by the
  technical-independence reasoning behind the Input/Output splits. Wired as a
  required dependency in both apps, not an optional/gated one.

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
   over a real bound socket) compiled cleanly but couldn't initially be *run*
   natively on Windows: linking any test binary in this environment hits a
   pre-existing, environment-wide issue unrelated to this module (a stale
   vcpkg-cached `Catch2d.lib` ABI-incompatible with this machine's Windows
   SDK/MSVC toolset — confirmed by the same failure on an untouched
   pre-existing test target; see `engineering-hygiene.md`'s entry). Fixing
   that natively needs a real from-source rebuild of the vcpkg manifest
   (binary-cache bypass), still not attempted as out of scope. **Actually
   executed for real during step 5** instead, via WSL2/GCC (no Catch2 ABI
   issue there) once `AuroraNetwork` had a real second consumer
   (`Aurora-Output-Hue`'s new `PairingRoutes.cpp`) to build against: all 3
   cases passed, 12 assertions.
3. ~~A `/api/capabilities`-style endpoint~~ — **done (2026-09-15)**: added to
   both `Aurora-App-Windows` and `Aurora-App-Linux`'s `main.cpp` (route logic
   duplicated per app, matching the existing `Registry`/`registerInputs`/
   `registerOutputs` convention — `Registry` itself is a byte-identical
   duplicated header across both app repos already, confirmed by `diff`, so
   this isn't a new inconsistency). Also wired the server's actual lifecycle
   in for the first time: bind on load, `listen()` on its own thread
   (`HttpServerAnalysis.md`'s documented model), stopped after outputs shut
   down. Building this surfaced a real bug before it shipped: the first pass
   used a bare `std::thread`, stopped only at the tail of `main()` — the
   pre-existing "no outputs available" early return skips that tail
   entirely, and `std::thread::~thread()` calls `std::terminate()` on a
   still-joinable thread, so that path would have aborted the whole process.
   Fixed with a small RAII wrapper whose destructor stops and joins
   unconditionally. Verified for real on both platforms: built via MSVC and
   via WSL2/GCC, ran each binary, confirmed the endpoint's real JSON
   response, and confirmed clean shutdown on both the early-return path
   (Windows) and a real `SIGTERM` (Linux).
4. ~~Hue credential persistence~~ — **done (2026-09-15)**, and the "new
   `Config` fields or a sibling file" question this line left open resolved
   itself once `Config.hpp`'s own header comment was actually read: "output-
   specific state (bridge credentials, zone maps) lives in each plugin's own
   scope, never here" — a deliberate, pre-existing architectural rule, not
   an oversight to route around. That rules out new `Config` fields outright.
   Built `Aurora::Output::Hue::CredentialsStore` in `Aurora-Output-Hue`
   itself instead, mirroring `ZoneMapStore`'s own exact shape (a small
   `explicit Store(configRoot)` class, `<configRoot>/hue-credentials.json`)
   rather than a generic core-owned file, since credentials are exactly the
   kind of "each plugin's own scope" state that comment describes. Persists
   `bridgeAddress`/`username`/`clientkey`/`entertainmentConfigurationId` as
   one JSON object; `HueConnection::isConfigured()` gates whether the `hue`
   output gets registered at all, same as before. `registerOutputs()` in
   both apps now checks the store first and only falls back to the env vars
   when it's empty — a persisted connection always wins if both are set, so
   env vars are a true dev-only fallback, not a second equally-valid source.
   Verified with real unit tests (round-trip, missing-file default, corrupt-
   file default, `isConfigured()`'s exact gating) run via WSL2, and with a
   real precedence test on both platforms (a persisted file plus
   deliberately-different env vars set simultaneously, confirming the output
   still registers via the persisted path).
5. ~~Pairing endpoints~~ — **done (2026-09-15)**: `Aurora::Output::Hue::
   registerPairingRoutes` in `Aurora-Output-Hue` (`PairingRoutes.hpp`/`.cpp`),
   called from both apps' `main.cpp` right next to `registerCapabilitiesRoute`,
   guarded by the same `AURORA_OUTPUT_HUE_IO_AVAILABLE` macro as `HueOutput`
   itself. Routes: `GET /api/hue/discover` (proxies meethue.com, same as
   `ApiTools::autodetectedBridge()`), `GET /api/hue/connection` (persisted
   status, credentials withheld), `PUT /api/hue/validate` (bridge reachability
   via `/api/0/config`), `PUT /api/hue/register` (parses the bridge's
   one-element array response into `succeeded`/`username`/`clientkey` or
   `link_button_not_pressed`/`bridge_error`), `PUT
   /api/hue/entertainment-configurations` (list), `POST /api/hue/connection`
   (the one persisting call, via `CredentialsStore`). One real design fork
   from huenicorn: **stateless**, not session-based — huenicorn's
   `CoreService` holds pairing-in-progress state (bridge address, username,
   clientkey) across separate WebUI calls; here each request carries
   whatever it needs in its own body, so there's no in-memory "pairing
   session" object to design, invalidate, or leak. Composed entirely from
   existing `ApiTools`/`HttpClient`/`BridgeAddress`/`CredentialsStore` --
   no new bridge-facing I/O was needed, only the route layer and JSON
   marshalling. This is also the first thing in this plugin to depend on
   `core`'s `AuroraNetwork` module (linked in the existing IO-gated CMake
   block). Verified for real on both platforms: built via MSVC and WSL2/GCC,
   ran each binary with dummy env-var credentials to reach the tick loop,
   and curled every route -- confirmed `validate`/`register` degrade to
   `{"succeeded":false,"error":"unreachable"}` against an unroutable address,
   `entertainment-configurations` degrades to an empty list on the same,
   `POST /api/hue/connection` rejects an incomplete body and persists a
   complete one (confirmed by reading the resulting `hue-credentials.json`
   back off disk and by `GET /api/hue/connection` reflecting it), and a
   malformed JSON body returns a clean 400 rather than crashing the handler.
   Building this also closed out step 2's one open item: with `AuroraNetwork`
   now proven by a real consumer, `core/tests/NetworkTests.cpp` was finally
   *run* (not just compiled) via WSL2/GCC, sidestepping the native-Windows
   Catch2/ABI issue entirely -- all 3 cases passed (12 assertions).

**2. Frontend foundation (shell, no real screens yet)**
6. ~~Settle the accent-color token conflict and define real CSS custom
   properties~~ — **done (2026-09-15)**. Re-reading `desktop.html`/
   `RockyRoadImport` directly (not the earlier summary) first corrected the
   finding itself — see the Cross-cutting findings entry above: `#8b8b8b` is
   already the real, consistently-reused interactive/active-state color
   (sliders, checked toggles, secondary buttons); `#2a6eff` is a genuine but
   narrow one-off (one conditional button, one screen). Decision, discussed
   with the user rather than assumed: Aurora's tokens go **grayscale-only**,
   no brand accent — `#8b8b8b` already fills that role, and Aurora is a
   lighting-control product where introducing a second, arbitrary UI color
   alongside the actual RGB lighting output being controlled seemed more
   likely to compete visually than clarify anything.
   <br><br>
   Also settled, since defining tokens meant deciding where they'd actually
   live: **`Aurora-WebUI` is a new sibling repo**, not a directory inside
   `core` or a per-app `webroot/`. Reasoning (discussed with the user): unlike
   Input/Output's repo splits, which exist for a *technical* reason
   (independently skippable dependencies, per-platform/vendor SDKs), the
   WebUI is byte-identical for both apps and needs no C++ dependencies at
   all — its own split is justified by toolchain hygiene instead (it will
   eventually need real frontend tooling for phase 4's WebXR/uikit pass, per
   `ImplementationPlan.md`, which has no business living inside a CMake/vcpkg
   repo). Wired as a **required** dependency in both apps (unconditional
   `FetchContent_Declare`/`MakeAvailable`, no `ENABLE_`-style toggle like
   Hue's IO gate) — reflecting that this is the product's one control
   surface, not a swappable plugin. Confirmed via CMake's own docs that
   `FetchContent_MakeAvailable` on a source tree with no `CMakeLists.txt`
   just populates it and skips `add_subdirectory()` without erroring — no
   need for the deprecated standalone `FetchContent_Populate`. The fetched
   `SOURCE_DIR` is baked into each app as a compile definition
   (`AURORA_WEBUI_SOURCE_DIR`) and handed straight to `HttpServer::
   serveStaticFiles()`; explicitly a dev-stage placeholder, same as
   `HttpServer.hpp`'s own comment already flagged (a real install/embed story
   like huenicorn's release-build webroot embedding is out of scope for now).
   <br><br>
   One real finding from wiring static files and API routes together for the
   first time: read cpp-httplib's actual `Server::routing()` source rather
   than assuming, since `serveStaticFiles()` and the pairing/capabilities
   routes had never been exercised together before this step. Confirmed the
   static mount point is checked *before* dispatching to a registered GET/
   HEAD handler — safe only because Aurora-WebUI's own files never collide
   with an `/api/...` path. Documented as a hard rule in `Aurora-WebUI`'s
   README (never add a file under `api/` there) rather than leaving it as an
   implicit assumption.
   <br><br>
   Verified for real on both platforms: created `Aurora-WebUI` (git-inited,
   GPL-3.0 matching `Aurora-Output-Hue`'s own lineage reasoning, `styles/
   tokens.css` with the settled values), wired the `FetchContent`+
   `serveStaticFiles()` plumbing into both apps' `CMakeLists.txt`/`main.cpp`,
   built via MSVC and WSL2/GCC, and curled both binaries — confirmed
   `tokens.css` serves its real content, `/api/capabilities` and
   `/api/hue/connection` still answer correctly alongside it, and a
   nonexistent static path correctly 404s rather than falling through to a
   route.
7. ~~App shell~~ — **done (2026-09-15)**, in the new `Aurora-WebUI` repo:
   `index.html` (page skeleton: `#screen-container` mount point + the
   settings overlay/scrim/panel markup), `shell.css` (page reset, the
   scrollbar-gutter fix, centered max-width column, top bar, and the settings
   modal — all referencing `tokens.css`'s variables, zero literal hex),
   `shell.js` (an `App` class: `navigate()` unmounts the current screen then
   mounts the next into `#screen-container`, `openSettings()`/
   `closeSettings()` toggle the overlay — trimmed way down from RockyRoad's
   own `App.ts`, which carries a renderer, song pause/resume, a countdown
   overlay, and per-instrument settings sections that don't apply here), and
   `topBar.js` (a `renderTopBar()` helper — the one reusable piece that
   enforces "one top bar formula, everywhere" structurally instead of by
   convention, the same problem `tokens.css` solves for colors). The title is
   absolutely centered within the bar rather than flex-centered between the
   side slots, since those slots are rarely equal width (no Back vs.
   Back+gear vs. pill+gear) and flex centering would visibly drift the title
   depending on which is present. Settings-modal *content* is deliberately
   empty for now (`#settings-body`) — actions like "Re-pair bridge" land
   there once the screen that needs them exists, matching the Dashboard's own
   "bare shell, built early" precedent (step 9).
   <br><br>
   Verified two ways, since no browser-automation tool exists in this
   environment: real DOM behavior was exercised with `jsdom` (installed only
   in the session scratchpad, not this repo — a test-only dependency, same
   relationship Catch2 has to the C++ repos' own shipped binaries) — settings
   modal open/close via direct calls, scrim click, close-button click,
   `navigate()`'s mount-then-unmount-previous ordering, the top bar's back
   button present/absent, gear click firing `onSettings`, status pill
   present/absent, and title text escaping (a screen title is rendered via
   `textContent`, not interpolated as markup) all confirmed against a real
   `Document`, not by reasoning about the code. Separately, confirmed via the
   actual running `aurora-app-windows.exe` that every file serves with the
   right content type (`text/html`, `text/javascript`, `text/css`) and `GET /`
   resolves to `index.html`. Genuine visual/interaction verification in an
   actual browser is still outstanding — flagged rather than skipped over.
8. ~~Port `Dropdown.ts` and close its ARIA/keyboard punch list~~ —
   **done (2026-09-15)**: `Dropdown.js`, `styles/dropdown.css`. Before
   implementing, verified the exact required pattern rather than guess —
   fetched the real WAI-ARIA APG "Collapsible Dropdown Listbox" example,
   since the component inventory had already named the target shape
   (`role=listbox/option`) but not its precise contract. Implements it with
   one deliberate, documented divergence: the reference pattern commits a
   value on every arrow-key press ("select follows focus"); here arrow keys
   only move `aria-activedescendant` and a `.active` visual cursor, and only
   Enter/Space/click/Tab-out actually calls `onSelect` — committing on every
   keystroke was fine for the reference's plain value, but Aurora's
   `onSelect` callbacks can trigger real side effects (switching a capture
   device, a REST call), which shouldn't fire while a user is still browsing
   options. Typeahead (jump to an option by typing its first letter) is the
   other piece of the reference pattern left out — a deliberate cut, not an
   oversight. Also closed one gap noticed while porting: RockyRoad's own
   `.dropdown-fill` CSS modifier (trigger fills its container's width,
   chevron pushed to the far edge) is needed for the full-width dropdowns
   already drawn in this doc's own constrained-layout ASCII, so it's exposed
   as a `fill` constructor option rather than left copied-but-unreachable.
   Two token additions along the way: `--aurora-surface-hover`/
   `--aurora-surface-selected` (RockyRoad's real `#2a2a2a`/`#242424` menu
   states, matching no existing token).
   <br><br>
   Verified with the same real-DOM approach as step 7 (`jsdom`, scratchpad-
   only): static ARIA wiring (`aria-haspopup`, `role=listbox/option`,
   `aria-label` fallback and `aria-labelledby` wiring when an external label
   is given), opening via click or ArrowDown moves DOM focus to the listbox
   and seeds the active cursor on the current selection, arrow/Home/End
   navigation moves `aria-activedescendant` *without* calling `onSelect` or
   touching the underlying `aria-selected` state, ArrowDown clamps at the
   last option rather than wrapping, Enter/click/Tab all commit and close
   (Tab without forcing focus back, so the browser's own Tab continues
   naturally), Escape closes without committing and returns focus to the
   trigger, an outside click closes without committing, and opening one
   dropdown closes any other already-open one. Confirmed served correctly
   (`text/javascript`/`text/css`) via the real running Windows binary.
   Genuine screen-reader/browser verification is still outstanding, same
   caveat as step 7.
9. ~~A bare Dashboard shell~~ — **done (2026-09-15)**:
   `screens/DashboardScreen.js` (nav rows only — Bridge/Zones/Tuning, no mode
   toggle or Stop yet, those need steps 11/16's backend endpoints first) and
   `screens/PlaceholderScreen.js` (a shared "this screen isn't built yet"
   stand-in with a working Back button, used by all three nav rows for now —
   gives the shell real navigate()/back targets today instead of a silent
   no-op or dev-only shortcut, deleted one usage at a time as each real
   screen lands). Screens take `app` via their own constructor rather than
   importing a shared singleton, matching RockyRoad's own `IScreen` shape —
   avoids a circular import between `app.js` and every screen module.
   <br><br>
   "Wired to the capability-probe/persisted-state routing logic" turned out
   to mean something narrower than full first-run-vs-returning-user routing
   (that's step 18, once screens 1-4 exist to route to): the Bridge row's
   status is real data from `/api/capabilities` + `/api/hue/connection`, the
   only two persisted-state endpoints that exist yet. Distinguishes three
   real cases with different messages, not one generic fallback: the Hue
   output isn't compiled into this build at all, it's compiled in but not yet
   paired, and the capabilities probe itself failed (e.g. server
   unreachable) — the last two look similar to a user but come from different
   layers, so conflating them into one message would have been a real (if
   minor) drop in fidelity. The Zones row has no backing endpoint yet
   (ZoneMap REST is step 14) and stays an honest placeholder rather than
   fabricated data.
   <br><br>
   One correction made in passing: `shell.css`'s `.status-pill` (built in
   step 7, before any screen used it) had guessed at a generic pill shape.
   Now that the Dashboard actually needed it, re-checked the plan's own cited
   precedent (RockyRoad's real `.lib-badge`) and found it didn't match at
   all — corrected to the real values (`#8b8b8b` background, 10px/500-weight
   text, 3px radius) rather than leaving the guess in place now that it had a
   real consumer.
   <br><br>
   Verified with the same `jsdom` approach as steps 7-8, plus one step
   further: a *live* end-to-end pass (no mocked `fetch`) against the actual
   running `aurora-app-windows.exe`, confirming the real HTTP round trip and
   real DOM update together, not just each half separately. Mocked-fetch
   tests covered all three Bridge-status cases above, that clicking a nav row
   navigates to the right placeholder with the right title, and that its
   Back button returns to a freshly-rendered Dashboard. Confirmed all new
   files serve with the correct content type via the real binary.

**3. Screens, in dependency order**
10. ~~**Output Connect**~~ — **done (2026-09-15)**: `screens/
    OutputConnectScreen.js`, plus two new shared stylesheets other screens
    will also draw on — `styles/forms.css` (buttons, text inputs, labeled
    fields, inline status text — generalized from `.tuner-btn`/
    `.tuner-btn-exit`'s real light/dark button roles) and `styles/
    output-connect.css` (this screen's own address-row/actions layout).
    Wired into `DashboardScreen`'s Bridge row in place of `PlaceholderScreen`
    — disabled outright when this build has no Hue output, real screen
    otherwise. A four-phase state machine (`entry` → `pairing` →
    `configSelect` → `done`), each phase its own render function:
    - `entry`: address field (pre-filled from any already-persisted
      connection, for re-pairing) + Autodetect (`GET /api/hue/discover`) +
      Continue (`PUT /api/hue/validate` first, a clear fast failure for a bad
      address before ever showing "press the button").
    - `pairing`: calls `PUT /api/hue/register`; `link_button_not_pressed`
      re-shows the same wait text with no client-side poll loop, matching
      huenicorn's own real click-to-retry UX (step 5's research) exactly —
      the user physically presses the button, then clicks Continue again.
      Includes a small "Change address" escape hatch back to `entry`, not in
      the original ASCII sketch but a cheap, clearly-justified addition (a
      typo'd address shouldn't require walking away and back).
    - `configSelect`: `PUT /api/hue/entertainment-configurations`. Skips the
      Dropdown entirely when exactly one configuration exists (nothing to
      choose), but never auto-selects among more than one — `output.md`'s own
      filed lesson that a bridge having several is normal, not an edge case.
      Zero configurations shows a real message citing the actual constraint
      (create one in the official Hue app first) plus a "Check again" retry.
    - `done`: persists via `POST /api/hue/connection` (the one write in this
      whole flow, matching step 5's stateless design), then a `Continue`
      button calling `onComplete` — a caller-supplied callback rather than a
      hardcoded destination, so a later first-run bootstrap can chain into
      Mode+Device Select once it exists without this file changing.
    <br><br>
    One correction made in passing: `shell.css`'s `.status-pill` (step 7,
    fixed for real in step 9) was fine, but this step's own new status-text
    styling raised the "should errors/success be colored" question the
    grayscale-only decision hadn't explicitly addressed — resolved by keeping
    status text grayscale too, reasoning that the ✓/⚠ glyph plus explicit
    wording already carries the meaning, and introducing red/green here would
    reopen the accent-color decision without checking back in.
    <br><br>
    Verified with the same `jsdom` approach as steps 7-9 — the full happy
    path (validate → link-button retry → register success → 2-option
    Dropdown → finish → done → `onComplete`), the 1-config and 0-config
    branches, an unreachable address stopping before any registration
    attempt, "Change address" preserving the typed value, and pre-fill from
    an existing connection — plus a *live*, unmocked pass against the real
    running binary. That live pass incidentally confirmed the real
    `internalipaddress` field name against the actual discovery API by
    finding a real bridge on the network (discovery/validate only — no real
    registration was attempted against real hardware, deliberately, since
    that needs a physical button press and would create a real persisted
    credential). Confirmed all new files serve with the correct content type.
11. ~~**Backend**~~ — **done (2026-09-15), except audio-sink listing (see
    below).** Generic settings REST endpoints
    over `Config`'s user-facing fields are ~~done~~ — `Aurora::Runtime::
    registerSettingsRoutes` in `core/Runtime` (`SettingsRoutes.hpp`/`.cpp`),
    the first thing in `Runtime` itself (not an app or a plugin) to register
    HTTP routes, linking `AuroraNetwork` the same way `Aurora-Output-Hue` did
    in step 5. `GET /api/config` returns all ~19 user-facing fields (not
    `restServerPort`/`boundBackendIP`, read once before the server can even
    answer a request); `PUT /api/config` is deliberately PATCH-style despite
    the verb — merges only the fields present in the body, since asking a
    caller to resend all 19 to change one slider would be painful. Each field
    funnels through `Config`'s own setter, so existing clamping (e.g.
    `transitionSmoothing` to `[0, 0.97]`) applies with zero duplicated
    validation; an unrecognized `interpolation` string is silently ignored
    rather than erroring, matching the rest of this field-by-field merge's
    forgiving-per-field posture. Verified on both platforms: real GET/PUT
    round trips confirming the partial merge leaves untouched fields alone,
    real clamping, an invalid enum value being ignored rather than crashing,
    a malformed body returning a clean 400, and the merged result actually
    persisted to `config.json` on disk (read back to confirm).
    <br><br>
    **Reload entrypoint and monitor listing — done (2026-09-15).** Both apps
    now have a `Pipeline`/`PipelineHost` pair (in each app's own `main.cpp`,
    not core::Runtime — building one needs `Registry` and this app's own
    input-name/ifdef dispatch, both app-layer concepts, same reasoning that
    already keeps `registerInputs`/`registerOutputs` per-app). `Pipeline`
    is the swappable unit huenicorn's own design fork calls for
    (`HttpServerAnalysis.md`: reconstruction, not mutation) — it owns
    input/outputs/orchestrator and is thrown away and rebuilt whole, never
    mutated in place. `PipelineHost` wraps it in one mutex (the "one
    consistent lock around a swappable pipeline unit" that doc recommended,
    not huenicorn's narrower single-mutex approach): `tick()` (main thread)
    and `reload()` (the HTTP thread) take the same lock, and `reload()`
    builds the replacement *before* acquiring it, so a slow or failing build
    never blocks a tick already in progress, and the old pipeline's
    `shutdown()` runs only after the swap, once no `tick()` call can reach it
    anymore.
    <br><br>
    `SettingsRoutes` gained an `onConfigChanged` callback (empty by default)
    — "every settings PUT funnels into reload" turned out to mean threading
    a callback through core::Runtime rather than reload logic living there
    directly, since `Config`/`ConfigStore` are core concepts but `Registry`/
    `Pipeline` aren't. Each app wires it to call `PipelineHost::reload()`
    with a freshly-reloaded `Config` (not the request's own now-stale copy).
    A failed reload is reported as a distinct `reloadError` field, not
    `"succeeded": false` — the save itself still succeeded, only the live
    pipeline couldn't pick it up, and conflating the two would hide that the
    persisted value is actually correct. A standalone `POST /api/reload`
    also exists for triggering one with no field actually changed (e.g.
    "re-scan" after plugging in a monitor). `GET /api/monitors` reads
    `Pipeline::listMonitors()` (empty array in audio mode, not an error).
    <br><br>
    **One real tradeoff surfaced by testing, not just reasoned about:**
    moving pipeline construction before `httpServer.bind()` (required, since
    the settings/monitors/reload routes all capture `pipelineHost` by
    reference and `HttpServer` requires every route registered before
    `bind()`) measurably delays when the WebUI becomes reachable at startup
    — confirmed by polling `/api/capabilities` every 500ms, ~1.5–2s on this
    machine with real DXGI monitor enumeration in the mix, versus
    near-instant before this step (the server used to bind before the
    pipeline was built at all). Accepted as a real, documented tradeoff
    rather than solved with a nullable-initial-pipeline design (routes and
    the tick loop tolerating "not ready yet") — that would have closed the
    gap but added real edge-case surface for a few seconds of startup
    latency on an already-slow-starting piece (real capture hardware
    enumeration), not judged worth it here.
    <br><br>
    Verified on both platforms with the same real-server approach used
    throughout this build order, this time specifically probing for the
    core safety guarantee rather than just the happy path: a settings PUT
    writing a deliberately-invalid `activeInputName` persists correctly
    (confirmed in the response body), reports a distinct `reloadError`
    ("Unknown input '...'"), and — checked directly, not assumed — the
    process stays alive and still serving (`/api/capabilities` still
    returns 200) with the *old* pipeline still running untouched. A
    follow-up PUT fixing the value back to a real input then reloads
    cleanly with no error. Also confirmed the manual `POST /api/reload`
    path, and on Windows, `GET /api/monitors` returning this machine's real
    connected displays (verified real data, not placeholder — two actual
    monitors with their real resolutions/refresh rates/primary flag).
    <br><br>
    Audio-sink listing (the other half of "monitor/sink listing endpoints")
    is a further, separate gap, not silently dropped: `Aurora-Input-Linux`
    has no sink-enumeration capability at all today (checked directly, no
    matches for any enumerate/list-sinks pattern), unlike video's
    `IVideoInput::monitors()` which already existed and just needed a live
    instance to call it on. Building it means new PipeWire registry-query
    code in a different repo, not just wiring an existing capability through
    HTTP — left for a dedicated pass, not attempted here.
12. ~~**Mode + Device Select**~~ — **done (2026-09-15)**: `screens/
    ModeDeviceScreen.js` + `styles/mode-device.css`, plus a new shared
    `.segmented`/`.segmented-btn` component in `forms.css` (ported from
    `RockyRoadImport/SongConverter`'s real `.tabs`/`.tab-btn`, verified
    directly — final component inventory's "Screens 2, 5" entry, reused
    unchanged when step 17 builds the Dashboard's own mode toggle). Wired
    into a new "Capture source" row on `DashboardScreen`, inserted between
    Bridge and Zones — the build-order text for step 12 said only "needs
    step 11," but the navigation-model flow diagram earlier in this doc
    (returning users reach "each of 1/2/3/4" from the Dashboard) already
    required Dashboard to link here; the current Dashboard mockup's own
    nav-row list just hadn't been updated to show it. Resolved by adding the
    row now rather than leaving screen 2 unreachable outside first-run until
    step 17.
    <br><br>
    The audio/video toggle (`.segmented`) only renders when
    `/api/capabilities`'s `audioInputs` is non-empty, matching the spec's
    "only when both are compiled in." Below it, one of two device pickers:
    - **Video:** a `Dropdown` of `GET /api/monitors` entries plus a synthetic
      "Auto (primary)" option for an empty `activeMonitorName`. Real gap
      found and handled, not assumed: `/api/monitors` reflects only whatever
      the *live* pipeline actually constructed
      (`PipelineHost::listMonitors()` returns an empty vector whenever
      `m_videoInput` is null, i.e. whenever the daemon is currently running
      in audio mode) — confirmed live on real hardware, not just read in
      code (see verification below). Switching the tab to Video while the
      daemon is currently live in audio mode therefore can't show real
      monitor choices yet; rather than a fake list, the screen shows a
      single "Auto (primary display)" notice and asks the user to Save then
      reopen, and Done omits `activeMonitorName` from its PUT entirely in
      that case (PATCH semantics leave the persisted value untouched, per
      `SettingsRoutes`'s own design) instead of writing something fabricated.
    - **Audio:** cut further than the original spec's own ASCII layout
      implied. `Aurora-Input-Linux` has no sink-enumeration capability at
      all (step 11's flagged gap) and Windows audio has no device concept
      to enumerate in the first place, so no dropdown exists here at all.
      Windows builds (audio input name `windows-audio`) get a plain
      "Uses your system's default audio device" line; Linux builds (`
      linux-audio`) get a free-text field for the already-fully-wired
      `Config::audioTargetSinkName`, labeled "optional" and explained as a
      manual-entry workaround for the missing listing endpoint — a real,
      honest device override rather than a fake picker, using a field
      `SettingsRoutes`/`Config` already round-trip completely. Which variant
      to show is decided from `audioInputs.includes('linux-audio')` —
      reusing the existing platform-specific registry naming convention
      instead of adding a new `/api/capabilities` field just for this.
    - `activeInputName`/`activeAudioInputName` (registry plugin names like
      `windows`/`linux`/`x11`/`pipewire`/`windows-audio`) are never shown as
      raw choices — `pickVideoInputName`/`pickAudioInputName` resolve them:
      keep an existing valid non-`dummy` choice if there is one (so a manual
      `x11`/`pipewire` override made outside the UI survives an unrelated
      monitor change), otherwise prefer the platform's own `linux`/`windows`
      auto-select meta-name, otherwise fall back to the first real
      (non-`dummy`) registered name. `dummy` is filtered out everywhere —
      never a value this screen writes.
    <br><br>
    Tested with jsdom against the real on-disk files (same substitute-for-a-
    headless-browser method used throughout this build order): the two
    name-picking heuristics as pure-function unit tests; the Dashboard's new
    row rendering, its label reflecting live/audio state, its status-
    unavailable fallback when either probe fails independently, and its
    click wiring into this screen; this screen's own video-with-real-
    monitors render, the Windows audio-mode render (no sink field), the
    Linux audio-mode render (sink field pre-filled from persisted config),
    the empty-monitors-degrades-to-Auto-only path, a `reloadError` response
    surfacing inline without faking the success phase, and the toggle
    itself being absent entirely when `audioInputs` is empty. Also verified
    live against the real Windows binary on real hardware, not just jsdom:
    the two new static files (`ModeDeviceScreen.js`, `mode-device.css`)
    serve with real 200s; `GET /api/capabilities`/`api/config` match this
    screen's assumed field names and shapes exactly; `GET /api/monitors`
    returns this machine's three real displays; a `PUT /api/config` mode
    switch to audio succeeds cleanly with the process staying alive; and —
    the one behavior that mattered most to confirm for real rather than by
    reading `PipelineHost::listMonitors()`'s source — `GET /api/monitors`
    genuinely comes back `{"monitors":[]}` while live in audio mode, then
    genuinely repopulates with the same three real displays after switching
    back to video, exactly matching what the empty-list UI path assumes.
13. ~~**Tuning/Settings**~~ — **done (2026-09-15)**: `screens/TuningScreen.js`
    + `styles/tuning.css`, plus two new shared `forms.css` components used
    for the first time here — `.section-heading` (ported from
    `RockyRoadImport/SongConverter`'s real `<h2>` + `.tab-panel::before`, its
    1px divider mapped onto Aurora's own `--aurora-divider` token rather
    than the source's literal 3px, since that heavier weight was a tab
    strip's own divider role there, not a plain section break) and
    `.toggle-row`/`.toggle-switch`/`.toggle-knob` (ported from RockyRoad's
    real `.pre-toggle-switch`/`.pre-toggle-knob`, verified against
    `v2/desktop.html` — a hidden checkbox driving a sibling knob via
    `:checked`, not a custom-drawn control; its checked-state color is
    already `--aurora-accent`, the same `#8b8b8b` the source uses). Wired
    into `DashboardScreen`'s Tuning row in place of `PlaceholderScreen`.
    <br><br>
    Per the spec's own "cut tabs, keep plain headings" decision, video mode
    (4 fields, one implicit group) renders with no heading at all; audio
    mode (11 fields) renders three: **Response speed** (bounce/brightness
    smooth time, drift base rate), **Color character** (vibrancy
    saturation/value, plus the fixed-hue toggle and its conditional 0–360°
    slider), **Sensitivity** (dynamism floor, centroid strength, reference
    RMS, brightness floor, centroid range) — this exact grouping was only
    named in the spec's own "cut from the first pass" paragraph about tabs,
    not laid out anywhere else, so it doubled as the section plan once tabs
    were dropped in favor of headings. Slider ranges for the 10 float
    fields with no server-side clamp (`Config::setAudioBounceSmoothTime`
    etc. just assign, unlike `transitionSmoothing`'s real `[0, 0.97]` clamp)
    came from `AudioEffectSettings`'s own field comments (`AudioProcessing.hpp`),
    not guessed — e.g. `centroidStrength`'s "0 = no effect" implying a
    bounded 0–1 multiplier, `driftBaseRateDegPerSec`'s "full rotation every
    60s by default" implying a 0–60°/s ceiling (10x default speed).
    <br><br>
    **`audioTargetSinkName` is deliberately not surfaced here**, resolving a
    real inconsistency in the original spec text: this section's own job
    description listed it alongside the full `AudioEffectSettings` block,
    but screen 2's job description had already assigned it to Mode+Device
    Select ("a PipeWire sink for audio on Linux"), which built it in step
    12. Keeping it there means one editable surface per field, not two
    screens each holding a separately-stale copy of the same
    `PUT /api/config` field.
    <br><br>
    **Save works differently here than every other screen's "done" phase,
    deliberately.** `OutputConnectScreen`/`ModeDeviceScreen` gate a one-shot
    decision and advance to a `done` phase requiring an explicit Continue
    click. Tuning's own job is iterative adjustment (nudge a slider, listen,
    nudge again), so that gate would fight the screen — Save here writes in
    place, shows an inline ✓/⚠ status line, and stays on the edit screen.
    This isn't just a style choice: `PipelineHost::reload()` (every app's
    `main.cpp`) always calls `Pipeline::build()` fresh — there is no
    settings-only update path, confirmed by reading it, not assumed — so
    *every* Save here tears down and reconstructs the entire live pipeline,
    video/audio input included, not just applies new numbers to an
    already-running one. That real cost is also why sliders don't
    live-apply per drag tick (a reload per animation frame would rebuild
    the whole pipeline dozens of times a second); edits are batched behind
    one explicit Save/PUT instead.
    <br><br>
    One real behavior confirmed live, not just from reading `Orchestrator::
    init()`'s source, that shapes what "0 = auto" actually means for
    `subsampleWidth`/`refreshRate` here: saving `subsampleWidth: 0` persists
    correctly in that PUT's own response (confirmed), but the very reload
    that same PUT triggers rebuilds the pipeline while still in video mode,
    which re-derives `subsampleWidth` from the display immediately and
    persists the concrete result right back — confirmed real on hardware
    (`0` in the PUT response, `48` again moments later on the next `GET
    /api/config`). This is correct, intended behavior, not a bug: "0 = auto"
    means "please re-derive it," and it does, immediately — it just means
    reopening this screen after saving `0` will never show `0` back, only
    whatever got derived. Worth naming because it's a different "0/empty
    means auto" contract than `activeMonitorName`'s (which stays genuinely
    empty in persisted config forever unless explicitly set) — two auto
    patterns in the same app, resolving differently, not one convention.
    `refreshRate` has no such round-trip available at all: `Config::
    setRefreshRate` clamps to `>= 1` unconditionally, so a settings PUT can
    never actually request "auto" for it once a concrete value is set — the
    screen's own refresh-rate field label makes no auto claim, unlike
    subsample width's, for exactly this reason.
    <br><br>
    Tested with jsdom: video-mode field rendering and pre-fill from a real
    config shape (no section heading, all 4 fields), a slider's live
    readout updating without a full re-render (`input` event mutating only
    the readout `<span>`+state, not calling `_render()`), a full Save round
    trip asserting the exact PUT body sent; audio-mode's three headings and
    field grouping, the fixed-hue toggle revealing/hiding its slider and
    defaulting a newly-enabled hue to `0` rather than the still-unset `-1`,
    unchecking it resetting to `-1` on the next save rather than leaving a
    stale angle persisted, and confirming the audio PUT body is exactly the
    11 `AudioEffectSettings` fields with `audioTargetSinkName` never present;
    a `reloadError` surfacing inline with Save left retryable, not stuck
    disabled. Also verified live against the real Windows binary on real
    hardware: the two new static files serve with real 200s; a real video
    tuning save (interpolation, transitionSmoothing, subsampleWidth) and a
    real audio tuning save (bounce smooth time, a 120° fixed hue) both round
    -trip through a live `GET /api/config` with the process staying alive
    throughout; and the `subsampleWidth`-auto-rederivation behavior above,
    which is exactly the kind of real-vs-assumed-behavior gap this build
    order has repeatedly found only by testing against the actual daemon.
14. ~~**Backend:** `ZoneMap` REST endpoints~~ — **done (2026-09-15)**: `GET`/
    `PUT /api/zones`, one combined PATCH-style endpoint (`set UV rect, set
    gamma, set active` from this step's own original phrasing turned out to
    name three *jobs*, not three separate routes — one body covers all
    three, same convention `SettingsRoutes` already established) rather than
    three. `GET` returns `{"outputName", "zones": [...]}` from whatever's
    currently live-reconciled (empty in audio mode or with no outputs, same
    "nothing to report, isn't an error" precedent `/api/monitors` set in
    step 11); `PUT` requires `zoneId` and applies only the `uvs`/`active`/
    `gamma` fields actually present in the body, 404 on an unknown zoneId
    rather than silently no-opping.
    <br><br>
    **Real capability added to core, not just a route wired to something
    that already existed:** `Orchestrator` only had a const `zoneMap()`
    getter before this step -- no way to edit a zone live. Added
    `Orchestrator::updateZone(outputName, zoneId, uvs, active, gamma)`
    (`std::optional` params, PATCH semantics at the C++ level too),
    persisting immediately via the same `ZoneMapStore` `init()` already
    uses.
    <br><br>
    **Deliberately does *not* go through a pipeline reload, unlike every
    other write built in steps 11-13.** `ZoneMap` isn't part of `Config` --
    it's a separate per-output profile `Orchestrator` already holds
    in-memory and reads every tick. A zone edit mutates that same in-memory
    map directly, under the same `PipelineHost` mutex `tick()` already
    takes (so a tick and an edit can never interleave), then persists to
    disk -- no `Pipeline::build()`, no capture/output teardown. This
    matters for real: the Zone Mapping screen's own job (step 15) is
    dragging a rect live while watching the actual lights react, and step
    13 already established that every `Config`-backed reload rebuilds the
    *entire* pipeline from scratch -- doing that on every drag-frame would
    make a live drag interaction unusable. Because `ZoneMap` was already a
    live in-memory structure `Orchestrator::update()` reads directly (not
    routed through `Config`), giving it its own direct-mutation path
    instead of funneling through the reload machinery was a real design
    choice available here, not something the other screens could have used
    too.
    <br><br>
    **Lives in core, not duplicated per app like `registerMonitorsRoute`/
    `registerReloadRoute` had to be.** Step 11's monitors/reload routes
    were forced into each app's own `main.cpp` because they need
    `PipelineHost`/`Registry`, both app-layer types core doesn't know
    about. `ZoneMap`/`ZoneConfig`/`Contracts::UVs` are already core types
    with no such dependency, so `Aurora::Runtime::registerZoneRoutes` (new,
    `core/Runtime/ZoneRoutes.hpp/.cpp`) could take the same generic-
    callback bridging shape `SettingsRoutes`' `onConfigChanged` already
    uses -- `std::function<ZoneListResult()>` +
    `std::function<bool(zoneId, uvs, active, gamma)>` -- and be registered
    once from core instead of its JSON-marshalling logic being copy-pasted
    into both apps' `main.cpp` a second time. Each app's `main.cpp` only
    adds a thin `Pipeline`/`PipelineHost::listZones()`/`updateZone()` pair
    (mirroring `listMonitors()`'s own shape) and one registration call.
    Worth naming as a real improvement over step 11's own precedent, not a
    style preference -- the constraint that forced duplication there
    (app-layer types) genuinely doesn't apply here.
    <br><br>
    **v1 scope limit, documented not silently assumed:** only the first
    output's zone map is reachable (`m_outputPtrs.front()`) -- today's only
    real output is Hue, and the WebUI's own Zone Mapping screen is designed
    around one unified zone grid, not per-output tabs, so this matches the
    UI's actual job rather than under-building it. A second real output
    would need this revisited.
    <br><br>
    Tested with real Catch2 unit tests added to `OrchestratorTests.cpp`
    (`updateZone` edits only the fields given and persists immediately;
    returns `false` for an unknown output or zoneId) -- run for real in
    WSL2 against `core`'s own build tree (28 assertions across 9 test
    cases, all passing), not attempted on Windows: the prebuilt `Catch2d.lib`
    ABI mismatch already on file in `engineering-hygiene.md` blocks linking
    any Windows Debug test binary in this environment, confirmed again here
    as the same pre-existing, unrelated issue (compilation of every new
    file succeeded cleanly on both platforms; only the Windows test
    *link* fails, against Catch2's own object files, not mine). Also
    verified live against the real Windows binary: `GET /api/zones` in
    video mode, a `PUT` with a real body, PATCH semantics (only `active`
    sent, `uvs`/`gamma` left alone), an unknown-zoneId 404, and the
    audio-mode empty-degrade -- all confirmed, except the *successful* edit
    path, which needs at least one real live zone to target and this dev
    environment's Hue output has none (no real bridge reachable, so
    `zoneIds()` returns empty) -- the same real-hardware limitation
    Output Connect's own testing already had in step 10. That path is
    covered by the Catch2 tests and by jsdom mocks once step 15's screen
    exists to exercise it end-to-end.
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
