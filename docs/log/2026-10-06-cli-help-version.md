# CLI --help/--version closes Aurora-v3in and Aurora-0gd

Id: cli-help-version

2026-10-06. All three app shells ignored every CLI argument and booted: `Aurora --help` started a full instance (and on Windows, stranded several). New triplicated `Aurora/App/Cli.hpp` (`handleEarlyCli`, same content in all three per the `Aurora-zx4` convention, kept in sync by hand) is now the first argv-touching step in each `main()` — Windows after `attachParentConsole()` so the printout lands, with `--console` known only there.

## Contract

`--help` prints usage, exit 0; `--version` prints `Aurora <AURORA_VERSION>` (the existing baked macro, no build-system change), exit 0; `--help` wins over `--version`, both win over unknown-argument errors; anything else unrecognized (including bare positionals and `--flag=value`) prints error + usage to stderr, exit 2 — all before `InstanceLock`, the `--fresh` temp-dir wipe, pipeline build, or port bind. Output goes to cout/cerr directly, never the Windows `LogSink` (pre-file writes buffer and would replay into the log).

## Verification

`CliTests.cpp` in each slice (8 linux/mac cases, 10 windows with `--console` cases); linux suite green: `[cli]` 27 assertions, full binary 84 assertions / 24 cases, `ctest` 24/24. Mac/Windows mains and tests are written but not compiled here — same parser, still needs a `mac-app`/Windows build + `ctest` there.

## Notes

- No new lessons: the CRLF exact-match editing failure and the DrvFs build placement both hit existing lessons (line-endings entry, WSL2 build-env entry). New files kept CRLF; repo suite configured with the build dir on native `/tmp` while sources stayed on DrvFs and configured/built clean — one data point, not a lesson revision.
- Slice READMEs updated in the same close (flag docs), per the README rule.
