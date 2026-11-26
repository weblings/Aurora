# A build that ends under a pause stops its stream

Id: 83k6-pause-late-build

`Aurora-83k6`, 2026-11-25, branch `feat/Mac1.2.1Testing`. Follows
[[lyr3-shutdown-final]]: a reload that finished or threw under a pause left the
bridge streaming.

## Change

- A reload that discards its build takes `m_pauseMutex` first, so it waits out a
  `resume()` in progress. It then shuts the build down as final if the host is
  still paused or closed, else as a replacement.
- `PipelineBuildOverrides::onFailure` replaces `hostClosed`: the host decides how
  a throwing build releases its outputs.
- A throwing reload does the same wait. Its effect-error paths (input not
  configured, graph load failure) still stop their outputs when no pause landed,
  but no longer when another build was installed meanwhile.
- A throwing resume always shuts down as final. Before, a failed resume left the
  output streaming while the host stayed paused.
- A discarding or throwing reload can now block for as long as a pause or resume
  takes.

## Verification

- Core `ctest`: 542/542.
- The three new `Aurora-83k6` tests fail on the old `Pipeline.cpp`.
- The `Aurora-83k6` and `Aurora-lyr3` tests, 20 repeat runs: no failure.

## Not verified

- A Hue bridge. App builds on any platform.

## Beads cleanup

This Mac's database still held labels and dependency links that earlier commits
had removed or reversed, and the export brought them back. It was aligned with
the last commit: 28 release labels removed, and the links on `Aurora-4nqt.8`,
`Aurora-5ipy.9`, `Aurora-5ipy.10` and `Aurora-k73j` corrected. Other machines'
databases were not checked.

## Follow-up

`Aurora-5q5h`: a failed effect switch may stop the stream the failure light borrows.
Read from code. Open.

## Lessons

- Releasing a discarded build can stop a newer one's stream ([[lesson-architecture-process]])
