# Huenicorn upstream-fix checks (dev-only)

Before/after checks for the fixes Aurora is upstreaming to huenicorn
(findings 1–4, 7 and 8 in `docs/planning/UpstreamFindings.md`, bead
`Aurora-h45`). Each script builds a small driver from huenicorn's real
sources at a git ref and runs it. Point `--ref` at `develop` to see the bugs,
or at a fix branch to see the fix.

The portal findings (5, 6, 9, 10) have their own harness:
`tools/fake-xdg-portal`.

## Run

```sh
./hue.sh --ref origin/develop                 # findings 7, 8: crash
./hue.sh --ref fix/hue-api-robustness         # both pass
./capture.sh --ref origin/develop             # findings 1-4: 17 failed
./capture.sh --ref fix/capture-pipeline       # all pass
```

Shared options:
- `--src DIR`: the huenicorn checkout. Defaults to `$HUENICORN_SRC`, then a
  `huenicorn-fork` folder next to this repo.
- `--ref REF`: build from `git archive REF`, so no branch switch is needed.
  Without it, the checkout's working tree is used.
- `--deps-include DIR`: extra include dir for nlohmann/json and glm. Both
  are found on the system path first, then in Aurora's own `build/_deps`.

Also needs `g++`, `pkg-config`, OpenCV 4 and libcurl dev packages, and
`python3` + `openssl` for the fake bridge. Builds go to `build/` (gitignored).

## hue.sh: Hue loaders (findings 7, 8)

Starts two `tools/fake-hue-bridge` instances: one with `--stall-light
light-1` (3s, longer than huenicorn's 1s curl timeout), one normal. Every
file is built with `-D_GLIBCXX_DEBUG`. Pass `fetch` or `selector` to run
just one check.

| Check | `origin/develop` | `fix/hue-api-robustness` |
|---|---|---|
| `fetch`: `loadEntertainmentConfigurations` with one light stalled | aborts: uncaught `std::bad_optional_access` | 3 configs, stalled light kept with an empty name |
| `selector`: `EntertainmentConfigurationSelector::validSelection()` | aborts: singular iterator compared to past-the-end | `false`, no selection yet |

## capture.sh: capture and image pipeline (findings 1–4)

Synthetic solid-red frames, laid out exactly as their `PixelFormat` tag says,
go through the real `ImageProcessing.cpp` and `IGrabber::_divisors`.

| Group | Checks | Fixed by |
|---|---|---|
| 1 | `rescale`/`getSubImage` keep the input's format tag (all 4 formats) | `fix/propagate-pixel-format` |
| 2 | `mean()` of a red frame is red in every layout | `fix/mean-channel-order` |
| 3 | `rgbaToRgb` tags BGR/RGB output; Runtime's per-frame path gives red, 3 channels | `fix/bgra-alpha-drop` |
| 4 | `_divisors(6)`, `_divisors(12)` include `n / 2` | `fix/divisors-half` |

Failures per ref, all verified 2026-10-01. The branches stack: each one also
contains the fixes before it, except `divisors-half`, which stands alone.

| Ref | Failed |
|---|---|
| `origin/develop` | 17 |
| `fix/propagate-pixel-format` | 9 |
| `fix/mean-channel-order` | 5 |
| `fix/bgra-alpha-drop` | 2 (only group 4 left) |
| `fix/divisors-half` | 15 (only group 4 fixed) |
| `fix/capture-pipeline` | 0 |

## Gotchas

- Runtime's per-frame path is copied into `capture_driver.cpp` by hand,
  because `Runtime.cpp` doesn't link alone. `capture.sh` greps the tree's
  `Runtime.cpp` to see whether its alpha drop covers BGRA, and passes the
  answer in as `RUNTIME_DROPS_BGRA`.
- The grabber tagging changes (X11 frames are BGR(A), and Pipewire frames
  are BGRA when it negotiates BGRx) need a live display, so these checks
  don't cover them. Group 2 checks what that tagging relies on.
- `hue.sh` links with `--gc-sections`. Otherwise `ApiTools.cpp`'s unused
  user-registration code needs `Platform::adapter`, which pulls in every
  grabber.
- On `develop`, group 1's frames carry whatever format value happens to be
  in memory, since the tag is never set. The failures still show up, but
  the exact "got" values can vary between machines.
