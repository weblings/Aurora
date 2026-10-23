# Aurora-8ydf step 1: Wayland rate-cap review + tests (motion run open)

Id: 8ydf-wayland-rate-cap-review

2026-10-20. Box: this dev box (i5-1334U, Intel iGPU, Ubuntu GNOME Wayland,
unoptimized scratch build). Asked to review the Wayland counterpart of the
X11 improvements against its bead, and test it if it looked right. No
separate "Mac" author or branch exists in the repo (all recent commits are
Andrew's, no peer sessions); the change under review is HEAD `3b7a4d6`
("rate-cap the PipeWire frame copy at 20 fps", `Aurora-8ydf` step 1), which
ports X11's 50 ms grab cap (`Aurora-1pwk`, `kMinGrabIntervalMs`) to the
PipeWire path.

## Change (HEAD `3b7a4d6`, 5 files)

- New pure `PipewireCopyGate` (`input/linux/include/.../PipewireCopyGate.hpp`):
  first copy free, then at most one per 50 ms (`kPipewireMinCopyIntervalMs`,
  matching X11), deadline measured from the last copy, backwards clock
  waits one interval.
- `PipewireGrabber::_onStreamProcess` dequeues each buffer; when the gate
  says wait, it holds the newest early buffer (requeues the previously held
  one unread) and arms `holdTimer` for the remaining wait. At wait == 0 it
  drops the held buffer unread and copies the newer frame. `_onHoldTimer`
  copies the held buffer so the last frame before a quiet screen still
  lands (PipeWire sends no repeats, unlike X11's poll). `_copyFrame` stamps
  `onCopied` only on a real copy; skip paths requeue without touching the
  gate. `_onStreamRemoveBuffer` clears a removed held buffer; disconnect
  destroys the timer. Everything is PipeWire-loop-thread only (timer,
  stream and teardown all live on `m_pipewireThread`), so no cross-thread
  race; the repo's `pw_loop_update_timer` lesson (silent data loss when
  bounding a pre-run sync) does not apply -- arming from the loop thread
  during streaming matches the existing traceTimer pattern, and every
  disarm site nulls the held buffer first with `_onHoldTimer` no-op'ing
  on null.
- 3 new `PipewireCopyGate` unit cases in `PipewireTests.cpp`.

## Review verdict

Matches the bead's step 1 ("queue the buffer back unread when the last
copy is younger than the cap"), with one justified adaptation: the bead's
literal sketch drops early frames, which on a push stream would lose the
final frame before quiet and leave stale colours on the lights; holding the
newest early buffer and copying it on the timer is the correct port of
X11's re-serve-the-cached-frame behaviour. Newest-wins, single outstanding
held buffer (no compositor starvation), fail-soft when the timer is missing.
No slice README change: no new toggles or entry points.

## Tests

- `AuroraInputLinuxTests` rebuilt from HEAD in a scratch `/tmp` build
  (X11 off: this box lacks `libxdamage-dev`, so the main `build/` dir no
  longer configures after `aa96f81` made Xdamage REQUIRED -- pre-existing
  env gap, `docs/Building.md` already lists the package, no sudo here).
  Full ctest gate: 75/75 pass, including the 3 new gate cases. The 2
  `[isolated]` portal cases fail only when run in a single process (static
  bus cache); each passes alone and under ctest -- pre-existing, unrelated.
- Live: devstack up with the new binary on this Wayland session, real
  `linux` capture, first SSE frame with per-zone colours, no portal dialog
  appeared, no `[pw] capture stalled` (1t1) warnings; trace `cb` 16-17/s
  on the active desktop. Two self-inflicted detours, no repo impact: the
  first app build omitted the Hue slice (404 on `/api/hue/connection`),
  rebuilt with it; the motion run (fullscreen ffplay stripes) was cancelled
  mid-run and left the mover up until killed by hand.
- Open, not measured: capped-rate engagement under real motion (delivery
  here never exceeded ~17/s, so the 50 ms gate never bound) and the
  Framework before/after the bead asks for. Needs a re-run with visible
  motion, ideally RelWithDebInfo (this scratch build is `-O0`).

## Lessons

- None filed (no repo-persistent gotcha met; the `pkill -f` self-match that
  killed my own shell is generic shell knowledge).
