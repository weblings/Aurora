# Aurora-3ono: PipelineTests segfault on Windows was a stale build tree

Id: 3ono-stale-core-test-tree

Found while verifying Aurora-2dz ([[2dz-secret-store]]): `ctest` in the
long-lived `build/core-test` failed 1/127, `Monitors and reload routes
answer from PipelineHost` (SEGFAULT), the same test and symptom Aurora-rtwh
fixed (httplib ODR, see [[9ig-pipeline-to-core]]). Not a code regression.

## Findings

- `build/core-test` had one httplib copy on its include path (fetched
  0.46.0; none under `vcpkg_installed` or `C:/vcpkg/installed`), so the
  rtwh include-order ODR did not explain it.
- A fresh configure of the same commit (`build/core-test-fresh`, needs
  `-DAubio_DIR=C:/vcpkg/installed/x64-windows/share/aubio`; aubio is not in
  the manifest) built and passed 127/127.
- The old tree's cache still held `Brotli_*` paths into its pre-rtwh
  `vcpkg_installed`. `--clean-first` on `AuroraNetwork` and
  `AuroraPipelineTests` then failed with `Cannot open include file:
  'brotli/decode.h'`, so httplib had been built with brotli support against
  the old setup and its objects were stale. The brotli flag mismatch is the
  likely crash mechanism; the exact crashing object was not pinned down.
- Fix: `cmake -U "Brotli_*" -U "*BROTLI*" -S core -B build/core-test`, full
  build: 127/127. Fresh tree deleted.
- CI is unaffected: fresh tree each run, manifest mode OFF, aubio installed
  separately (apt / brew / `vcpkg install`) and `-DAubio_DIR` passed on
  Windows.

## Docs changed

- Lesson: "Removing a dep from the vcpkg manifest doesn't clean an existing
  build dir" (build-toolchain.md).
- `docs/Building.md` Troubleshooting: stale long-lived Windows build dir.
