# Aurora-Input-Linux — agent notes

Linux capture plugin (`X11Grabber`, `PipewireGrabber`, `SessionDispatch`).
Part of the Aurora monorepo (core interfaces in `../../core/` via relative path).

- Build/test: `cmake -S . -B build`, `cmake --build build`,
  `ctest --test-dir build --output-on-failure`. Needs `libx11-dev
  libxext-dev libxrandr-dev libpipewire-0.3-dev libglib2.0-dev`
  (or `-DAURORA_INPUT_LINUX_ENABLE_X11=OFF` / `_PIPEWIRE=OFF`).
- Tasks (`bd`) and lessons (`Analysis/lessons/`) live at the repo root.
