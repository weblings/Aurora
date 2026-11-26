# Inputs open before outputs, so a failed input leaves the running stream alone

Id: d5n4-inputs-before-outputs

`Aurora-d5n4`, 2026-11-25, branch `feat/Mac1.2.1Testing`. Follows
[[5q5h-failure-light-takeover]].

## Cause (read from code, not reproduced on a bridge)

`Pipeline::build` initialized outputs before opening inputs. A reload of the same
effect with a failing input kept the old pipeline, whose Hue stream the new init
had ended. While the input kept failing, the link monitor's reconnect would take
the area over again and, seeing it active, reset its backoff.

## Web research

Community sources, no official Signify document found; none says whether an
open session survives a stop and start.

- [khuey PR 99](https://github.com/codepuncher/khuey/pull/99): during a stream
  teardown UDP 2100 closes, and a start sent then is answered 200 and discarded
  (author's measurements, bridge model not named). Not checked against Aurora,
  whose output init sends a start right after a stop.
- [iotech post](https://iotech.blog/posts/philips-hue-entertainment-api/): an
  area with no stream activity stops within a few seconds.

## Change

- `Pipeline::build` creates outputs first, opens every input, then initializes
  the outputs and builds the runners.
- An effect missing an input therefore fails before any output init: the failure
  light borrows the running stream.
- Timing log phases are now `capture init`, `outputs init` and `graph init`;
  `outputs init` times only the output init.
- Tests that used a bad input as a failure after output init now use a graph
  naming a missing output, a throwing output init, or a hook in the input factory.

## Verification

- Core `ctest`: 546/546. Both new `Aurora-d5n4` tests fail on the old
  `core/Runtime`. The failure, pause and shutdown tests, 20 repeat runs: no failure.
- Mac app built (`build/mac-release`, unsigned rebuild), run against the fake
  bridge with dummy input: an unknown input on the running effect and on an effect
  switch added no stream start or stop; the first kept running, the second showed
  the failure light. Switching back started the stream again.

## Real bridge, startup only

The unsigned rebuild, on a copy of the owner's settings, was refused Screen
Recording at launch. Owner: the lights showed the purple failure light. This
exercises neither bead's reload path.

## Not verified

- Either bead's reload on a Hue bridge. Real screen or audio capture. Linux and Windows builds.
- A graph or runner failure after output init still ends the older stream; the
  failure light covers an effect switch, a kept pipeline is not covered.

## Lessons

- Open everything that can fail before taking over a shared device ([[lesson-architecture-process]])
