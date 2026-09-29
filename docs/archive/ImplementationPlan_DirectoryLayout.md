# Implementation plan: proposed directory layout (superseded)

Id: implementation-plan-directory-layout

Status: superseded 2026-09-20 by the monorepo (slices now under input/,
output/, app/, web/); retained as history. Split out of
docs/planning/ImplementationPlan.md (Aurora-d8g) — the roadmap itself is
[[implementation-plan]].

`Aurora/` below is this git repo's own root (it has its own `.git`, separate
from huenicorn's). `huenicorn/` is **not** inside it — it's a plain sibling
clone on disk (this machine has both under one parent folder; that parent
folder isn't itself a repo and isn't architecturally significant). No git
link between the two: same relationship RockyRoad keeps to ChartPlayer (no
`.gitmodules` there either) — a reference codebase being read and distilled
into new code, not a compiled dependency, so it's cited by upstream URL in
prose (`https://gitlab.com/openjowelsofts/huenicorn.git`), not linked in git.
Submodules stay reserved for an actual future build-time dependency, if one
ever gets vendored as source.

Repo layout as of the 2026-09-13 split — one core repo, one repo per plugin,
all siblings on disk (not architecturally required, just this machine's
arrangement, same as `huenicorn/`):

```
../huenicorn/            <- untouched upstream reference clone, not in any Aurora repo
Aurora/                  <- core repo
  core/
    Contracts/             <- DONE: neutral shared types (ImageData, UV, Color,
                               Interpolation, Frame/Zone) — see ModuleSplitPlan.md
      include/Aurora/Contracts/
      src/Interpolation.cpp
    Processing/            <- DONE: ImageProcessing, ported with 3 bug fixes
                               found during the port, see ProcessingAnalysis.md
      include/Aurora/Processing/ImageProcessing.hpp
      src/ImageProcessing.cpp
      ISF/                 <- new (phase 5, native side is minimal — see below)
  web-processing/         <- new (phase 3, not started): hand-ported JS mirror
                             of Processing's crop/average math (rescale/
                             getSubImage/Algorithms::mean), kept in this repo
                             specifically so it sits next to the C++ it mirrors
                             for drift-checking (see BrowserAnalysis.md's
                             reuse-vs-reimplement finding). Aurora-Demo-Web
                             copies this source directly — no npm package for
                             now, see below.
    Input/                 <- DONE: IInput.hpp (refined with monitor selection +
                               divisor math, see LinuxCaptureAnalysis.md) + MonitorData.hpp.
      include/Aurora/Input/                          Concrete plugins live in their own repos now.
    Output/                <- DONE: IOutput.hpp, now with zoneIds() for live
                               zone discovery (see RuntimeAnalysis.md).
      include/Aurora/Output/IOutput.hpp
    Runtime/               <- DONE, see RuntimeAnalysis.md: Config/ConfigStore,
                               ZoneMap/ZoneMapStore (one profile file per
                               plugin), reconcileZoneMap, composeFrame,
                               Smoother (RGB, keyed per (outputId, zoneId)),
                               pickDefaultSubsampleWidth, and Orchestrator
                               (ties one IInput to any number of IOutputs
                               per-tick, no threading/timing of its own --
                               tested against FakeInput/FakeOutput). Not yet
                               built: a real app entry point/main() driving
                               it with real plugins in a real timed loop.
      include/Aurora/Runtime/
      src/
    tests/                 <- DONE (Processing + Runtime coverage): Catch2, see
                               ProcessingAnalysis.md/RuntimeAnalysis.md's test plans
  docs/               <- already exists
input/linux/       <- plugin repo, DONE for X11 + Pipewire (see
                             LinuxCaptureAnalysis.md): DummyGrabber,
                             SessionDispatch (tested pure logic), X11Grabber
                             (mechanically ported, builds against real
                             X11/Xext/Xrandr, needs a real X11 session to
                             manually verify actual capture), PipewireGrabber/
                             XdgDesktopPortal (mechanically ported, builds
                             against libpipewire-0.3/glib-2.0, needs a real
                             Wayland session + portal backend to manually
                             verify; gamescope-node matching and raw-buffer-
                             to-ImageData conversion extracted as pure, tested
                             helpers this pass). Restore-token persistence
                             (huenicorn's Core::Config dependency) resolved
                             via a minimal local IRestoreTokenStore interface
                             rather than waiting on Aurora core's Config/
                             Runtime. One CMake option per backend
                             (AURORA_INPUT_LINUX_ENABLE_X11/_PIPEWIRE) so unrelated
                             deps aren't forced — X11 and Wayland are one plugin's
                             two auto-selected backends, not two separate plugins
                             (see ModuleSplitPlan.md's repo-split section).
output/hue/        <- plugin repo, DONE (see HueOutputAnalysis.md): pure
                             logic (Colorimetry, Channel, HuestreamHeader/Payload,
                             BridgeAddress, Credentials byte-conversion) plus the
                             full I/O layer -- HttpClient (libcurl), ApiTools
                             (5 pure JSON-parsers + mechanical REST wrappers),
                             EntertainmentConfigurationSelector, DtlsClient/
                             MbedTlsImpl (Mbed TLS v3)/Streamer, and HueOutput :
                             IOutput tying it all together. Builds against real
                             libcurl/Mbed TLS; needs a real bridge to manually
                             verify capture actually reaches real lights.
app/linux/         <- new app repo, DONE (see DistributedArchitecturePlan.md
                             for why this got its own repo): Registry (name ->
                             factory for compiled-in plugins, tested) + main.cpp
                             (registers plugins per AURORA_APP_ENABLE_*, picks
                             which to run from Config::activeInputName()/
                             activeOutputNames(), drives Orchestrator::update()
                             in a real timed loop). First executable combining
                             all three repos -- builds and links clean against
                             every native dependency (X11, Pipewire/glib,
                             libcurl, Mbed TLS). Real end-to-end run (real
                             display + real bridge) pending the Ubuntu device.
web/demo/         <- new repo (2026-09-14, not started, phase 3
                             milestone 1): the Three.js browser demo. File
                             input (bundled WebM sample + upload), the 9-slice
                             Three.js virtual-light output, and the demo scene
                             itself — all new code, no counterpart in `Aurora`.
                             The one non-new piece (crop/average math) is
                             copied from `Aurora/web-processing/` rather than
                             owned here, see above. No CMake, no native
                             backend — own toolchain (see ModuleSplitPlan.md's
                             repo-split section for why this qualified for a
                             separate repo more clearly than any plugin has).
```

*Build history lives in
[log/2026-09-13-phase1-2-build-history.md](../log/2026-09-13-phase1-2-build-history.md)
— per-repo verification narratives (test counts, env setup, bugs found per
pass), not repeated here.*
