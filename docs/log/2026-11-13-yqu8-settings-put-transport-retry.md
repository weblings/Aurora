# Core test: concurrent settings PUTs retry a refused connection instead of failing under load

Id: yqu8-settings-put-transport-retry

`Aurora-yqu8` (P3). "Concurrent settings PUTs coalesce reloads and none is lost" failed now and then in a full `ctest -j8` in `build/core-tests` and passed alone.

## What was found

- A captured failure (2026-11-13): `succeeded` 5 == 8, three fields at their defaults; one reload at a time, the call bounds and the last config seen all held. The failed PUTs never wrote, so no successful update was lost.
- With each request's outcome recorded, the failures were transport errors, never a status: `Could not establish connection` (`httplib::Error::Connection`) in one run, `Failed to write connection` (`Error::Write`) in another.
- The server listens with cpp-httplib's default backlog, `CPPHTTPLIB_LISTEN_BACKLOG` 5 (`httplib.h:185`); eight clients connecting at once on a loaded machine overflow it. Inferred from the error codes and the value, not probed in the kernel.

## What changed

- `core/tests/PipelineTests.cpp`: each client retries a Connection or Write error up to 50 times, 20 ms apart; any status or other error is final. Each PUT sets an absolute value, so a retry is harmless. Each request's outcome is recorded and printed with `INFO` when the success count fails. No CHECK was changed.
- Raising the server's backlog is a separate decision, filed as `Aurora-7gwg` (P4). No real-app failure has been seen.

## Verification

- Reproduced on run 4 of a full-suite loop before the fix. The first fix (Connection only) failed on run 7 with the Write error, so Write was added.
- After the final fix: 15 consecutive full `ctest -j8` runs by the agent, and 5 more by the coordinator, all 499 of 499.

## Lessons

- none
