# Aurora-ifkn.8 (open, built): vendor test in web CI, docs, Pages publish open

Id: ifkn8-vendor-ci-docs

2026-10-08. Vendor step 8 of the demo re-vendor (parent bead `Aurora-ifkn`,
child `Aurora-ifkn.8`). The byte-equality guard is now enforced, not just
written: `web/demo/vendor/webui/*.test.mjs` (the rewritten `seams.test.mjs`
from `Aurora-ifkn.7`) runs in `.github/workflows/web.yml`. Proven with a
scratch mutant -- appended one comment to a vendored file, the exact CI loop
failed only at `seams.test.mjs`, restored byte-identical (`cmp`).

## Docs (slice-README rule)

- `web/demo/README.md`: the "intentional fork, not a mirror / do not sync
  (Aurora-4jl)" line replaced -- it is now a byte-identical vendored copy
  with the sync command and the CI tripwire named.
- `web/demo/CLAUDE.md`: vendor sync rule added in the file's existing
  copies-not-authored-here shape (fix in `web/ui`, test, re-run
  `sync-webui.py`, confirm seams; `app.js`/`shell.js` stay unvendored).
- `web/ui/README.md`: "Demo vendor copy" pointer added (re-run + seams
  check after editing any listed file; never edit copies in place).
- `docs/check-links.py`: links OK.

## Verification

- Exact CI loop command green locally (includes the new vendor glob).
- Full web loop green (27 suites); closure-check clean.
- No new lesson: nothing non-obvious beyond already-recorded mechanics (the
  drift-mutant proof is standard practice, the doc edits are bead-specified).

## Open (bead stays claimed, not closed)

- Close is blocked on `Aurora-ifkn.7`, which is blocked on `Aurora-ifkn.3`'s
  live-browser pass (no headless browser in this env).
- Pages publish NOT done: subtree-push to `gh-pages` is publishing, which
  needs an explicit ask (conservative profile + ungiven --push), and the
  "verify on Pages (version footer shows current release)" step needs a
  browser. Command when authorized (from a branch the owner names):
  prune per the subtree lesson in [[lesson-architecture-process]], push the
  `web/demo` subtree to `gh-pages`, and check the Pages footer reads the
  current release.
- Follow-up observation (not acted on, out of bead scope): `web.yml` still
  doesn't run `web/ui/*.test.mjs` or `web/ui/screens/*.test.mjs`, so the new
  `ZoneActiveToggle`/`ZoneCanvas`/`DashboardScreen` unit tests don't gate in
  CI -- worth a bead if the owner wants full coverage there.
