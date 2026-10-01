# Aurora-ta5: C++ param schema as single source for tuning ranges

Id: ta5-param-schema

Closed `Aurora-ta5` (node-prep, item 1 of [[node-graph-pipeline]]'s prep
work). Slider ranges were defined only in `web/ui/TuningFields.js`; C++
had one hand-copied clamp (5y0) and ten unclamped setters.

## Change

- `Contracts::ParamSchema` (label, min, max, step, unit, defaultValue,
  allowsUnset) as an optional `param` on `ControlDescriptor`. The 12
  numeric settings' descriptors in `ControlDescriptorTables.cpp` carry it;
  defaults are read from `ConfigData{}` (function-local static, safe from
  static-init order).
- `paramSchema(key)` / `sanitizeParam(key, value)`: non-finite → default,
  below min → -1 when `allowsUnset` (fixed hue), else clamp. Every numeric
  `Config` setter uses it, and `Config(ConfigData)` re-runs them, so
  `ConfigStore::fromJson` output is sanitized too; 5y0's two-setter loader
  stopgap removed.
- `/api/descriptors` entries gain `param`; floats serialize in shortest
  decimal form (`shortestDecimal`), since the UI derives displayed
  decimals from the step's digits.
- WebUI: `Tooltips.js` caches `param` alongside descriptions
  (`paramFor`, `descriptorsSettled`); `TuningFields.js` keeps only layout
  (which keys per section) and builds slider tuples via exported
  `slidersFromParams`; missing ranges show a notice instead of invented
  numbers. `sliderTooltipKey` exported from `TuningSliderGroup.js`.
- Not moved: dropdown option lists (refresh presets, interpolation names,
  subsample candidates). `web/demo/vendor/webui` is a fork (Aurora-4jl),
  untouched.

## Verification

- Core 93/93 (schema-wiring test: every slider has a schema and a wired
  setter; per-setting clamp/NaN/Inf/unset; raw `ConfigData` sanitized;
  JSON dump has `"step":0.01`). Parity fixtures unchanged.
- `web/ui` node tests pass incl. new `TuningFields.test.mjs` (run via VS
  Code's Electron, no `node` here).
- Mac app 62/62; live stack: 12 params served, out-of-range `PUT`
  clamped. Owner checked Tuning in Video and Audio: looks and works as
  before.

## Findings

- Live `curl` caught nlohmann widening `0.01f` to `0.009999999776482582`
  (would have shown 18 decimals); unit tests on parsed values hadn't.
- UI check surfaced `Aurora-3qh` (P1, pre-existing): Mac video mode
  resizes full-Retina ScreenCaptureKit frames on the CPU every tick,
  overrunning the 60Hz budget inside `PipelineHost`'s lock; the app pins a
  core and `/api/monitors`/`/api/zones` wait 2-30s, so the Dashboard's mode
  toggle looks stuck after a switch.
- Lessons: float→JSON widening (`language-cpp`); VS Code Electron as
  Node (`build-toolchain`).
