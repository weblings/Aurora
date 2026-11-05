# Failure light: dim magenta while no effect can run

Id: dh1p-failure-light

`Aurora-dh1p`. A failed effect switch or startup now shows a steady dim magenta
on the lights, so it no longer looks like the old effect still runs.

## State

- The host holds the light as its own input-free pipeline, beside `m_pipeline`,
  not in it. State still comes from `m_pipeline`, so it stays Failed and
  `/api/state`, the tray and the Dashboard needed no change.
- The graph is `Graph::failureLightGraph`: a flat `#330033` `image.gradient`,
  `zones.sample` per output, then `frame.gain` at the master brightness. It does
  not use `frame.broadcast` because only audio builds register that node.
- On a failed switch the light takes over the running pipeline's outputs
  (`outputsFrom`, then `adoptOutputsFrom`). The bridge gets no stop and no new
  handshake, so the lights go from the old effect straight to magenta.
- On a failed startup each app calls `PipelineHost::showFailureLight` once,
  right after it builds the host (Windows, Mac and Linux `main.cpp`).
- A build that works replaces the light with `shutdown(true)`. A failed retry
  keeps the light. `removeError` turns it off if the host is no longer Failed.
  App exit stops it with `shutdown(false)`.
- When no output can be built, no light shows and the host stays Failed with its
  banner row.

## Verification

- 2 new PipelineTests cases (switch, startup), core ctest 482/482 on Windows.
  The Windows app builds. Mac and Linux `main.cpp` were not compiled.
- Fake-Hue stack on Windows: switching to a corrupt effect gave `failed` and a
  steady 0.2/0/0.2 on all 4 zones over the SSE tap. Switching to
  `builtin.video` brought back Running with screen colors.
- Not checked on real Hue lights. A failed startup was not checked live,
  because `devstack --fresh` wipes the config.

## Open

- Pause cannot turn the light off: a Failed host has nothing to pause.
  Filed as `Aurora-b6yx`.
- Preview and try on lights during Failed are still `Aurora-wq6i`. The light is
  not the pipeline that work needs: it runs a fixed graph.

- Lessons: none.
