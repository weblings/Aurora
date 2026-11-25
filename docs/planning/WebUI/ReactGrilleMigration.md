# Dashboard and NUX move to React and Grille

Id: react-grille-migration

Status: scoped 2026-11-23 under `Aurora-4nqt` (children `.1`-`.11`). Done: `.1` to `.5` (the `.5` mock was approved 2026-11-24, the asks are Grille epic `Grille-0u5`). The owner leans to option A for the build (Decisions). Bead `.1` records the decisions.

The plan for moving `web/ui` (the Dashboard and the onboarding screens, vanilla ES modules today) to React and Grille. The audit below was done 2026-11-23 against Grille 0.2.1 (`../../Grille`) and the graph editor.

## Where things stand

- `web/ui` is plain static files with no build step. `aurora_embed_webroot` embeds them and each app shell serves them.
- `web/graph-editor` builds with npm and Vite, embeds as `GraphEditorWebRoot` at `/graph-editor/` behind `AURORA_ENABLE_GRAPH_EDITOR` (off by default, needs Node >= 22.12, `AURORA_GRAPH_EDITOR_DIST` embeds a prebuilt bundle). It already has a second entry, `recipes.html`.
- `web/demo` copies `web/ui` byte for byte (`MANIFEST.json`, `sync-webui.py`, CI drift check) and builds the editor apart (`build-editor.py`).
- Every screen is `{ mount(container), unmount() }`. Most components are classes with `constructor(container, opts)` and `destroy()`.
- `ErrorShell.tsx` (`Aurora-s1t7.9`) draws its rows with Grille `MessageRow` since `.2`, and the Dashboard's `shell.js` pushes props to it since `.4`.

## Component map

| web/ui | Grille | Fit |
|---|---|---|
| `.btn`, `btn-primary`, `btn-secondary`, `NavFooter` | `Button` | Direct |
| `topBar.js` | `Header` plus icon `Button` | Direct |
| Stop-confirm overlay | `Modal`, `Dialog`, `DialogActions` | Direct |
| `Tooltips.js` (native `title`) | `Tooltip` | Direct |
| Error shell, `status-text` | `MessageRow`, `StatusMessage` | Direct, except collapse, 60vh cap and pulse (stay local CSS) |
| Settings and device fields | `TextField`, `FieldList`, `Select` | Direct |
| `Dropdown.js` (6 uses) | `Select` | Partial: needs `{id, label}` options, `isDisabled` and a full-width trigger (`Grille-0u5.3`). The WebXR check is RockyRoad's (Grille-0up) |
| `AccordionSection` | `Disclosure` | Partial: needs an accordion variant and `isExpanded` control, because "See all zones" opens Bridge from outside (`Grille-0u5.4`) |
| Tuning sliders, `SliderFill` | `Slider` | Partial: needs once-per-gesture `onChangeEnd` with key-up, Aurora's colours, full width, 8px track and header layout (`Grille-0u5.2`) |
| Toggles and checkboxes (zone active, Settings, Tuning optional) | none | Gap: a Switch only, all 7 checkboxes are the switch (`Grille-0u5.1`) |
| Black-handling `segmented` | `Tabs` maybe | Unclear, it is a value choice not navigation |
| Icons (`web/ui/icons`) | `icons/*.ts` | Mostly covered (`Aurora-0ofk`). `powerIcon` ships in Grille v0.2.2-dev.2 (OpenMoji, `Grille-0u5.5`), repadded in dev.3 so it weighs like the arrow. `arrowLeft` is the back arrow |
| `EffectPanel` (879 lines) | `Popover`, `ListBox`, `Menu`, `Tree` pieces | Rebuild per the kep2 spec |
| `ZoneCanvas`, `ScreenDivision`, `ZonePatchQueue` | none | Stays custom (SVG drag editing) |

Scale: `DashboardScreen.js` is 1234 lines of imperative DOM with a 1067-line test. The NUX is six small screens (Welcome, MacTrayTip, OutputConnect, EntertainmentZoneSelect, ModeDevice, Pairing). Logic modules (`MacPermissionRecovery`, `Pairing`, `CaptureSource`, `shellRows`, `EffectPanelModel`, `TuningControls`) can stay plain JS and be imported by React, as `ErrorShell.tsx` does.

## Decisions

- Build (owner leaning, 2026-11-23): add the Dashboard and NUX as pages of the existing graph-editor Vite project, like `recipes.html`, not a sibling project. Open: Node policy for the main UI, how the demo consumes the bundle. Both go in `Aurora-4nqt.1`.
- Migration is hybrid and per piece, not a big bang. Grille's `mountIsland(el, node)` mounts React into an element owned by vanilla code. A React piece gets a wrapper class with the same API as the class it replaces, so callers do not change. Aurora does not use `mountIsland` yet.
- Order: shell island first (rows come in as props and `ErrorShell` fetches nothing), then leaf islands, then NUX screens, then the Dashboard, then flip `app.js` and retire vanilla. Each step keeps a working app and a passing demo build.
- Grille gaps (Switch, Slider, Select, accordion Disclosure, power icon) were mocked in Aurora first (`Aurora-4nqt.5`, approved 2026-11-24, see [[4nqt5-grille-gaps-mock]]), filed as Grille epic `Grille-0u5` and shipped in Grille v0.2.2-dev.2 and polished in dev.3. The editor now pins dev.4 (`Aurora-6ovl`). Checkbox and back arrow were dropped.

## Risks to check

- Grille `ui.css` against `tokens.css` globals and the global `:focus-visible` rule (the editor loads both, the Dashboard has not).
- The demo vendor closure check flags any import outside `MANIFEST.json`, and a wrapper importing a built bundle needs the demo to build that bundle. `demo-boot.js` fakes the `app` facade and has to feed the shell's props.
- Focus order and Escape across vanilla and React popups (Grille `docs/lessons/components.md`).
- Tests that stub a component by its class may need updates, and the 1067-line Dashboard test has to be ported or retired.

## Beads

Epic `Aurora-4nqt`. Order and dependencies:

- `.1` decide build and delivery, `.2` editor shell on `MessageRow`, `.5` Grille mock for the gaps. These start with no build change.
- `.3` main page loads a bundle (needs `.1`), then `.4` shell island (`.2`, `.3`), `.9` EffectPanel rebuild (`.3`), `.7` leaf islands for controls (`.3`, `.5`).
- `.6` was closed with its scope moved: the top bar and NUX buttons to `.8`, the stop overlay, Dashboard buttons, Stop icon and `Aurora-0ofk` to `.10`.
- `.8` NUX screens (`.7`), `.10` Dashboard screen (`.7`, `.9`), `.11` flip the router and retire vanilla (`.8`, `.10`).
