# Aurora-App-Windows — agent notes

Windows app shell tying core + Windows input + Hue output into one process.
Expects sibling `Aurora/`, `Aurora-Input-Windows/`, `Aurora-Output-Hue/`
checkouts (or toggle `AURORA_APP_ENABLE_WINDOWS_INPUT` / `_HUE_OUTPUT` off).

- Build/test: `cmake -S . -B build`, `cmake --build build`,
  `ctest --test-dir build --output-on-failure`. Run needs
  `AURORA_HUE_BRIDGE_ADDRESS` / `AURORA_HUE_USERNAME` / `AURORA_HUE_CLIENTKEY`
  in env.
- Tasks (`bd`) and lessons (`Analysis/lessons/`) live in core `Aurora/`.
