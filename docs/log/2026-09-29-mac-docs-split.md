# Mac docs split: MacSupport.md -> archive/mac + planning/mac (2026-09-29)

Dogfooded Aurora-lmn's `Id:`/`[[id]]` mechanism on its first real subject
(Aurora-le6).

Shipped:
- MacSupport.md (884 lines) split into
  docs/archive/mac/{VideoCapture,Audio,Permissions,TrayParityHistory}.md
  (shipped: Aurora-8mk, Aurora-9z4, most of Aurora-qps) and
  docs/planning/mac/{TrayParity,Notarization}.md (open: qps.5/.6,
  8mk.10). Both kept as real subdirectories, no internal README --
  matches the pre-split docs/WebUI/ precedent.
- Each file got an Id: line; minted 2 new section headings (Load-bearing
  risk, Ad-hoc signing re-prompts every rebuild) so old #L33-L36-style
  line anchors could become `[[id#anchor]]` instead.
- Rewrote the stale "Open questions" section: dropped 4 untracked/resolved
  items with no bead behind them, folded 2 into their now-closed phase's
  own history, kept the 1 genuinely open item (notarization cost) in
  planning/mac/Notarization.md.
- mbedtls@3-vs-4 pitfall extracted to docs/lessons/build-toolchain.md as
  a proper Tags:/Applies-when: entry -- never had one before.
- Every citation repointed: CONTRIBUTING.md, docs/README.md,
  docs/lessons/input.md, and 6 docs/log/*.md historical entries -- mostly
  to `[[id]]`/`[[id#anchor]]` (more precise than a bare bead ID once anchors
  exist), a few pure historical mentions de-backticked instead since they
  describe a past action, not a live target.
- docs/MacSupport.md deleted outright, no stub.

Verified: first real-content test of the mechanism. check-links.sh
resolved all 6 ids, every cross-file citation, and both new anchors
clean on the first pass. Deleting MacSupport.md and re-running caught
exactly one thing a manual pass missed (docs/README.md's own
parenthetical still citing it by bare path) -- fixed, re-ran clean.

Beads: Aurora-le6 (epic, closed), le6.1-.4.
