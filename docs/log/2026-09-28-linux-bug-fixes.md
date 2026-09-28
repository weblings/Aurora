# Linux 1.0.3 bug fixes: portal wait bounds, audio ifdef guards, TEST_CASE dash names

Closed `Aurora-1z9`, `Aurora-y1q`, `Aurora-9yi` (all `1.0.3`-labeled Linux bugs). Filed, not fixed: `Aurora-b87` (OFF audio toggle is a superbuild no-op), `Aurora-5t2` (concurrent reloads each negotiate their own portal dialog).

## Aurora-y1q: audio ifdef guards (app/linux)

`Pipeline::listZones()`/`updateZone()` in `app/linux/src/main.cpp` referenced `m_audioOrchestrator` unguarded; member exists only under `AURORA_RUNTIME_AUDIO_AVAILABLE`. Wrapped both in the ifdef `tick()` and the app/mac port already use. Full-TU audit: includes, `registerAudioInputs`, the `build()` audio branch, `tick()`, member decl, and descriptor registration were all already guarded -- these two were the complete gap.

Verification: the bead's stated acceptance (OFF-toggle superbuild) passes vacuously -- the toggle never unsets the define (see `Aurora-b87`). Real proof was a true negative test: the recorded compile command plus `-UAURORA_RUNTIME_AUDIO_AVAILABLE -UAURORA_INPUT_LINUX_AUDIO_AVAILABLE` compiles the fixed TU clean and fails HEAD with exactly the two `m_audioOrchestrator was not declared` errors.

## Aurora-1z9: bounded PipeWire/portal waits

`PipewireGrabber`'s constructor blocked the HTTP request thread on two bare `.wait()`s. Now: portal fd wait 60s (the handshake includes the human answering the source-picker dialog -- the in-repo 5s precedent would have turned slow first-run users into spurious failures), stream-params wait 5s (machine-only, matches `AudioGrabber.cpp:38`). Timeout and dismissal get distinct messages; dismissal still resolves promptly as false. Timeout path reuses the existing `_stop()` (cancels the portal handshake, joins threads), so no late callback can touch the promise after the throw.

Verification (scratch probes under `/tmp`, not repo tests -- grabber construction needs a live portal): happy path constructs in ~3.5s on the real session bus (no regression); bus fully blocked throws at 60.01s with the diagnostic; gamescope path (skips portal) throws promptly in 5ms on the wait-2 failure branch with a clean teardown. Not verified live: dialog-dismissal 500 (would pop UI on a live desktop) and the 5s arm under a mid-handshake PipeWire stall (would need killing system PipeWire). Concurrent-reload question answered by reading `PipelineHost::reload` (builds before locking -- two dialogs genuinely possible, last-swap-wins, memory-safe) and filed as `Aurora-5t2`.

## Aurora-9yi: TEST_CASE names starting with `--`

`--fake-hue flag detection` / `--fake-hue env defaults`: `catch_discover_tests` passes the name back as an argv filter, Catch2 parses the leading `--` as an option, both failed with `Unrecognised token` before their bodies ran. Pre-existing (reproduced with all other edits stashed), unrelated to the bug fixes. Renamed to drop the dashes; full suite now 80/80.

## Lessons filed

- `TEST_CASE names starting with '-' break CTest selection` (build-toolchain.md)
- `A build-toggle acceptance test is vacuous unless the toggle actually flips the build` (debugging-method.md)
- `A promise wait that includes a human dialog needs a human-scale bound` (input.md)

The FetchContent-ordering lesson behind `Aurora-b87` already existed in build-toolchain.md -- no dupe filed; the b87 fix should follow it. `input.md`'s README count was already stale by one (18 vs 19); corrected to 20 with the new entry.
