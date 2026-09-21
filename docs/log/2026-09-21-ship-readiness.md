# Ship-readiness day (2026-09-21)

Everything after the monorepo-reorg log that made 1.0.0 shippable: demo/UI
parity, brand pass, version plumbing, README pass, green Linux build, and
the public launch (own log: 2026-09-21-public-launch.md). 83 commits.

## Demo/UI parity backports (all closed)

- Aurora-nl0 edge padding: dropdown ellipsis + 21px overhang scaled under
  650px, ported both directions.
- Aurora-k1q theme-aware favicons: SVG dark override + PNG fallbacks.
- Aurora-tnk dashboard brand mark into the demo vendor fork (surgical;
  fork-local asset paths, seam tripwire extended).
- Aurora-9mq scene repo pill: RockyRoad's upsell (mark + wording + hover),
  overlaid bottom-center on the shared offset token.

## Brand + version (closed)

- Aurora-gv0 Welcome logo replaces Setup text at 160px (8x title type,
  welcome-scoped so Dashboard art is untouched).
- Aurora-qdk version footer: CMake project(VERSION 1.0.0) as single truth,
  /api/version on both apps, secondary-color footer both dashboards, shim
  stub so Pages shows it too.

## README pass (owner-led, agent-assisted)

Run-via-./ step 4, Windows tools fleshed out, platform-neutral CMake 3.19+
floor with venv-first Troubleshooting, pipeline ASCII diagram with
write-your-own plugin framing, beads history bullet. Co-edit protocol
learned mid-pass: diff before staging on shared files.

## Build + launch

- Linux: configure clean, build 100%, ctest 50/50.
- Public launch: audit, h7p remote swap, Pages via gh-pages subtree split
  after billing blocked Actions; branch incident owned and recovered.
  Details in 2026-09-21-public-launch.md.

## Deferred / untouched

- Aurora-wg9 independent builds scoped to 1.0.1 (embed webroot, runtime
  deps, install rules).
- Prior open backlog (2qj URL, m2c toggle, autodetect, etc.) untouched.
- demo-pages.yml dead until billing resolves; standalone Web-Demo revival
  declined in favor of the subtree push.
