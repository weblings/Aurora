# Browser video-upload input — findings, not a decision

Prompted by a phase 3 idea: let a user upload a video file (Ogg or another
open format) to the Three.js browser demo, run it through `Processing` as
it plays, and drive an output from it. Captures what's actually true about
the current codebase relevant to that idea. **Status: not aligned on shape
or direction yet** — this is context for reaching that decision, not the
decision itself, same spirit as `DistributedArchitecturePlan.md`.

## Nothing for this exists yet, in either direction

No video-file input exists — native or browser. Phase 3 itself hasn't
started: no httplib extension, no Three.js scene, nothing in `web/`. This
doc is pure groundwork, not a retrofit.

## The fit is real: this is "just another `IInput`," not a redesign

`DistributedArchitecturePlan.md` already found the general principle this
falls under: *"`Output` doesn't care where a `Frame` came from — live
capture+crop, a VJ console, or a pre-authored cue file all look identical
by the time they reach it."* A video file decoded frame-by-frame is the
same shape as a VJ app's live feed (already mapped there as "just another
`IInput`") — feeding real content into `Processing` instead of a captured
desktop. The module boundary doesn't need to change; a video source is a
new implementation behind an existing interface, not a new concept.

## Where decode + Processing actually happens is the real fork

**Option A — decode natively, browser stays a pure consumer.** A new
`IInput` (e.g. `NativeVideoGrabber`) backed by OpenCV's `cv::VideoCapture`
(already a dependency) reads the uploaded file and feeds the existing
`Orchestrator` → `Processing` → `IOutput` pipeline unchanged — the same
path `WindowsGrabber`/`X11Grabber` already use. The browser's role stays
exactly what phase 3 already planned: MJPEG preview + SSE zone data, no
web-specific code added for this feature at all. Real open question, not
assumed: whether OpenCV's build here actually decodes Ogg Theora — needs
checking against the real library before designing around it, same rigor
already planned for the ISF library in phase 5's `OpenFormatsResearch.md`.

**Option B — decode in the browser.** An HTML5 `<video>` element decodes
the upload for free — no native codec dependency to verify at all. A
`<canvas>` samples frames; the crop/average math gets *reimplemented* in
JS (not ported — it's small: `getImageData` on a zone's rect, average the
pixels). This is genuinely new, web-specific code, parallel to `Processing`
rather than reusing it. Driving the Three.js visualization from this is
then fully self-contained, no backend involved.

## The fork that actually matters: does uploaded video need to reach real bulbs?

- **Visualization-only:** Option B is complete as-is — a self-contained
  browser feature, zero native changes, ships independently of everything
  else in phase 3.
- **Real bulbs too:** browsers can't open the DTLS/UDP socket `HueOutput`
  needs — this isn't a library gap, browsers structurally can't do raw UDP.
  Needs a small new relay endpoint on the existing httplib server (browser
  POSTs a `Frame`, a thin adapter calls the *unchanged* `HueOutput::send()`)
  — `HueOutput` needs zero modification, same "`IOutput` doesn't care about
  provenance" principle, but it's real new plumbing. This is also the first
  *concrete* case landing on `DistributedArchitecturePlan.md`'s still-open
  one-seam-vs-double-seam question: a browser tab acting as an `IInput`
  (and partial `Processing`), talking to the native process over HTTP, is a
  mild instance of that double seam — worth revisiting that question with
  this as a real example, not staying purely hypothetical.

## A format caveat, worth checking before committing either way

Ogg Theora's native browser support has been fading (dropped by some major
browsers already) — WebM (VP8/VP9/AV1) is the modern open,
patent-unencumbered equivalent with much stronger real support today.
Worth verifying current browser support directly rather than assuming Ogg
is still the right open-format choice, especially if Option B (browser
decode, which leans on native `<video>` support) is the direction taken.

## Follow-up: a concrete native step, and a reuse-vs-reimplement framework

- **VideoFile-Input is a concrete native `IInput`, buildable independent of
  the web question.** A `VideoFileGrabber` backed by `cv::VideoCapture`
  (same shape as `WindowsGrabber`/`X11Grabber`) could drive the existing
  native pipeline — and real Hue bulbs — from an uploaded video file today,
  with zero web involvement. Worth doing on its own merits regardless of
  how/whether the browser demo lands.

- **GitHub Pages sharpens the "browsers can't reach Hue" point above: it
  can't run a backend at all.** The relay-endpoint idea above needs *some*
  process listening (httplib or otherwise) — Pages is static hosting only.
  A GitHub Pages-hosted demo is capped at visualization-only (Option B
  below) unless hosted somewhere that can actually run a server.

- **A reuse-vs-reimplement framework already exists in a sibling project —
  worth applying here rather than re-deriving.**
  [`RockyRoadImport/SongConverter/docs/native-logic-reuse-decision.md`](../../RockyRoadImport/SongConverter/docs/native-logic-reuse-decision.md)
  lays out compile-and-reuse-via-WASM vs. hand-port in general terms, from
  that project's own `.psarc`-import case (~2000 lines of binary-format/
  crypto logic, no JS equivalent, reused via .NET's WASM tooling). Its
  guidance: lean toward WASM-reuse when logic is *substantial and risky to
  re-derive* (binary formats, crypto, parsers); lean toward hand-porting
  when it's *small and stable*.

  Applied to Aurora's `Processing` (`rescale`/`dropAlpha`/`getSubImage`/
  `Algorithms::mean` — see `core/Processing/src/ImageProcessing.cpp`) and
  `Smoother` (a per-zone RGB exponential moving average): none of it is
  binary-format/crypto-class logic, all of it has a direct Canvas/JS
  equivalent, and none of it decodes video (the browser's native `<video>`
  element already does that — the same role `OffscreenCanvas`-based PNG
  encoding plays in the RockyRoadImport doc's own album-art example, where
  the risky part was reused via WASM but the trivially-native-replaceable
  part was left to JS). By that doc's own guidance, this argues for
  hand-porting (Option B above), not compiling `Processing` to WASM.

  A real "Option C" still exists and isn't the same as either option
  above — compiling Aurora's actual `Processing`/`Smoother` source via
  Emscripten against `opencv.js`. Recorded here as available if
  zero-logic-duplication ever outweighs the small-and-stable case, but not
  the better-argued default today.

  Either way, this doesn't touch the Hue question — a WASM module in a
  browser tab still can't open a DTLS/UDP socket, the same wall Option B
  always had.

**Still not enough pieces to decide shape.** This sharpens which
reimplementation path the existing decision framework favors and flags one
native step worth doing regardless — it doesn't resolve visualization-only
vs. real-bulb relay, Ogg vs. WebM, or whether/when phase 3 actually branches
on any of this.

## Follow-up: native vs. browser dependencies for video-file decode

A `VideoFileGrabber` isn't the same shape natively as it would be in the
browser — not just fewer libraries, a different *kind* of dependency.

- **Native path:** the dependency is build-time — OpenCV's `videoio` module
  plus whatever decode backend it's built against (FFmpeg on most
  Linux/vcpkg builds, Media Foundation on Windows depending on the port).
  Nothing built today uses `videoio` at all — `Processing`/
  `Contracts::ImageData` only need `core`/`imgproc` (`resize`/`cvtColor`/
  `mean`) — so this is a real addition, and which containers/codecs
  actually decode depends entirely on that backend's own compiled-in codec
  list. Still unverified (see the follow-up above). Minor, likely-moot
  aside: FFmpeg's own license varies by which codecs are compiled in (GPL
  vs. LGPL) — almost certainly doesn't matter since Aurora is already
  GPLv3 end to end, just worth naming as a variable.
- **Browser path (`<video>` element, Option B):** zero library dependency
  for decode — no OpenCV, no vcpkg, no FFmpeg, nothing to link. The
  dependency doesn't disappear, though, it moves: from build-time and
  pinned (native: one OpenCV/FFmpeg version, uniform across every machine
  that runs the build) to runtime and unpinned (browser: whichever codecs
  the visitor's specific browser happens to support, which can't be
  vendored the way a native build pins its version). Same underlying issue
  as the Ogg-vs-WebM caveat above, restated as a dependency question rather
  than a format-choice one.
- **Even Option C (WASM + `opencv.js`) wouldn't change this.** Video decode
  would still stay on the browser's native `<video>`, not OpenCV's
  `videoio`/FFmpeg-in-WASM (a genuinely heavy, separate undertaking nobody
  reaches for here) — a WASM module would only ever touch post-decode pixel
  data pulled off a `<canvas>`. Decode is the one piece where the browser's
  native capability is just strictly better than reusing native code,
  regardless of which option wins for the crop/average math layer.
- **Practical implication:** if the goal is ever just the browser demo (no
  real bulbs), the open question above about whether core's OpenCV build
  has `videoio`+FFmpeg enabled is moot — it only matters for the native
  `VideoFileGrabber` path.

## Related docs

- `DistributedArchitecturePlan.md` — the one-seam/double-seam question this
  connects to; the "`Output` doesn't care about `Frame` provenance" finding
  this whole doc builds on.
- `OpenFormatsResearch.md` — the VJ-input/authored-track mapping this
  mirrors, and the phase-5 "verify a library's real behavior first" habit
  this doc's Ogg/OpenCV caveat follows.
- `ImplementationPlan.md` — phase 3, which this doc feeds into once a shape
  is chosen.
- `../../RockyRoadImport/SongConverter/docs/native-logic-reuse-decision.md`
  — the general WASM-reuse-vs-hand-port framework the follow-up above
  applies to `Processing`/`Smoother`.
