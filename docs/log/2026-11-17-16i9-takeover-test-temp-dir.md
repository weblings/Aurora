# Flaky takeover test: two tests shared one temp dir

Id: 16i9-takeover-test-temp-dir

`Aurora-16i9`. The Aurora-0tqq takeover test sometimes got 409 on a start right after `stop()` under `ctest -j8`. The bead's guess (stop returns before the revert settles) was wrong. The 0tqq test and the Aurora-52oz.5 replace test both built `LightTestHarness h("lt-replace")`, and `ScopedTempDir` maps a name to one fixed temp path that it `remove_all`s on construct and destruct. Run as parallel processes, one test wiped the other's `config.json`. The revert then reloaded an empty config, `Pipeline::build` returned null (no inputs), `PipelineHost::reload` took that as idle success and dropped the pipeline, and the next start answered "no pipeline is running". The 0tqq harness is now `"lt-takeover"`. No product code changed. A real app has one config directory and cannot hit this.

The test now posts the restart itself and `INFO`s the response body and `revertError`, which is what named the branch on the first loaded run.

## Verification
- Concurrent loop of the two tests (scratchpad script): 49 of 100 failures before the rename, 0 of 100 after (agent), 0 of 50 (coordinator).
- Full `ctest -j8 --repeat until-fail:5` (agent) and `until-fail:3` (coordinator): 511 of 511 each time.
- No other duplicate `LightTestHarness` name. Duplicate `ScopedTempDir` names in the GraphRunner audio and video files use different per-file prefixes. RuntimeTests' two `"config"` dirs are the same flake class, `Aurora-ruig`.
- Two earlier ~20-run repro attempts without the targeted loop never hit it, so a full-suite repeat is a weak repro for a cross-process collision.

## Lessons
- build-toolchain.md: "Test temp dirs named by a fixed string collide across parallel ctest processes"
