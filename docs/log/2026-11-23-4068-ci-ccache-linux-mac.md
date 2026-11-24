# CI ccache for linux and mac, apt retry on linux

Id: 4068-ci-ccache-linux-mac

`Aurora-4068` (linux) and `Aurora-v4tk` (mac), closed, P2. PR 80 timed out at 30 min on both: linux stalled 23 min in apt, mac spent 20 min cold and ran out of time before the Core tests.

- Both workflows: `hendrikmuhs/ccache-action@v1.2` (keys `linux`, `mac-<arch>`), `CMAKE_{C,CXX}_COMPILER_LAUNCHER=ccache` on configure only, `CCACHE_BASEDIR` = workspace on Configure and Build, `concurrency` cancel-in-progress per ref.
- Linux only: Install deps gets an 8 min step timeout and 3 attempts, each `apt-get update` and `install` capped at 150 s. Dropped the stray `CMAKE_OSX_DEPLOYMENT_TARGET` from the `linux-app` preset. apt package caching skipped (optional; retry covers the stall).
- Timings, wall time per run (PR 81): cold run `fbe258eb` vs warm run `616d0a9d`. Linux 23.5 -> 12.1 min. Mac 19.8 -> 14.8 min. PR 80 passing run was linux 21.9, mac 22.8. Single runs, runner noise is about 4 min (windows, unchanged, swung 18.2 -> 22.3).
- Mac gains less: Homebrew deps (about 4 min) and the Core tests configure/build are uncached; `Aurora-ptns` folds the core tests into the app build.
- Not checked: ccache hit rate from the Build logs (unauthenticated API cannot read job logs).

## Lessons
- none
