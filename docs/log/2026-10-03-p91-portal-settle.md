# Aurora-p91: portal denial and call errors settle the fd promise

Id: p91-portal-settle

Dev session on `fix/PortalDenial`. Closed `Aurora-p91`: Aurora's
`XdgDesktopPortal` left `fdReadyPromise` unsettled on several failure paths, so
`PipewireGrabber`'s 60 s bound ran in full. Same root cause as upstream findings
5/9/10 in [[upstream-findings]]; the fork's fix covered only the bare settles.

## Done

- **Commits:** `fab5d6a` (fix + tests), `367091f` (free the dbus-daemon path
  in the tests).
- **`XdgDesktopPortal::settle`:** sets the promise once (atomic flag) and
  records `Capture::failureReason` before `set_value`, so the waiter may read
  it after `future.get()`. `PipewireGrabber` appends it to its thrown message.
  No logger (Aurora has none in core/input); the exception text is what reaches
  the WebUI. Reason wording follows the portal's Response codes: 1 cancelled by
  the user, 2 ended by the portal, plus call error, no bus, no portal.
- **Branches covered:** CreateSession and SelectSources denials, call errors in
  CreateSession/SelectSources/OpenPipeWireRemote (skipping `G_IO_ERROR_CANCELLED`),
  and `initScreencastCapture`'s no-bus and no-proxy returns (caller ignored them).
- **Malformed success replies** (agent-proposed, owner-approved): missing
  `session_handle`, missing or empty `streams` now settle false. Before, they
  segfaulted.
- **Use-after-free fixed:** completion callbacks (CreateSession, SelectSources,
  Start) now get `capture` as userData, not the `DbusCallData` that the Response
  handler or the cancel handler frees.

## Verified

- **Red first:** 14 of the 16 new cases failed on the unfixed code (most unsettled at
  the 3 s bound; three crashed and stalled to ctest's 300 s); the two Start
  regression cases already passed.
- **UAF reproduced, not just read:** fake `Mode::ResponseFirst` emits the
  Response before the method reply; ASan reported heap-use-after-free in
  `onStartedCallback`, freed by `onStartResponseReceivedCallback`. The portal
  docs do not order reply before Response.
- **After:** 43/43 under ASan + UBSan with LeakSanitizer on; full build 105/105.
  Failures settle in about 0.5 s.
- **Not covered:** a real compositor and portal backend; the fake only models
  the portal. The pre-existing race of `_stop()` destroying the capture from the
  main thread while the portal thread runs callbacks is untouched.

## Harness

- `PortalTokenTests` fake gained per-step modes (deny 1/2, D-Bus error,
  missing field, empty streams, Response-first) and a bare-bus option.
- `runHandshake` now tears down in `PipewireGrabber::_stop()` order (flag,
  destroy, join); the old order made every failing case wait out its deadline.
- Each mode always replies; an error mode never also emits a Response.
- `tools/fake-xdg-portal` still links huenicorn's port only; Aurora's
  regression tests live in `PortalTokenTests`.

## Surprises

- The 21-byte leak report was the tests' own `g_find_program_in_path` result,
  first mislabeled as GLib-internal (see lessons).
- A crashed case orphaned its `dbus-daemon`, which held ctest's stderr pipe:
  300 s stalls per crash until the child's stderr was silenced.
- The fake's own `g_variant_ref` before `g_variant_new` leaked 64 B per reply.
