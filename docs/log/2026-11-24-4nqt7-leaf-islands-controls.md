# Leaf islands: controls

Id: 4nqt7-leaf-islands-controls

`Aurora-4nqt.7`, and `Aurora-4nqt.6`, closed with its scope moved (see Beads). The Dashboard and onboarding controls draw on Grille components when the islands bundle is loaded. Each vanilla class keeps its API and its old markup, which is the fallback and what the node tests run.

- New islands in `web/graph-editor/src/islands`: `Controls.tsx` (Select, Switch, Slider, black-handling segmented control), `Panels.tsx` (SettingsPanel, PairedDevices) and `live.tsx` (`mountLive`, the mount-once-and-feed-props helper that `mountErrorShell` now uses too).
- `Dropdown` returns an island-backed twin with the same methods. It reads the external label and hides it, shows the selected option's label, and cannot open or close from code. `DeviceField` passes `onOpen` instead of wrapping `openMenu`, and `TuningFields` calls `setDisabled`.
- `TuningSliderGroup` emits a slot and mounts a Slider per row. `wireSliderGroup` takes `{ disabled }` and returns an unmount function. The unit joins the label (`Hold time (s)`) since Grille's Slider has no unit readout.
- Switch islands: SettingsPanel, the optional-control toggle in `TuningFields`, `ZoneActiveToggleList` and ZoneCanvas Active. Slider islands: ZoneCanvas Gamma and the black-handling sliders. `ZoneActiveToggleSingle` is unused and was left alone.
- `forms.css` gained three small rules for the islands. The demo vendor copy was re-synced.
- Not done: the Stop to `powerIcon` move and its icon, manifest and notices cleanup. Stop is not in this bead's list, so it stays with the Dashboard screen bead.

## Found in a real browser
- The page resets (`web/ui/styles/page.css` `*`, the demo's `:where(.db-port) *`) were unlayered, so they zeroed the padding of every Grille element (Select trigger 20 px tall, not 35). Both now sit in `@layer reset`, as Grille's README asks.
- Grille's `.ui-field` pads 10 px top and bottom for FieldList rows, zeroed for the islands in `forms.css`. The page keeps drawing its own Zone and Active labels, the islands' labels are visually hidden.
- Checked headless (Playwright) on the demo's Zone row against the vanilla one: same 56 px row, same trigger height. Gamma reads `0` where vanilla read `0.0`, Grille's output has no step formatting.

## Walkthrough fixes
- The Gamma slider floated above its row: Grille's header and track are one block, so centring it in the 35px band lifted the header. The slot is now a plain field and `.zm-gamma-island .ui-slider-header` sets an 11.5px gap, which puts the track on the Select and Switch centre line. Filed upstream as `Grille-rga`.
- The demo's popovers rendered in Times because they portal to `body` and the demo sets the font on `.db-port` only. `demo-layout.css` gives `.ui-popover` the font. The app's `body` sets it.
- The Switch lost the old 0.2s ease. Filed upstream as `Grille-chz`.

## Beads
- New under `Aurora-4nqt`: `.13` remove the inert slider wrapper (no control reaches a disabled slider: custom effect controls are all writable and every built-in control has a config key), `.14` audio sink refresh on open on Mac and Linux, `.15` and `.16` VoiceOver passes for the NUX and the Dashboard, `.17` Mac and Linux platform checks.
- `.6` closed with its scope moved to `.8` and `.10` (see the planning doc).

## Gaps found
- Grille's Slider has no disabled state, so a read-only slider is `inert` at 0.4 opacity here. Select has no open event, so the island reports the press that opens it.

## Not checked
- Only the demo's Zone row was compared in a browser. Tuning, black handling, Settings and Paired devices were not.

## Lessons
- [[lesson-layout-css]]: an unlayered page reset zeroes every Grille component's padding, and a Grille popover portals outside the page's font scope.
- [[lesson-webui-testing]]: a Grille mock on its own cannot show page CSS clashes.
- [[lesson-build-toolchain]]: the Windows app executable target is `aurora-app-windows`.
