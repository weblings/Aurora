# Doc-linking mechanism: `Id:`/`[[id]]` wikilinks (2026-09-29)

Surfaced while scoping the MacSupport.md split into `docs/archive/mac` +
`docs/planning/mac`: path/bare-filename citations break silently on move or
rename, because `check-links.sh` only resolves a citation by walking upward
from the citing file's own directory -- it can't see sideways across
`docs/`'s subtrees, so a citation into a sibling folder can drift stale
without the checker ever catching it. Built a move-proof mechanism instead
of doing another hand-fix pass (`Aurora-lmn`, closes 3/4).

Shipped:
- `Id:`/`Superseded-by:` convention documented in `docs/README.md` (same
  "Key: value" style as existing `Status:`/`Tags:`/`Applies-when:` lines).
  Ids are kebab-case, assigned once, never renamed. `[[id#anchor]]` replaces
  brittle `#L34-L36` line anchors with a heading-slug reference that
  survives unrelated edits, mirroring `docs/lessons/README.md`'s existing
  "cite by headline, never by filename" rule.
- `check-links.sh` extended: repo-wide `id -> path` index (not an upward
  walk), duplicate-id and multi-`Id:`-line detection, `[[id]]`/`[[id#anchor]]`
  resolution, `Superseded-by:` chain-following (warns, doesn't fail).
  `[[id]]` is ignored inside code spans/fenced blocks (Obsidian/Foam
  convention), so a doc can show `` `[[id]]` `` as a syntax example without
  it being treated as a real, dead citation -- needed immediately, since
  `docs/README.md`'s own new convention section does exactly that.
- `docs/_ids.md` generated (id, current path, title, superseded-by
  annotation) as a byproduct of the same scan -- regenerated every run,
  never hand-edited, the human lookup for a citation form that renders as
  literal bracketed text on GitHub with no live resolver behind it.
- Old-style path/bare-filename citations keep resolving unchanged;
  adoption is opportunistic (new docs use `Id:`/`[[id]]`, existing ones
  convert when next touched), not a flag-day rewrite.

Caught before shipping (fixture-tested, not trusted on the first pass):
a superseded id whose own file still physically existed resolved directly
and silently skipped the chain-following/warning path -- fixed by always
checking `Superseded-by:` first, regardless of whether the old id also had
a direct path entry. See the new debugging-method.md entry.

Also reconciled a real gap found along the way: the `dev`-branch merge that
preceded this work had hand-resolved a `.beads/issues.jsonl` conflict,
leaving 6 issues in the tracked export that the live Dolt DB never saw --
`bd create` caught it and refused to auto-export rather than silently
losing them. Fixed with `bd import`. See the new architecture-process.md
entry.

Sequencing: `Aurora-lmn` (this work) -> `Aurora-le6` (migrate MacSupport.md
onto the new convention) -> `Aurora-4ux` (migrate WebUI docs, second
validation pass). `Aurora-lmn.4` (CI enforcement) filed but deprioritized --
CI doesn't run reliably in this repo currently; enforcement stays manual
(`check-links.sh`/`check-lessons.sh` by hand, per `docs/README.md`'s reorg
checklist) until that's revisited.

Open: broader `docs/` rollout past mac/WebUI (Phase 3) intentionally has no
beads yet -- revisit once the mechanism has two real subjects behind it.
