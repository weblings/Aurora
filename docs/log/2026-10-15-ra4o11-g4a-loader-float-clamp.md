# G4a: loader clamps Float params (Aurora-ra4o.11)

Id: ra4o11-g4a-loader-float-clamp

Closed 2026-10-15. First of the agent-path fixes carried out of the G2 review
of [[nodes-agent-ux]], done before Sequence B so the agent write path is not
the first thing to hand the loader an out-of-range value.

## Done

- `loadGraph` clamps Float and OptionalFloat params to the declared
  `ParamSchema` range (`clampToSchema` in `GraphLoader.cpp`). Non-finite
  resets to the default, below min becomes unset (-1) when the schema allows
  it, otherwise clamp. Same rule as `sanitizeParam`, kept as a local copy
  because that function looks params up by config key.
- Clamp, not reject: an agent graph with `smoothing 5` loads and runs at the
  max, matching how the Tuning controls already treat writes.
- Test: "Graph loader clamps Float params to the declared range". The probe
  node records the Float and OptionalFloat values it evaluates, since
  `Graph::findNode` is private.
- Windows MSVC Debug: full suite 248/248, parity goldens unchanged.
- Lessons: 1 (language-cpp, out-of-range JSON numbers narrow to infinity).

## Carried forward

- Mac and Linux builds (only Windows run here).
- Remaining G2-review items: Aurora-ra4o.12 (`toDescriptors()` metadata),
  .13 (`fixedAnchorHue` re-seed, may move goldens), .14 (Absent-tick anchor).
