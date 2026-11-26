# 1.2.1 Windows release build and testing, including a real Hue bridge

Id: 121-windows-release

2026-11-25, Windows 11, agent-run. Source `6f092d9a` on `feat/Mac1.2.1Testing`,
which holds the fixes in [[121-mac-release-r3]] and a portable-order fix to one
`Aurora-5q5h` test. Nothing published.

## Release zip

- Fresh tree: `cmake --fresh --preset windows-app -B build/windows-release`
  with Visual Studio 17 2022 x64, the vcpkg toolchain, `Aubio_DIR` and
  `-DAURORA_BUILD_CORE_TESTS=ON`, then `--config Release`. `ctest`: 679/679
  (vcpkg `bin` on `PATH`).
- Hand-assembled `Aurora_v1.2.1_Windows/`: `Aurora.exe`, `aurora-mcp.exe`,
  `libcurl.dll`, `opencv_core4.dll`, `opencv_imgproc4.dll`, `z.dll` and
  `Licenses/` (root and graph editor notices).
- `build/release-out-1.2.1/Aurora_v1.2.1_Windows.zip`, 5,601,209 bytes, sha256
  `762b993b204ea7eb3e341f56b14421b872524a89560a18249235977f8e8e23c6`.
  Gitignored under `build/`.
- The published 1.2.0 Windows zip also held debug DLLs and `Aurora.pdb`, and no
  `Licenses/`.

## Verified on the extracted zip

- `dumpbin`: imports are the zipped DLLs, Windows DLLs and the Visual C++
  runtime.
- Fake-Hue stack, real screen capture: `/api/version` 1.2.1 `Release`, graph
  editor served, light frames flowing, OpenCV, curl and zlib loaded from the
  extracted folder, unknown `Host` 403.
- Bundled `aurora-mcp`: reports 1.2.1, 16 tools; `aurora_status` answered.

## Browser checks against the binary's embedded graph editor

All 34 check scripts (all but `graph-editor:set` and `graph-editor:slow`), from
a scratch copy whose stack launched the extracted app, viz port 8123. 32 passed
unedited. `port-types` and `tuning-drag` passed only with scratch edits
(`Aurora-n335`); both are unchanged in the repo. The Dashboard was served from
the checkout's `web/ui` (same commit), not from the binary's embedded copy.

## Real Hue bridge

BSB002, API 1.78.0, a 6-channel entertainment area. The extracted zip ran with
`AURORA_CONFIG_DIR` pointing at a copy of the owner's settings with the bridge
address updated; the copy was removed afterwards. Real screen capture. Agent
drove the API and read the area status; the owner watched and used the tray.

| Step | App | Area | Owner saw |
|---|---|---|---|
| Screen colors | running | active | following |
| Pause and resume, 3 of 3 | paused, running | released, active | looked right |
| Pause during a reload, 15 of 15 | paused | released | looked right |
| Pause then resume during a reload, 15 of 15 | running | active | looked right |
| Input set to an unknown name (`d5n4`) | running, reload error | active at 35 s | still following |
| Effect with an unknown node type (`5q5h`) | failed | active at 35 s | purple, holding |
| Same effect selected again | failed | active at 35 s | stayed purple |
| Screen colors | running, no errors | active at 22 s | following again |
| Tray Pause, then Resume | paused, running | released, active | both worked |
| Tray Stop | process exited | released | stopped cleanly |

- In all 30 reload runs the pause was answered before the reload, with no errors
  or conditions afterwards.
- The app log held `Failure light on.` twice. No Aurora entry was found in the
  Application event log.
- Found: after the input was restored, the input error stayed until a manual
  reload (`Aurora-mpox`).

## Not verified

- Audio capture, phone pairing, monitor changes, HDR.
- A PC without the development tools, and the SmartScreen first-open prompt.

## Lessons

- none
