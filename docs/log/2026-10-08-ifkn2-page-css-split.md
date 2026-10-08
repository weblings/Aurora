# Aurora-ifkn.2 closed: shell.css page-wide rules split into page-only page.css

Id: ifkn2-page-css-split

2026-10-08. Vendor step 2 of the demo re-vendor (parent bead `Aurora-ifkn`,
child `Aurora-ifkn.2`). Moved the `*`/`html`/`body` rules out
of `web/ui/styles/shell.css` into new `web/ui/styles/page.css`, linked by
`web/ui/index.html` between tokens and shell (original reset-first order, so
the combined cascade is byte-identical and the app renders unchanged). The
demo keeps its equivalents scoped under `.db-port` in `web/demo/demo-layout.css`
(demo-owned): the `html` scrollbar rule intentionally not ported
(`#dashboard-pane` owns its scroll container), and the port uses
`overflow-x: clip` matching current upstream rather than the old vendored
seam's `hidden`. Vendor copies and `seams.test.mjs` untouched for `Aurora-ifkn.7`
to re-vendor; after that the `shell-css-scope` seam entry can go.

## Verification

- New `web/ui/styles/page.test.mjs` (no bare rules left in shell, page.css
  linked before shell, all three rules present) and new `.db-port` assertions
  in `web/demo/demo-layout.test.mjs`. Each observed failing on its pre-change
  file (via targeted `git stash`) and passing after.
- Full run: 20/20 node suites (`web/ui`, `web/ui/styles`, demo, vendor seams).

## Surprises

- Exact-match file editing fails on multi-line CRLF blocks, and this checkout
  is CRLF throughout `web/` — used byte-exact scripted edits with
  single-occurrence assertions instead (the "Sibling repos mix CRLF and LF"
  lesson in [[lesson-build-toolchain]]).
- That same lesson's stash variant fired in miniature: the two `git stash`
  round-trips used for the negative proofs popped back LF-only, caught by a
  `file` check after each pop and repaired by re-adding CR.
- First draft of the new layout assertions died with `Nothing to repeat` at
  the helper's `new RegExp` line: `ruleBlocks()` builds the regex from a
  string, so call sites need double backslashes where sibling regex literals
  need single ones (new entry in [[lesson-webui-testing]]).
- Follow-up, same turn: owner asked for LF checkouts repo-wide so CRLF stops
  tripping up agents; committed `* text=auto eol=lf` in `.gitattributes`
  (no `.bat`/`.cmd`/`.ps1` in the tree, nothing needs CRLF) and materialized
  it with a clean-tree `reset --hard`. New entry in [[lesson-layout-css]]
  covers the `clip`-not-`hidden` de-seaming call.
