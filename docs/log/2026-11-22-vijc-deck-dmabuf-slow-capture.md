# Steam Deck: the DMA-BUF capture read is the 1 to 2 s light lag (slow-read fallback shipped)

Id: vijc-deck-dmabuf-slow-capture

`Aurora-vijc` (open, P2). On the Steam Deck (SteamOS 3.9.5, KDE Plasma Wayland, AMD APU) in the Arch Distrobox `aurora-dev`, color updates reached the lights about every 1 to 2 s. The cause is the CPU copy out of the mmapped LINEAR DMA-BUF: about 677 ms per frame, against about 3.3 ms from shared memory. Fixed for capture by a slow-read fallback to shared memory (`SlowReadWatch`, commit `Aurora-vijc: fall back to shared memory...`); the proper fix is filed (below). Setup is in `uai1-steamos-arch-distrobox`; why DMA-BUF is the default is in `1t1-fullscreen-freeze`.

## Method
- `AURORA_DEV_PW_TRACE=1`, `build/linux-app/bin/Aurora` in `aurora-dev`, 1280x800 BGRx, 25 to 40 s runs. The moving source was a fullscreen `ffplay -f lavfi -i testsrc2=size=1280x800:rate=60 -fs` (owner confirmed it was live on screen). Logs are in `~/.cache/aurora-trace/` on the Deck.
- The Distrobox itself is not the cause: containers have no CPU or memory caps unless `--cpus`/`--memory` flags were passed, and this box has none.

## Measured
| Run | Capture callbacks per second |
|---|---|
| default (DMA-BUF), screen mostly static | 1 to 2 |
| default (DMA-BUF), moving fullscreen source | 1 to 2, every callback a changed frame |
| `AURORA_PW_DMABUF=0` (memfd), moving source | 18 to 19, every callback changed |

- Negotiated `BGRx 1280x800 fps=90/1`. With DMA-BUF the format and "modifier negotiated" lines print twice at startup, once per stream start, and not again: one renegotiation, not a loop. `skipped=0`: Aurora drops nothing, the buffers just arrive slowly.
- So the slowdown starts at capture, and "static-frame reuse" is ruled out (every callback on the moving source carried a new frame).
- CPU is not the limit on memfd: the system was 77 to 80% idle, the busiest Aurora thread about 7%, `kwin_wayland` about 18%, `ffplay` about 50%. The remaining 19 fps is probably the portal or compositor pacing, not measured.
- Per-stage timing inside `_onStreamProcess` (temporary patch, reverted, source restored from a backup and rebuilt):

| Stage | DMA-BUF (n=25) | memfd (n=341) |
|---|---|---|
| `DMA_BUF_IOCTL_SYNC` start | 0.25 ms | 0.03 ms |
| copy out (`toOwnedImage`, decimating) | 677 ms avg (660 to 718) | 3.3 ms |
| content hash (trace only) | 2.7 ms | 0.14 ms |
| sync end | about 0 ms | 0.24 ms |

- 4 MB in about 680 ms is about 6 MB/s, which fits a CPU read of an uncached or write-combined GPU mapping. Not confirmed: which memory heap the LINEAR buffer lands in on the Deck's unified-memory APU.

## Overlap with Aurora-1t1
- 1t1 made LINEAR DMA-BUF the default because on GNOME 46 Wayland (Intel laptop) a memfd stream got empty CORRUPTED buffers in fullscreen and froze. `AURORA_PW_DMABUF=0` is its kill switch and brings that freeze back on GNOME.
- 1t1 never ran on AMD, KDE or gamescope (split to `Aurora-mvq1`, whose text already lists AMD readback cost as a risk) and measured DMA-BUF at 68% of a core vs memfd 79% on Intel.
- On the Deck it inverts: DMA-BUF 1.5 fps, memfd 19 fps, and memfd did not freeze under a fullscreen `ffplay` on KDE. The fullscreen memfd failure looks GNOME-specific. Not checked: a real player or a game, or Game Mode (`Aurora-i0sz`).

## Research (web, 2026-11-22)
- PipeWire's DMA-BUF docs: mmapping a DMA-BUF can be extremely slow, and consumers needing pixels should import through EGL, Vulkan or VA-API. WebRTC (Chromium and Firefox) moved to EGL import because mmapped screen sharing was slow and unusable; Mozilla bug 1729743 even proposed SHM only. A Mozilla comment reports mmap on AMD as very slow; a kernel thread reports uncached DMA-BUF reads at about 10x normal on arm64 (Librem 5).
- No source found for a speed-triggered fallback; WebRTC only falls back on a failed DMA-BUF. No browser uses Vulkan for this.

## Fix shipped and verified (Deck)
- `SlowReadWatch` (`PipewireDmabuf.hpp`): after 3 consecutive DMA-BUF reads over 100 ms it renegotiates shared memory, once per stream, keeping the frame that triggered it. Unit tests: fires once, resets on a fast read, budget boundary.
- Deck, default env, moving fullscreen source: `DMA-BUF reads too slow (712 ms, budget 100 ms)` within the first 2 s, then 18 to 19 changed callbacks/s for the rest of the 45 s run (dataType 3 to 2), none skipped. Logs `run5.log`, `run7.log`.
- Real lights: owner confirmed a higher update rate. The owner's separate bridge-settings tweaks were unrelated to the fps change.
- Not yet verified: no regression on other Wayland and X11 devices, and that the watch stays quiet on GNOME/Intel (1t1), where DMA-BUF reads should stay under budget. The 100 ms budget is a guess from the Deck figure. Owner is testing those devices next.

## Decision and follow-ups
- Quick fix (now shipped, above): a `SlowReadWatch` beside `DmabufReadFallback` that times the copy and, after about 3 consecutive reads over a budget, reuses the existing renegotiation to shared memory. Cause-agnostic and keeps GNOME on DMA-BUF. Open: the budget (about 100 ms is a guess) needs the Intel/GNOME read time first.
- Proper fix: `Aurora-x0tw` (1.2.2): EGL import with a GPU downscale. Linux PipeWire only; the X11, Windows and Mac capture paths are separate.
- Control run on a known-good Linux device, and the pipeline-rate and output-rate steps of the bead, are still open.
- Workaround today: launch with `AURORA_PW_DMABUF=0` (about 19 fps), on KDE only until `Aurora-mvq1` says otherwise.

## Lessons
- A mmapped DMA-BUF read is a GPU-memory read: on the Deck it cost about 200x the memfd copy, with the sync ioctls near zero (`input`).
- A stray `timeout`-ed `distrobox enter` leaves the app running in the container, and the next launch answers "already running" (`debugging-method`).
