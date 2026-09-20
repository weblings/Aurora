# Runtime follow-up: Orchestrator (2026-09-13)

Moved out of RuntimeAnalysis.md — RuntimeAnalysis.md — the analysis keeps the design, this file keeps the follow-up build record.

---

## Follow-up pass: `Orchestrator` — built and tested against fakes

Built `Aurora::Runtime::Orchestrator`, the piece deferred above, plus a
small pure helper it needed:

- **`pickDefaultSubsampleWidth`** — ported huenicorn's inline
  `_initSettings()` search (smallest subsample candidate that's still
  ≥ 1% of the real display width) as its own pure, tested function.
- **`Orchestrator`** — ties one `Input::IInput&` to any number of
  `Output::IOutput*` per tick. Deliberately has **no threading/timing of
  its own**, unlike huenicorn's `Runtime` (no `LoopRegulator`, no
  `std::jthread`) — `update()` is a single synchronous tick a future real
  app entry point calls at `Config::refreshRate()`. This is what makes it
  testable at all: `init()` (fills in unset `refreshRate`/`subsampleWidth`
  from the display, reconciles + persists each output's zone map against
  its live `zoneIds()`) and `update()` (grab → rescale/`dropAlpha` →
  `composeFrame` → `Smoother` → `send()` per output, no-op if the input
  hasn't produced a frame yet) are both exercised with a `FakeInput`/
  `FakeOutput` test-only pair (`core/tests/OrchestratorTests.cpp`, same
  fake-fixture pattern as `Aurora-Input-Linux`'s `TestInput`) — no real
  display, bridge, or threading involved. This is the first proof that
  `Config`/`ZoneMap`/`reconcileZoneMap`/`composeFrame`/`Smoother`, so far
  only unit-tested in isolation, actually compose into a correct per-tick
  loop matching huenicorn's `_update()` semantics (confirmed with a
  synthetic split-color frame: two zones crop out the two known colors
  correctly even after a real rescale step in between).

**Result: 23/23 core tests passing** (8 Processing + 8 Runtime pieces + 3
`pickDefaultSubsampleWidth` + 4 `Orchestrator`). Rebuilt `Aurora-Output-Hue`
(10/10) and `Aurora-Input-Linux` (11/11) against this core too — both still
clean, since `Orchestrator`'s new dependency on `AuroraInputInterface`/
`AuroraOutputInterface` only affects `core/CMakeLists.txt`'s
`add_subdirectory` ordering (`Runtime` now added last, after `Input`/
`Output`), not either interface's own shape.

**Still not built:** a real app entry point that constructs a real
`IInput`/`IOutput` pair, calls `Orchestrator::init()` once, and drives
`update()` in an actual timed loop — that's `Aurora-Output-Hue`'s I/O layer
plus a small `main()`, not `Orchestrator` itself.

See [`DistributedArchitecturePlan.md`](DistributedArchitecturePlan.md) for
an open question this shape feeds into: whether `Orchestrator` should
eventually accept a `Frame` from more than one kind of upstream source
(live-composited via `IInput`, or handed directly by an authored-track/VJ
bridge that skips cropping entirely), and how far Input/Processing/Output
might eventually be split across separate devices. Not resolved, doesn't
block anything built so far.

See [`StackComparison.md`](StackComparison.md) for `Orchestrator`'s
tick-by-tick data flow shown side-by-side against huenicorn's
`Runtime::_update()` and both real `IInput` backends now behind it.
