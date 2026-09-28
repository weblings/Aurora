# --fake-hue ported to Mac/Windows, closing a real doc-tracing gap

Closed `Aurora-zx4`. Surfaced live: launching the fake-lights-viz recipe on
Mac, `AURORA_HUE_BRIDGE_ADDRESS`/`_USERNAME`/`_CLIENTKEY` were set by hand
(the backend's own `registerOutputs()` env-var fallback), but the WebUI's
own bridge-discovery step (`GET /api/hue/discover`) stayed stuck, because
that's gated on a separate var, `AURORA_DEV_FAKE_HUE`, that only
`app/linux`'s `--fake-hue` flag (`FakeHue.hpp`) was setting. Root cause was
a documentation-tracing miss, not a missing capability:
`tools/light-viz-relay/README.md` already said `--fake-hue` "presets the
bridge env + dev discovery," which is correct and sufficient -- it just
wasn't traced all the way to `FakeHue.hpp` before acting, so "dev
discovery" got silently dropped rather than expanded into the actual var.

## What changed

`FakeHue.hpp` ported as same-content copies into
`app/mac/include/Aurora/App/` and `app/windows/include/Aurora/App/`,
matching this codebase's existing per-platform-copy convention for
`Registry.hpp`/`InstanceLock.hpp` rather than inventing a shared header.
Each copy now cross-references the other two so a future edit to one is at
least flagged as needing the same edit elsewhere. Windows' copy differs in
exactly one line -- `_putenv_s` in place of `::setenv`, which doesn't exist
on MSVC -- everything else is identical.

`--fake-hue` wired into both `main()`s at the same point `app/linux`
already uses (right after signal/console setup, before anything else
reads env). Windows uses `logLine()` for the startup message instead of
raw `std::cout`, matching its own existing convention (console may not be
attached).

`tools/light-viz-relay/README.md`'s step 3 rewritten to spell out the
actual five env vars inline, name which one is easy to miss and why
(`AURORA_DEV_FAKE_HUE` -- the WebUI's own discovery step, not just the
backend fallback), and point at `FakeHue.hpp` for literal values rather
than re-paraphrasing them a second time. Extended to show all three
platforms' binary paths (`build/mac-app`, `build/windows-app` confirmed
against `CMakePresets.json`/each `CMakeLists.txt`'s `OUTPUT_NAME`/
`RUNTIME_OUTPUT_DIRECTORY`, not guessed).

## Verified, with a real limit

Mac: rebuilt `aurora-app-mac` clean, then ran it with **only** `--fake-hue`
and no manual env vars at all -- `GET /api/hue/discover` correctly
returned the fake bridge, `GET /api/capabilities` showed `hue` registered.
Both `input/mac`'s and `app/mac`'s test suites re-run clean, no
regressions.

Windows: **not compile-verified** -- no Windows toolchain on this machine,
checked directly rather than assumed available. Reviewed carefully instead
(the only platform-specific line, `_putenv_s`'s signature, confirmed
against its documented signature rather than recalled from memory), but
this is a real gap in this session's verification, flagged rather than
silently claimed.

## State

`Aurora-zx4` closed. The failure mode this fixes -- an agent or human
partially reconstructing `--fake-hue`'s env vars from a paraphrase instead
of a flag -- shouldn't recur on any of the three platforms now.
