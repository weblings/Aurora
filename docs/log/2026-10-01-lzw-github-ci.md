# Aurora-lzw: GitHub CI unblocked for weblings/Aurora

Id: lzw-github-ci

CI had never run: the Linux, Windows and web workflows trigger on `push` to
`main` only, so nothing exercised them before merging. Found by opening PRs
instead. Unblocks Aurora-9ig (three-platform no-change check for the Pipeline
move) and Aurora-7r3 (fixtures regenerated on Mac, now checked on all four).

## Change

- `windows.yml`: vcpkg deps added (curl, mbedtls, `aubio[core]`, miniaudio from
  the runner's vcpkg, toolchain file at configure, binary cache); choco OpenCV
  `bin` on `GITHUB_PATH`.
- All three native workflows: standalone core build + `ctest` step (Parity).
- `mac.yml` (new): `macos-latest` arm64, `mac-app` preset, brew deps with the
  `mbedtls@3` pin, ctest. No signing or notarization (stays manual).
- `web/demo/demo-shim.js`: version `1.0.4` -> `1.0.5` to match `CHANGELOG.txt`.

## Verification

- PR dev -> main: Linux passed (touched `core/`). Web failed (shim version
  drift above); Windows failed at configure (Aubio not found).
- PR fix/CI_Updates -> dev: Mac, Windows and web passed. Linux did not run:
  the PR touched none of its `paths:` (not removed).
- Cost: about $0.03 per Windows or Linux run. Mac run cost not recorded here.
- First green runs did NOT cover core: the Windows job ran 70/70 tests, none
  Parity, because `windows-app`/`linux-app`/`mac-app` don't build core's suite
  (it only builds when `core/` is configured standalone). Linux and Mac have
  the same gap. Added a standalone `cmake -S core` build + ctest step to all
  three native workflows. Linux and Mac passed it; the first Windows run sat
  13+ min building vcpkg OpenCV (core/vcpkg.json manifest mode, see
  `build-toolchain`). Fixed with `-DVCPKG_MANIFEST_MODE=OFF`, ctest
  `--timeout 120` and job `timeout-minutes: 30` on all three, a constant vcpkg
  cache key (it hashed windows.yml, so every edit dropped the cache).
- Not isolated: whether the OpenCV `PATH` step is needed for Windows tests.
- Final: Linux, Windows, Mac and web green on fix/CI_Updates -> dev; raw logs
  show the `Parity:` video and audio tests passing on all three native
  platforms (Ctrl+F on the Actions page missed them: collapsed steps).
  Windows total ~13 min after the manifest-mode fix.
- Not covered by CI: screen/audio capture, permissions, Hue hardware.

## Findings

- A workflow filtered out by `paths:` reports nothing, which reads as removed.
- Lessons: PR-only testing and path filters, Windows runner dependency recipe
  (`build-toolchain`); shim version duplicated against the changelog
  (`web-testing`).
- The Mac workflow was written blind and passed first time, so the documented
  `mbedtls@3` pin was enough.
- Decision: no `push` trigger beyond `main`; PRs do the testing.
