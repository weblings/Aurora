# Linux X11 rebuilds the pipeline when the monitor set changes

Id: 9fn3-x11-monitors-changed

`Aurora-9fn3`, the Linux half of the monitor-set rebuild (Windows: [[ecl5-windows-monitors-changed]]). `X11Grabber` selects `RRScreenChangeNotify` and `RROutputChange` on the root, drains them each grab, re-reads outputs and raises `IVideoInput::takeMonitorsChanged` only when `monitorIdentities` (key, else name) differ. `PipelineHost::tick` latches it and `MonitorChangeWatcher` (1 s debounce, waits out a light test, drops while paused) calls reconnect. Wired in `app/linux` only.

## Verification
- Unit tests (watcher, `monitorIdentities`) pass, `linux-app` builds, ctest 204/204 (re-run 2026-11-19 on a fresh build).
- X11 hardware pass (HDMI-0 primary 4K, DP-5, fake Hue bridge, temp config): single-display unplug/replug, no rebuild. DP-5 plugged, rebuild about 3 s later and `/api/monitors` gained DP-5. DP-5 unplugged, rebuild, list back to HDMI-0. A saved DP-5 selection was captured again after replug. 4 `xrandr` mode changes on HDMI-0 caused 0 rebuilds.
- Wayland unchanged (2026-11-19, GNOME Wayland, eDP-1 plus DP-1, `--fresh --fake-hue`, input `pipewire`, portal picked the new screen): DP-1 unplug and replug with capture running. Same process, state running, no errors, no rebuild (only the startup `[pw-dmabuf]` lines in the log), `/api/monitors` stayed `[]`, `canSelectMonitor` false. `PipewireGrabber` does not override `takeMonitorsChanged`, so the watcher cannot fire there.
- Not checked: capture target not visually confirmed on Wayland. The log cycled `capture stalled` / `recovered` (size-0 CORRUPTED DMA-BUF chunks), probably idle-screen frames, not traced and not tied to hotplug.

## Lessons
- none
