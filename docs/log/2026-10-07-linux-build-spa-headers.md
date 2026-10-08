# Linux app preset built clean on a fresh checkout; one missing-header fix

Id: linux-build-spa-headers

2026-10-07. `cmake --preset linux-app` + build on this machine (Ubuntu 22.04,
system `cmake` 3.22.1 too old for the preset's `cmakeMinimumRequired`
3.24 -- used the project `.venv`'s `cmake` 4.4.3 instead, which had
configured `build/linux-app` previously). Configure succeeded (httplib/
Catch2 fetched online, `libsecret-1` absent so `AuroraSecrets` built
backend-less, as expected); build failed once, on `PipewireGrabber.cpp`:
`spa/param/buffers.h: No such file or directory`.

## Root cause and fix

`libspa-0.2-dev` 0.3.48 (this distro's version) doesn't ship
`spa/param/buffers.h` at all -- confirmed via `dpkg -L libspa-0.2-dev`.
The three symbols `PipewireGrabber.hpp` actually needs from it
(`SPA_PARAM_BUFFERS_buffers`/`_blocks`/`_dataType`) are defined in
`spa/param/param.h`, already pulled in transitively, so the include was
unnecessary on this version. Guarded it with
`#if __has_include(<spa/param/buffers.h>)` rather than deleting outright,
so a newer SPA that does ship the header (and might someday declare more
than the enum) still gets it. Rebuilt clean after; full `linux-app` build
(app, input, output, runtime, all test binaries) succeeded,
`build/linux-app/bin/Aurora` produced.

## Verification

Two full builds: one failing at the header, one green end-to-end after
the `__has_include` guard (confirmed the guard compiles both ways --
header absent here, skipped; would be picked up were it present).
No test run beyond the build itself.

## Surprises

New lesson in [[lesson-input]] (the entry right after the existing
`raw-utils.h`/`spa_json_*` one -- same distro, same library, one level
further: the header itself can be absent, not just missing a function).
