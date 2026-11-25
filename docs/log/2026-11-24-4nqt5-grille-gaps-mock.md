# Grille mock for the Dashboard and NUX gaps

Id: 4nqt5-grille-gaps-mock

`Aurora-4nqt.5` (P3, 1.2.1). A dev-only mock of each Grille gap the Dashboard and NUX need, approved by the owner 2026-11-24. The asks were filed in Grille as epic `Grille-0u5` (`.1` to `.5`). Grille v0.2.2-dev.2 shipped all five, dev.3 fixed the two follow-ups, the editor pin moved to dev.3, and the mock now draws the real components. `Aurora-4nqt.7` adopts them. Plan: [[react-grille-migration]].

- Mock: `web/graph-editor/gaps-mock.html` and `src/mock/GapsMock.tsx` (`npm run dev`, `/graph-editor/gaps-mock.html`). Each frame draws the live `web/ui` piece (`Dropdown`, `AccordionSection`, the `.toggle-row` markup, the range input) beside a React Aria stand-in on Grille tokens. Not in the build.
- List changed from the bead's first draft. Checkbox dropped because all 7 `web/ui` checkboxes are the toggle switch. Back arrow dropped because Grille `arrowLeft` is the same Vidstack path as `back-arrow.svg`. WebXR check dropped, it belongs to RockyRoad (`Grille-0up`).
- Switch (`Grille-0u5.1`): tokens that equal Aurora's values. Off `--ui-color-control-bg`, on `--ui-color-strong-bg`, white knob, 35x20. Disabled is a 0.5 dim, which differs from today where a disabled switch has no style.
- Slider (`Grille-0u5.2`): value follows `onChange`, `onChangeEnd` fires once per gesture. A held arrow key ended on every repeat in bare React Aria, so the stand-in defers to key up and blur. Also Aurora's colours, a full-width 8px track, the header row with a bold label and the value at right, and a 10px gap.
- Select (`Grille-0u5.3`): `{id, label}` options, `isDisabled`, full-width trigger. The commit rule (list choices only) already matches.
- Disclosure (`Grille-0u5.4`): an accordion variant, controlled by `isExpanded`. Header measured the same as `dashboard.css` (486x43, 8px radius, `12px 21px`).
- Power icon (`Grille-0u5.5`, glyph weight fixed in dev.3): Zest `power-symbol.svg` is Zest Pro only, so Grille shipped `powerIcon` from OpenMoji (23FB, CC BY-SA 4.0) instead. Stop is a local style (`--ui-color-control-bg-hover`), not a Grille ask.
- Departures from today, kept in the mock captions: the 0.5 disabled dim on the switch, icon buttons 31px against 32px, and the Select trigger showing the option label where today's starts with the raw value.

## Grille v0.2.2-dev.2 check
- Pin: `node tools/grille/switch.mjs dev v0.2.2-dev.2`. dev.2 removes `undoIcon`, `redoIcon` and `downloadIcon`. No Aurora source imports them, so nothing needed changing.
- Switch: 35x20, off `rgb(51,51,51)`, on `rgb(139,139,139)`, white knob, all equal to today's. Disabled dims to 0.5.
- Slider: one `onChangeEnd` on pointer release. A held key gave 4 live changes, none during the hold, and 1 on key up. Full-width track 444px (today 444px), 8px high, colours and bold label equal.
- Slider differences from today on dev.2 were label to track 16px (today 10px) and a white label (today `rgb(200,200,200)`). Both are fixed in dev.3.
- Select: arrows on the closed trigger do not commit. A pick returns the id (`120`) and shows `120 Hz`. Width equal at 444px. Disabled is 0.4 opacity.
- Disclosure `variant="accordion"`: header 486x43, fill, 8px radius, `12px 21px` padding, 14px font and white text all equal. Opening from an outside button works. Collapsed mounting was not rechecked on dev.2.
- Power icon on dev.2: at `size="sm"` the OpenMoji glyph filled its box and read about twice today's size. Fixed in dev.3.

## Follow-ups filed
- Grille: `Grille-cf3` (slider label gap 10px and secondary label colour) and `Grille-jdf` (repad `powerIcon` so its ink matches the arrow). The Grille epic `Grille-0u5` is closed.
- Aurora: `Aurora-4nqt.12`, an inset focus ring for Select options in `tokens.css`. Aurora's unlayered global `:focus-visible` rule draws an outer ring on Grille's `.ui-option`, and Grille's `@layer ui` cannot beat it. `Aurora-4nqt.7` depends on it.
- `Aurora-6f9b`: the flaky `shell-cap` check above.
- Not filed: Select disabled at 0.4 opacity (Grille's own button rule), and today's Select trigger starting with the raw value, to check in the running Dashboard.

## Grille v0.2.2-dev.3 check
- Pin: `node tools/grille/switch.mjs dev v0.2.2-dev.3`. `tsc --noEmit` clean and `vitest run` 377 of 377 (30 files) from the `D:/` path.
- `Grille-cf3` fixed: slider label to track is 10px (today 10px) and the label is `rgb(200,200,200)` (today the same).
- `Grille-jdf` fixed: `powerIcon` viewBox is `-4 -4 32 32`, and its ink at `size="sm"` is 12.1 x 12.7px against the arrow's 12.5 x 11.4px, centred (offset 0,0).
- Unchanged from dev.2: switch, select, accordion and held-key slider results above, and the 0.4 disabled Select. A Vite dev server kept serving the cached dev.2 package until it was restarted with `--force`.
- Gates on dev.3: 44 web node tests, the vendor closure check, the demo graph and descriptors checks, the editor build, the recipes build and the demo editor build (`build-editor.py`) all passed. The editor browser set passed 17 of 17 and `dashboard-shell` passed.
- `shell-cap` failed 2 of 5 runs on one Dashboard assertion (400x420, the first new row pulses with itself in view) and passed 36 of 36 the other 3. `Aurora.exe` was built 2026-11-23, before the bump, so the Dashboard cases did not run dev.3. Not reproduced on a clean baseline, filed as `Aurora-6f9b`.
- Not run: `docs/api/gen-openapi.py --check` (needs a pip install, nothing under `docs/api` changed).

## Verification
- `tsc --noEmit` was clean. The mock was driven headless (Playwright, cached Chromium) against the Vite dev server with no console errors.
- Measured: switch 35x20 and colours equal on both sides. Accordion header size and colours equal. Stop and Back fills equal (`rgb(81,81,81)`, `rgb(51,51,51)`). Slider label to track 10px on both sides, label weight 700 on both.
- Slider behaviour: pointer drag gave one end on release, a held key gave 4 live changes then 1 end on key up, a single tap gave 1 end.
- Not run on dev.2: the editor browser checks, the demo build and the web CI loop. Gates that were run: `tsc --noEmit` clean and `vitest run` 377 of 377 (30 files) from the `D:/` path.
- Not checked: today's slider fill did not render in headless Chromium (the track gradient computed to none), so its colour was read from `forms.css`, not seen. Today's Select trigger starts with the raw value as its label per `TuningFields`, not compared in the running Dashboard. Firefox and Safari not run.

## Lessons
- [[lesson-planning]]: audit the consumers before listing a gap to request, and check an icon's licence tier.
- [[lesson-components]]: React Aria Slider ends on every key repeat.
- [[lesson-build-toolchain]]: a running Vite dev server keeps serving the old Grille after a pin change.
- [[lesson-web-testing]]: the Dashboard cases of a browser check run the app's embedded bundle.
