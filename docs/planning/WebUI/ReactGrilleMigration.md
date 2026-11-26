# Dashboard and NUX move to React and Grille

Id: react-grille-migration

Status: scoped 2026-11-23 under `Aurora-4nqt` (children `.1`-`.11`), nothing built. The owner leans to option A for the build (Decisions). Bead `.1` records the decisions.

The plan for moving `web/ui` (the Dashboard and the onboarding screens, vanilla ES modules today) to React and Grille. The audit below was done 2026-11-23 against Grille 0.2.1 (`../../Grille`) and the graph editor.

## Where things stand

- `web/ui` is plain static files with no build step. `aurora_embed_webroot` embeds them and each app shell serves them.
- `web/graph-editor` builds with npm and Vite, embeds as `GraphEditorWebRoot` at `/graph-editor/` behind `AURORA_ENABLE_GRAPH_EDITOR` (off by default, needs Node >= 22.12, `AURORA_GRAPH_EDITOR_DIST` embeds a prebuilt bundle). It already has a second entry, `recipes.html`.
- `web/demo` copies `web/ui` byte for byte (`MANIFEST.json`, `sync-webui.py`, CI drift check) and builds the editor apart (`build-editor.py`).
- Every screen is `{ mount(container), unmount() }`. Most components are classes with `constructor(container, opts)` and `destroy()`.
- `ErrorShell.tsx` (`Aurora-s1t7.9`) is React but renders the `shell.css` classes and has no Grille imports. A markup test holds it equal to `shell.js`. Grille's `MessageRow` (error and notice tones, since Grille-83g.1) was made to replace that markup and only `NameDialog` uses it so far.

## Component map

| web/ui | Grille | Fit |
|---|---|---|
| `.btn`, `btn-primary`, `btn-secondary`, `NavFooter` | `Button` | Direct |
| `topBar.js` | `Header` plus icon `Button` | Direct |
| Stop-confirm overlay | `Modal`, `Dialog`, `DialogActions` | Direct |
| `Tooltips.js` (native `title`) | `Tooltip` | Direct |
| Error shell, `status-text` | `MessageRow`, `StatusMessage` | Direct, except collapse, 60vh cap and pulse (stay local CSS) |
| Settings and device fields | `TextField`, `FieldList`, `Select` | Direct |
| `Dropdown.js` (6 uses) | `Select` | Partial: string options only, WebXR check open (Grille-0up) |
| `AccordionSection` | `Disclosure` | Partial: no `expand()`/`collapse()`, and "See all zones" opens Bridge from outside |
| Tuning sliders, `SliderFill` | `Slider` | Partial: `onChange` only, Tuning commits on gesture end |
| Toggles and checkboxes (zone active, Settings, Tuning optional) | none | Gap: no Switch or Checkbox |
| Black-handling `segmented` | `Tabs` maybe | Unclear, it is a value choice not navigation |
| Icons (`web/ui/icons`) | `icons/*.ts` | Mostly covered (`Aurora-0ofk`), no power icon, `arrowLeft` stands in for `back-arrow` |
| `EffectPanel` (879 lines) | `Popover`, `ListBox`, `Menu`, `Tree` pieces | Rebuild per the kep2 spec |
| `ZoneCanvas`, `ScreenDivision`, `ZonePatchQueue` | none | Stays custom (SVG drag editing) |

Scale: `DashboardScreen.js` is 1234 lines of imperative DOM with a 1067-line test. The NUX is six small screens (Welcome, MacTrayTip, OutputConnect, EntertainmentZoneSelect, ModeDevice, Pairing). Logic modules (`MacPermissionRecovery`, `Pairing`, `CaptureSource`, `shellRows`, `EffectPanelModel`, `TuningControls`) can stay plain JS and be imported by React, as `ErrorShell.tsx` does.

## Decisions

- Build (owner leaning, 2026-11-23): add the Dashboard and NUX as pages of the existing graph-editor Vite project, like `recipes.html`, not a sibling project. Open: Node policy for the main UI, how the demo consumes the bundle. Both go in `Aurora-4nqt.1`.
- Migration is hybrid and per piece, not a big bang. Grille's `mountIsland(el, node)` mounts React into an element owned by vanilla code. A React piece gets a wrapper class with the same API as the class it replaces, so callers do not change. Aurora does not use `mountIsland` yet.
- Order: shell island first (rows come in as props and `ErrorShell` fetches nothing), then leaf islands, then NUX screens, then the Dashboard, then flip `app.js` and retire vanilla. Each step keeps a working app and a passing demo build.
- Grille gaps (Switch, Checkbox, Slider release, Select ids, Disclosure open-from-outside, power icon) are mocked in Aurora first. Nothing is filed in Grille until the owner asks.

## Risks to check

- Grille `ui.css` against `tokens.css` globals and the global `:focus-visible` rule (the editor loads both, the Dashboard has not).
- The demo vendor closure check flags any import outside `MANIFEST.json`, and a wrapper importing a built bundle needs the demo to build that bundle. `demo-boot.js` fakes the `app` facade and has to feed the shell's props.
- Focus order and Escape across vanilla and React popups (Grille `docs/lessons/components.md`).
- The snapshot and pulse state for `ErrorShell` lives in the editor's `App.tsx` today and has to be extracted to a shared hook before the Dashboard can reuse it.
- Tests that stub a component by its class may need updates, and the 1067-line Dashboard test has to be ported or retired.

## Beads

Epic `Aurora-4nqt`. Order and dependencies:

- `.1` decide build and delivery, `.2` editor shell on `MessageRow`, `.5` Grille mock for the gaps. These start with no build change.
- `.3` main page loads a bundle (needs `.1`), then `.4` shell island (`.2`, `.3`), `.6` leaf islands for shell pieces (`.3`), `.9` EffectPanel rebuild (`.3`), `.7` leaf islands for controls (`.3`, `.5`).
- `.8` NUX screens (`.6`, `.7`), `.10` Dashboard screen (`.7`, `.9`), `.11` flip the router and retire vanilla (`.8`, `.10`).
