# Bundle icon: qlmanage was flattening transparency and mis-centering the mark

Closed `Aurora-8hh` (ad-hoc task, not part of the `Aurora-8mk` epic).

The Dock icon had two visible problems: a solid white background instead of
transparency, and the "A" mark sitting noticeably off-center. Extracted the
built `.icns` back into PNGs (`iconutil -c iconset`) to compare against the
source assets directly rather than guessing.

Root cause, split into two independent bugs:

- **Background**: `make_icns.sh` rasterized `docs/README/Logo_Square.svg`
  at every `.iconset` size via `qlmanage -t` (macOS's QuickLook
  thumbnailer), chosen originally to avoid adding a real SVG-rasterizer
  build dependency. `qlmanage` flattens transparency onto an opaque white
  background -- it's a Finder-preview-thumbnail generator, not an icon
  compiler, and isn't a faithful rasterizer for this use.
- **Centering**: initially misdiagnosed this as the same `qlmanage` bug,
  but a direct pixel comparison against the raw source PNG showed the
  identical offset already baked into the design export -- not a
  rasterization artifact. Measured with Pillow's alpha-channel `getbbox()`
  (cross-checked at multiple alpha thresholds to rule out anti-aliasing
  noise): the content's bounding box in the 1024px master had a 18-22px
  left/right margin (fine) but a 124px top / 156px bottom margin -- a real
  32px vertical offset, plus a lot of unused padding overall (content only
  filled ~73% of the canvas height).

Fix: `make_icns.sh` now downsamples from a real 1024px transparent PNG
master (`docs/README/Logo_Square_{Dark,Light}_1024.png`, newly exported and
supplied by the user) via `sips` -- a plain bitmap resizer, ships with
every Mac, no new dependency -- instead of rasterizing the SVG. Only ever
downsamples, never up, so nothing goes soft. The master itself was
corrected in place: cropped to its actual alpha-channel content, then
re-pasted centered in a fresh transparent canvas, plus a 28px upward nudge
for optical balance (mathematical bbox-centering reads as slightly low for
this mark -- the flat, heavy base of the "A" carries more visual weight
than the thin aurora spike tops, a common correction for pointed/
triangular shapes). Iterated against the real running Dock icon three
times (plain crop+recenter, then +28px nudge) with the user confirming
live each time, rather than guessing at "correct" from a static preview.
512px variants regenerated from the corrected 1024px masters via `sips`,
keeping one corrected source of truth instead of drifting.

One open discrepancy, not resolved: the `.icns` file itself is confirmed
real `RGBA` with `hasAlpha: yes` at every level (`sips`, Pillow), but the
user reports still seeing a solid (not transparent) background in the
actual Dock. Left as a follow-up rather than blocking -- possibly a macOS
Dock/icon-cache compositing behavior distinct from the file's own
correctness, but not root-caused this session.

State: `Aurora-8hh` closed. Icon is a clear improvement over the prior
qlmanage-flattened, badly-offset version; background-transparency gap
open as a follow-up.
