# Aurora-App-Linux — agent notes

Linux app shell tying core + input + Hue output into one process.
Builds against `core/`, `input/linux/`, `output/hue/` in this repo
(or toggle `AURORA_APP_ENABLE_LINUX_INPUT` / `_HUE_OUTPUT` off).

- Build/test: `cmake -S . -B build`, `cmake --build build`,
  `ctest --test-dir build --output-on-failure`. Run needs
  `AURORA_HUE_BRIDGE_ADDRESS` / `_USERNAME` / `_CLIENTKEY` in env.
- Tasks (`bd`) and lessons (`Analysis/lessons/`) live at the repo root.
