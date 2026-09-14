# Windows Input plugin — analysis pass

Lighter pass than phase 1's ports, per `ImplementationPlan.md`'s own scoping:
huenicorn's `WindowsAdapter::_createGrabber` is a genuine stub (verified by
reading `WindowsAdapter.cpp` — `(void)config; return nullptr;`), so there's
no upstream logic to port. This is original work against `IInput`'s existing
contract plus Microsoft's Desktop Duplication API docs, verified before
coding rather than assumed.

## Toolchain: native Windows, not WSL/MinGW cross-compile

- WSL2's gcc can't touch this at all — DXGI/COM don't exist inside the Linux
  VM. Unlike every prior module, WSL isn't a viable build target here.
- MinGW-w64 cross-compiling from WSL was considered: it can technically
  produce a Windows `.exe` against `d3d11.h`/`dxgi1_2.h`, but that binary
  still has to run against a live Windows desktop session to mean anything —
  so cross-compiling only moves the *compile* step off Windows, leaving all
  the real work (the acquire/release/reacquire loop against real hardware)
  on Windows regardless. vcpkg's mingw triplets are also less exercised for
  OpenCV/libcurl/mbedtls than its MSVC ones. Set aside as more roundabout for
  no benefit.
- **Decision: native Windows toolchain** — Visual Studio Build Tools (C++
  workload) + CMake, kept terminal-driven so the existing configure/build/
  ctest workflow doesn't change shape. vcpkg for OpenCV/libcurl/Mbed TLS;
  glm/nlohmann_json keep the existing find-or-`FetchContent` pattern (still
  header-only).

## Desktop Duplication API — verified shape

Setup sequence: `CreateDXGIFactory1` → `EnumAdapters1` → `EnumOutputs` →
`QueryInterface<IDXGIOutput1>` → `D3D11CreateDevice` (on that adapter) →
`output1->DuplicateOutput(device, &duplication)`.

Per-tick: `AcquireNextFrame(timeoutMs, &frameInfo, &resource)` →
`QueryInterface<ID3D11Texture2D>` → `ReleaseFrame()` once done with it.

- **Format is always `DXGI_FORMAT_B8G8R8A8_UNORM`**, regardless of display
  mode — matches `Contracts::PixelFormat::BGRA` already. No `Contracts`
  changes needed.
- The returned texture is GPU-resident, not directly readable — needs a
  `D3D11_USAGE_STAGING` texture + `CopyResource` + `Map`/`Unmap` to get bytes
  into a `cv::Mat`. This is DXGI's equivalent of `X11Grabber`'s XShm
  shared-memory step: same shape of problem (get compositor-owned pixels
  into CPU memory), different mechanism.
- **`GetFrameDirtyRects`/`GetFrameMoveRects` deliberately not used.** That
  machinery exists so remote-desktop clients can reconstruct a full image
  from incremental network updates. Aurora always wants one full current
  frame per tick for local crop/average (`composeFrame`), so this is skipped
  entirely — a real simplification versus the reference sample, recorded so
  a future reader doesn't wonder why it's missing.
- **Cursor data (`PointerPosition`/`GetFramePointerShape`) also skipped** —
  Aurora only averages color, it doesn't render a preview; huenicorn's own
  grabbers never touched cursor data either.
- **Rotation**: the surface `AcquireNextFrame` returns is always in the
  *unrotated* orientation regardless of the display's actual rotation
  setting. A portrait-rotated monitor would capture sideways relative to a
  user's configured zone UV rects. Real correctness gap, most users won't
  rotate a monitor — deferred, but left as a comment/TODO rather than
  silently mishandled.

## Hardware-verified pass — `Aurora-Input-Windows`'s `WindowsGrabber`

Built and manually verified against this machine's real desktop (real
`AcquireNextFrame`/`Map`, not just a clean compile). Two corrections to the
research above, found only by actually running it:

- **`AcquireNextFrame(0, ...)` (non-blocking poll, as recommended above) is
  broken in practice** — it can return `S_OK` with an empty placeholder
  frame indefinitely instead of ever producing real data or a clean
  `WAIT_TIMEOUT`. Also: the very first `AcquireNextFrame` call after
  `DuplicateOutput()` always returns one empty placeholder frame
  (`AccumulatedFrames`/`LastPresentTime` both `0`), regardless of timeout —
  expected and harmless for a continuously-ticking loop, not worth
  special-casing. **Fixed:** use a real short timeout (`16`ms, one 60Hz
  interval) instead of `0` — verified reliable across repeated runs. Filed
  as an `input.md` lesson.
- **The "HDR desktops return `R16G16B16A16_FLOAT`" finding above turned out
  to be a false positive**, not a confirmed hardware result: the *first*
  (placeholder) frame's format metadata read as `R16G16B16A16_FLOAT` on this
  machine, but every real frame after it read `B8G8R8A8_UNORM` — the
  placeholder frame's format field isn't trustworthy. The defensive
  HDR-handling code (clamp scRGB linear to SDR range, gamma-encode, tag
  `RGBA`) is kept since it's cheap and harmless, but it has **not** actually
  been exercised against genuine HDR content — corrected from the earlier,
  overstated "verified on hardware" claim.
- Also confirmed real: a monitor Windows still enumerates as
  `AttachedToDesktop` (and DWM may still actively present real frames to)
  can be genuinely powered off, reading back as valid, in-range, all-black
  data — not an error, not distinguishable from "real black content" by the
  API. `WindowsGrabber`'s monitor selection (primary-by-default, same as
  `X11Grabber`) has no way to detect this; whoever configures which monitor
  to capture needs to check manually, same as picking the wrong monitor
  index would be a user-configuration mistake on Linux too.

## Failure modes to handle explicitly

- `DXGI_ERROR_WAIT_TIMEOUT` — not an error, just "no change since last
  tick"; reuse the last frame.
- `DXGI_ERROR_ACCESS_LOST` — desktop switch, display-mode change, DWM
  toggle, fullscreen-exclusive transitions. Release the duplication
  interface and redo the full setup sequence. Same shape of problem
  `XdgDesktopPortal` already solves on Linux (a session that can go invalid
  and must be re-established) — a recognizable pattern to reuse
  structurally, not a new concept for this codebase.
- `E_ACCESSDENIED` from `DuplicateOutput` — fires specifically when the
  secure desktop is active (UAC consent prompt, lock screen): per Microsoft's
  docs, "only an application that runs at LOCAL_SYSTEM can access the secure
  desktop." A normal user-mode Aurora process will transiently fail to
  (re)acquire whenever a UAC prompt or the lock screen is up. Expected and
  transient, not fatal — same retry-next-tick treatment as `WAIT_TIMEOUT`.
- `DXGI_ERROR_SESSION_DISCONNECTED` — RDP disconnect; same transient-retry
  treatment.
- Community-reported (not official-docs) rough edge: black/zero frames on
  some GPU vendors specifically over an *active* RDP session, even when
  "connected." Flagged so it isn't mistaken for a new Aurora bug if hit
  later — not something to chase proactively.
- `DXGI_ERROR_NOT_CURRENTLY_AVAILABLE` — default cap of 4 concurrent
  duplication interfaces per session. Unlikely to matter; one-line note only.

## Mapping onto `IInput`

- `hasCustomScreenManagement() = true`; `selectMonitor(id)` re-creates the
  duplication interface on the newly selected output — same pattern
  `X11Grabber` already uses for RandR outputs.
- `_initMonitorsList()` enumerates DXGI adapters/outputs into `MonitorData`,
  same shape as `X11Grabber`'s RandR enumeration.
- `grabFrameSubsample()` does acquire → staging copy → `Contracts::ImageData`
  tagged `PixelFormat::BGRA`, then reuses the existing `Processing` rescale/
  subsample path unchanged.
- **No `Contracts`/`Runtime`/`Orchestrator` changes anticipated** — confirmed
  by reading `IInput.hpp`: everything DXGI-specific stays inside the new
  plugin, same boundary `X11Grabber`/`PipewireGrabber` already prove out.
- One correction to `ImplementationPlan.md`'s phase 2 text: it names fixing
  `Algorithms::mean()`'s hardcoded BGR channel swap as this phase's moment —
  that's already done (`ProcessingAnalysis.md` finding 1, verified by reading
  `ImageProcessing.cpp`: it already switches on `PixelFormat` for both RGB*
  and BGR*). Nothing left to fix there.

## Follow-up pass — grounded against the existing ports, not assumed

Read `X11Grabber.cpp` itself (not just its header) before finalizing the
above — three things worth locking in now:

- **`grabFrameSubsample()` doesn't actually subsample.** Confirmed:
  `X11Grabber` grabs the full native display resolution every tick via
  `XShmGetImage` and hands it back as-is; downscaling happens later in
  `Processing`. So the DXGI plugin doesn't need any GPU-side resize either —
  a plain `AcquireNextFrame` → staging-texture copy → `Map` → `cv::Mat` at
  full resolution, once per tick, matches the existing precedent exactly.
  Not a new performance risk beyond what `X11Grabber` already accepts today.
- **Row-pitch + buffer-lifetime is a recurring pattern, this would be the
  third time.** `D3D11_MAPPED_SUBRESOURCE::RowPitch` can exceed
  `width * 4` bytes (GPU row-alignment padding), and the mapped pointer is
  only valid until `Unmap()` — the same two-part shape as Pipewire's buffer
  stride + "invalid after requeue" issue, which `Aurora-Input-Linux` already
  solved once, in `PipewireFrameBuffer.hpp`'s `toOwnedRgbaImage()` (explicit
  `cv::Mat` row-step constructor + `.clone()` before the source buffer goes
  away). Mirror that helper's shape here rather than re-deriving it — worth
  a `lessons/engineering-hygiene.md` entry once actually hit a third time,
  since "GPU/shared-memory capture buffers need an explicit stride + an
  owned copy before the source is released" has now shown up on two
  unrelated capture backends independently.
- **`AcquireNextFrame` is event-driven; `XShmGetImage` is poll-anytime —
  a real semantic difference the existing `WAIT_TIMEOUT`-as-reuse-last-frame
  plan happens to paper over correctly, not incidentally.** `X11Grabber`
  re-reads whatever's currently in the framebuffer regardless of how often
  it's called; DXGI's call blocks waiting for the *next* compositor-produced
  frame. Using a short/non-blocking timeout (recommend `0` — poll, don't
  block the tick loop) and treating `WAIT_TIMEOUT` as "keep last frame"
  reproduces `X11Grabber`'s effective behavior despite the different
  underlying model. Worth stating explicitly so a future reader understands
  *why* the timeout has to be short, not just that it is.

Two more, not from the Linux ports but from the API docs read for this pass:

- **COM RAII**: use `Microsoft::WRL::ComPtr<T>` (`<wrl/client.h>`, ships with
  the Windows SDK, no new dependency) for `IDXGIFactory1`/`ID3D11Device`/
  `IDXGIOutputDuplication`/etc. — the direct equivalent of `X11Grabber`'s
  hand-rolled `XUniquePtr` deleters, but COM already has the idiom built in.
- **Hybrid-graphics laptops**: `DuplicateOutput` requires the `ID3D11Device`
  be created on the *same adapter* the target `IDXGIOutput` belongs to. The
  enumeration order above (adapter → its outputs → device on that adapter)
  already gets this right by construction, but "just create a default D3D11
  device" is the naturally-tempting shortcut that breaks on a dual-GPU
  laptop — worth a one-line comment at the call site when this gets coded,
  not just left implicit in this doc.

## Repos

- New `Aurora-Input-Windows` — mirrors `Aurora-Input-Linux`'s shape: own
  CMake option gating, own tests for whatever turns out pure (worth checking
  for a small extractable piece the way gamescope-node-matching turned out
  to be on the Pipewire side, even though the capture path itself looks
  entirely I/O-bound like `X11Grabber`).
- New `Aurora-App-Windows` also needed — `Aurora-App-Linux`'s `main.cpp` is
  POSIX-specific in two spots that don't port as-is: `std::signal(SIGINT/
  SIGTERM, ...)` (wants `SetConsoleCtrlHandler` for console-close on
  Windows) and `resolveConfigRoot()`'s `$HOME/.config/aurora` fallback
  (wants `%APPDATA%`, matching huenicorn's own `WindowsAdapter::
  getConfigFilePath()` convention: `%APPDATA%\Huenicorn`).

## Dependencies on Windows

`Aurora-Output-Hue`'s libcurl/Mbed TLS need to actually build+link on
Windows — untested territory (only ever built on Linux/WSL2 so far).
huenicorn's own `WindowsAdapter` links `ws2_32`/`mswsock`/`crypt32` for
exactly this reason (WinSock init, Windows crypto) — a concrete hint that
`Aurora-Output-Hue/CMakeLists.txt` will need an equivalent Windows-only
`target_link_libraries` branch, same shape as the pkg-config-vs-`find_library`
fallback already added for the Ubuntu device's older Mbed TLS.

## Next steps

1. Toolchain setup: native Windows (VS Build Tools + CMake + vcpkg) — see
   above.
2. `Aurora-Input-Windows` repo skeleton.
3. Prototype just the init+acquire+reacquire loop against a real Windows
   session before wiring into `IInput` fully — mirrors how `X11Grabber`/
   `PipewireGrabber` were "mechanically ported, builds, needs a real session
   to verify," except here the API itself is unverified-by-porting too, so
   proving the raw loop works comes before wrapping it in `IInput`.

## Sources

- [Desktop Duplication API — Win32 apps](https://learn.microsoft.com/en-us/windows/win32/direct3ddxgi/desktop-dup-api)
- [IDXGIOutput1::DuplicateOutput](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_2/nf-dxgi1_2-idxgioutput1-duplicateoutput)

## Related docs

- `ImplementationPlan.md` — phase 2, which this doc fulfills the "analysis
  pass first" step for.
- `LinuxCaptureAnalysis.md` — `X11Grabber`'s shape, mirrored throughout above.
- `DistributedArchitecturePlan.md` — unaffected by this: a Windows `IInput`
  is exactly the kind of swap the one-seam/double-seam question already
  anticipated, nothing here forces a seam-count decision now.
- `StackComparison.md` — this doc's DXGI/ComPtr findings shown side-by-side
  against `X11Grabber`'s equivalents and huenicorn's original single-adapter
  shape.
