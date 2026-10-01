# Aurora-h45: upstream fix branches for huenicorn — started

Id: h45-upstream-fix-branches

Started turning [[upstream-findings]] into one fix branch per finding in the
`../huenicorn-fork` sibling checkout (fork `master` == the commit the doc was
written against; branches cut from `origin/develop`, one commit ahead).
`Aurora-h45` became the epic; children `.1`–`.9` are the findings, `.10`
pushes and opens MRs.

## Re-verification pass

- All of 1–8 still present at the cited lines.
- **1 was wrong about why it's latent.** X11 and Pipewire tag `RGBA`/`RGB`,
  not `BGR`, while their bytes are blue-first. `mean()`'s hardcoded swap
  compensates. Honoring the tag alone would swap red/blue for real users, so
  `.1` now carries the grabber tag fixes and stacks on 3. Chain reordered to
  `.3` → `.1` → `.2` → `.4` → …
- **2's fix was dead code as written**: `Runtime.cpp`'s guard only admits `RGBA`.
- **5's fix (bare `return;`) would hang startup**: `PipewireGrabber` waits on
  an unbounded `fdReadyFuture`. Corrected to settle the promise first.
- **New finding 9**: the SelectSources denial branch has the same unsettled
  promise today.
- **Aurora has the same bug**: its port carries 5/9 half-fixed, so denial
  stalls the 60s bounded wait. Filed as `Aurora-p91`.

## Shipped

- `fix/propagate-pixel-format` (`ead673e`, not pushed): `rescale()` and
  `getSubImage()` copy `format` to their output. Closed `Aurora-h45.3`.

## Verification

- The fork can't fully build here: `DtlsClient.cpp` needs Mbed TLS 3.x/4.x,
  the system has 2.28. The touched files build warning-free with `-k`
  (venv cmake, scratchpad build dir).
- Scratch driver against `ImageProcessing.cpp`: format preserved through both
  functions for all four `PixelFormat` values.

## Lessons filed

- Processing: a hardcoded channel swap can be silently compensating for
  mislabeled tags.
- Input: every early return in a promise-driven portal callback chain must
  settle the promise.
- Build-toolchain: the huenicorn fork needs Mbed TLS 3.x/4.x; verify per-TU
  with `make -k`.
