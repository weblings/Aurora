# Browser video-upload input — findings, not a decision

Prompted by a phase 3 idea: let a user upload a video file (Ogg or another
open format) to the Three.js browser demo, run it through `Processing` as
it plays, and drive an output from it. Captures what's actually true about
the current codebase relevant to that idea. **Status: v1's shape is
decided** — file input (bundled WebM sample + upload), hand-ported JS
processing, a Three.js 9-slice virtual-light output, video-only, no native
backend, no Hue-in-browser stretch goal (cut, see below). Repo split
(2026-09-14): the demo lives in its own new repo, `Aurora-Demo-Web`; only the
hand-ported processing math stays in `Aurora/web-processing/` — see
`ImplementationPlan.md`'s Phase 3. Still open:
implementation specifics (the exact 9-slice/zone-map wiring, the sample
video's actual content) and anything audio-related, deferred past v1
entirely.

## Nothing for this exists yet, in either direction

No video-file input exists — native or browser. Phase 3 itself hasn't
started: no httplib extension, no Three.js scene, nothing in `Aurora-Demo-Web`
(not yet created) or `Aurora/web-processing/`. This
doc is pure groundwork, not a retrofit.

## The fit is real: this is "just another `IVideoInput`," not a redesign

`DistributedArchitecturePlan.md` already found the general principle this
falls under: *"`Output` doesn't care where a `Frame` came from — live
capture+crop, a VJ console, or a pre-authored cue file all look identical
by the time they reach it."* A video file decoded frame-by-frame is the
same shape as a VJ app's live feed (already mapped there as "just another
`IVideoInput`") — feeding real content into `Processing` instead of a
captured desktop. The module boundary doesn't need to change; a video
source is a new implementation behind an existing interface, not a new
concept.

## Where decode + Processing actually happens is the real fork

**Option A — decode natively, browser stays a pure consumer.** A new
`IVideoInput` (e.g. `NativeVideoGrabber`) backed by OpenCV's `cv::VideoCapture`
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
  one-seam-vs-double-seam question: a browser tab acting as an `IVideoInput`
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

- **VideoFile-Input is a concrete native `IVideoInput`, buildable independent of
  the web question.** A `VideoFileGrabber` backed by `cv::VideoCapture`
  (same shape as `WindowsGrabber`/`X11Grabber`) could drive the existing
  native pipeline — and real Hue bulbs — from an uploaded video file today,
  with zero web involvement. Worth doing on its own merits regardless of
  how/whether the browser demo lands.

- **GitHub Pages, on its own, can't run a backend -- but the relay it'd
  need already exists.** Pages is static hosting only, so it can't run the
  relay-endpoint idea above itself. **Corrected below** ("GitHub Pages
  reaching a local Hue setup"): this doesn't cap a Pages-hosted demo to
  visualization-only the way it first looked like it would -- the relay
  doesn't need to live on Pages, it can be the native Aurora app already
  running on the user's own LAN, which Pages-hosted JS can simply `fetch()`.

- **A reuse-vs-reimplement framework already exists in a sibling project —
  worth applying here rather than re-deriving.**
  RockyRoadImport's `native-logic-reuse-decision` doc
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

  **Repo placement (2026-09-14):** this hand-port lives in `Aurora/web-processing/`,
  not the demo's own repo — it's the one piece of the demo that mirrors
  existing C++ logic, so it stays next to `Processing`'s source for
  drift-checking (see `ImplementationPlan.md`'s directory layout). The demo
  repo (`Aurora-Demo-Web`) copies this source directly; not an npm package
  for now.

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

## Reassessed after Phase 2.5: audio splits the reuse-vs-reimplement answer, doesn't flip it

The WASM-vs-hand-port conclusion above was reached purely from `ImageProcessing`'s
shape (`rescale`/`dropAlpha`/`mean`) — the only `Processing`-family code that
existed at the time. `AudioProcessing` (Phase 2.5, see `ImplementationPlan.md`)
now exists too, and applying the same framework to it doesn't give one answer
for "the middle module" — it splits, which is exactly what a case-by-case
framework should do once there's more than one case to apply it to:

- **`AudioProcessing`'s color-model math** (`updateDrift`/`updateBounce`/
  `randomAnchorHue`) — same shape as `ImageProcessing`: small, stable, pure
  arithmetic, no parsing. Unchanged verdict: hand-port.
- **`AudioFeatureExtractor`** (onset detection + spectral centroid, wrapping
  aubio's stateful `pvoc`/`specdesc`/onset objects) — a genuinely different
  category. This is real DSP that took real effort to get right even with a
  mature library doing the hard part (see `docs/AudioAnalysis.md`'s aubio
  verification pass) — re-deriving onset detection and spectral analysis from
  scratch in JS is exactly the "substantial, risky to re-derive" case the
  reuse framework argues *for* WASM on, not against.

**Feasibility confirmed, not hypothetical:** aubio has a real Emscripten/WASM
compile, [`aubiojs`](https://github.com/qiuxiang/aubiojs) (genuinely compiles
the actual aubio C library, confirmed via its own source, not a from-scratch
JS reimplementation). Caveat worth being precise about: `aubiojs` itself only
exposes pitch/tempo, not the raw onset-strength/spectral-centroid primitives
`AudioFeatureExtractor` actually needs, and shows little recent maintenance
activity — it's evidence the WASM path works at all, not a drop-in dependency.
Aurora would build its own thin Emscripten wrapper around aubio's onset/
specdesc objects, mirroring `AudioFeatureExtractor.cpp` closely, not adopt
`aubiojs` as-is.

**What this doesn't settle:** whether Phase 3/a future web version even
*wants* live audio-reactive analysis in-browser at all (today's scoped idea
is video-file upload, not audio) — this is groundwork for *if* that question
comes up, same "findings, not a decision" spirit as the rest of this doc.
Also doesn't generalize to "future processing logic" as a blanket rule: Phase
5's ISF shaders are GLSL source that runs via WebGL regardless of WASM vs.
JS, a third case this framework doesn't even apply to.

## The demo/funnel strategy (decided) and v1's scope

Reasoned through directly (not yet built): the "real-time, in-browser,
driving real bulbs, zero install" version of this demo **cannot happen**,
regardless of engineering effort — not a maturity gap, a hard platform
ceiling (see the Hue-API-throughput section below). Given that, the
decided primary strategy is a **zero-install demo that hooks first, with
the native app as the deliberate upgrade path** — not a fallback forced by
the ceiling, but the correct shape once the ceiling is understood: nobody
downloads a server to try a demo, but a good enough demo is what gets
someone to download the real thing.

Concretely, for Phase 3's Three.js browser demo (v1 scope, decided):

- **Input**: a bundled sample **video, WebM**, plus a user-upload option,
  decoded by the browser's own `<video>` element (Option B from "Where
  decode + Processing actually happens," above) — explicitly *not* live
  capture (`getDisplayMedia`) or a native decode step. This is the one
  piece of this whole plan that's actually load-bearing on "zero install":
  live capture needs a permission prompt every session and can't run
  unattended (see `DistributedArchitecturePlan.md`'s browser-capture
  reasoning); a file needs neither. Format handling deliberately kept
  simple: the demo is documented as working with WebM, not engineered for
  arbitrary-format robustness — an upload that fails to decode is the
  natural upsell moment toward the native app (broader format support via
  OpenCV) rather than a gap to close in the demo itself. Precedent:
  RockyRoad bundles its own sample media the same way
  (`v2/public/songs/*/song.ogg`), audio-only there since that's what its
  demo needs; Aurora's v1 needs a video sample instead, for the same reason.
- **Processing**: per the WASM-vs-hand-port reassessment above — color math
  hand-ported to JS. **Audio deferred from v1 entirely** (not just
  format-scoped like video) — the color math has no unbuilt pieces left,
  but audio still needs either a real WASM build of `AudioFeatureExtractor`
  or an explicit lower-fidelity JS-only fallback, a separately-scoped piece
  of work.
- **Output**: a Three.js virtual-light simulation — fully self-contained,
  no native dependency, no real bulbs, matches the "visualization-only"
  fork already identified above. The only Output shape for v1.
- **Messaging**: note that a full local native setup gives a more
  complete/robust experience for anyone already in the Hue ecosystem — this
  framing is Hue-specific and worth revisiting once Output targets expand
  past Hue (DMX/Art-Net/sACN, other bulb brands, XR-scene effects are
  already named as future Output targets in `ImplementationPlan.md`'s
  stretch section).

## Considered and cut: CLIP-in-browser as a rougher real-bulb Output

A rougher, real-bulb-driving Output using Hue's plain CLIP v2 REST API
directly from the browser (instead of the Entertainment API's UDP/DTLS
stream) was considered as a stretch goal, then explicitly cut from scope
after this reasoning held up under a real hail-mary search for prior art —
recorded here so the reasoning isn't lost, not as an invitation to revisit
without new information.

Two separate real Hue APIs matter here, verified directly rather than
assumed:

- **Entertainment API** (UDP + DTLS-PSK, port 2100) — what `HueOutput`
  actually uses today, for both the video and audio pipelines (they
  reconverge at the same `IOutput::send()` call, see `StackComparison.md`).
  Categorically unreachable from a browser at any permission level —
  browsers have no raw UDP socket API at all, a missing platform capability,
  not a permission gate. Chrome's Local Network Access rollout (see below)
  doesn't change this: LNA governs permission for *existing* web networking
  primitives (fetch, WebSocket) reaching private IPs, it doesn't add a new
  one.
- **CLIP v2 REST API** (plain HTTPS) — the bridge itself doesn't grant CORS
  access to arbitrary public origins (see "GitHub Pages," below, for the
  distinction: that's about a browser reaching *Aurora's own* native
  relay, which controls its own CORS headers -- the bridge is a different,
  third-party server Aurora doesn't control at all). A page hosted anywhere
  public can't read the bridge's response directly, regardless of Local
  Network Access. Even setting that aside, the bridge rate-limits CLIP to
  **20 requests/sec, bridge-wide, across every light**
  ([community reports](https://community.home-assistant.io/t/philips-hue-bridge-api-requests-throttling/106888)).
  Entertainment/DTLS exists specifically because that ceiling is too low for
  synced multi-zone effects. Aurora's actual differentiator (each zone
  showing its own independently-sampled color, not one uniform color) makes
  this worse, not just slow: CLIP v2's `grouped_light` resource applies one
  state to an entire group, so independent per-zone colors need one PUT per
  zone per update -- a handful of zones alone consumes most or all of the
  bridge-wide budget, before accounting for anything else touching the
  bridge.
- **Not a substitute path, verified:** Hue's only push/streaming mechanism
  on the CLIP v2 side is `/eventstream/clip/v2`, which is **Server-Sent
  Events, not WebSocket**
  ([official docs](https://developers.meethue.com/develop/hue-api-v2/)),
  and it's one-directional *from* the bridge (state-change notifications),
  not a channel for sending color commands faster. WebSockets aren't an
  available option for either Hue API in the write direction this needs.

**A hail-mary search for prior art came back empty for the case that
matters.** Real projects exist claiming direct browser-to-bridge control
([`jsHue`](https://github.com/blargoner/jshue),
[`Kingfish`](https://github.com/peterkaminski/kingfish)) -- checked
Kingfish specifically since it claims zero server/proxy involvement. It
works by using the older, plain-HTTP Hue API v1, not CLIP v2 over HTTPS,
and its README doesn't address CORS at all. That's not a counterexample --
it's a different setup that avoids the *same* wall by not standing in it:
v1-over-HTTP only sidesteps mixed-content blocking if the controlling page
itself isn't served over HTTPS, which a publicly-hosted demo (GitHub Pages
or otherwise) always is. Nobody's actually solved "public HTTPS page talks
directly to a real bridge" -- they've solved an adjacent, incompatible
case.

**Conclusion: cut from scope, not merely deprioritized.** The premise
doesn't survive contact with how browsers actually work: the whole appeal
was reaching real bulbs *without* the native app running at all, and the
CORS finding disproves that outright -- some native process has to run
locally either way to bridge that gap. Once any native involvement is
required at all, there's no reason to build a CLIP-only relay instead of
using the native app that already does the real, better thing (DTLS
streaming) unmodified. (Checked, in case it mattered anyway: CLIP v2's own
auth flow needs the same physical link-button press Entertainment does,
plus one API call -- not the zero-touch flow "lower onboarding friction"
first suggested. The only actual simplification is skipping the
Entertainment Configuration definition step and the `clientkey` derivation,
narrower than first stated.)

## GitHub Pages reaching a local Hue setup -- corrected finding

An earlier pass in this analysis (see the "GitHub Pages" bullet under
"Follow-up" above) concluded a Pages-hosted demo is capped to
visualization-only because Pages can't run a backend. That's an
overstatement worth correcting explicitly: **Pages doesn't need to run a
backend** -- the native Aurora app, already running on the user's own LAN,
already is one (the same httplib server Phase 3's MJPEG/SSE preview needs).
A Pages-hosted page can `fetch()` that already-running process directly,
acting as a thin remote-control/relay client, the same "double seam" shape
`DistributedArchitecturePlan.md` already named. Credentials never move to
the browser -- only the already-configured native process needs them.

Two real, current technical specifics worth designing around rather than
assuming, verified this session:

- `localhost`/`127.0.0.1` is exempted from mixed-content blocking in Chrome
  and Firefox (Safari blocks all mixed content)
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content)).
- A real LAN IP (`192.168.x.x`) is governed by Chrome's newer **Local
  Network Access** policy -- a public HTTPS origin reaching a private IP
  now triggers an explicit browser permission prompt, separate from plain
  mixed-content rules
  ([Chrome for Developers](https://developer.chrome.com/blog/local-network-access)).
  Worth designing the relay's discovery/connection UX around this
  explicitly, not discovering it during implementation.
- The native REST server needs CORS headers allowing the Pages origin --
  small, real, not yet implemented (no such server exists yet at all; this
  is Phase 3's own prerequisite, see `ImplementationPlan.md`).

## Follow-up: backport the demo's audio color-model A/B tuning to Windows/Linux -- not started

`Aurora-Demo-Web` ended up building a real hand-ported `updateDrift`/`updateBounce`
(`web-processing/colorModel.js`, tested against all 12 of `AudioProcessingTests.cpp`'s
cases) alongside native's own defaults, plus a "tuned" preset (faster `bounceSmoothTime`/
`brightnessSmoothTime`, higher `dynamismFloor`/`driftBaseRateDegPerSec`) that reads
noticeably better on a screen than native's own listening-tuned-for-real-bulbs defaults.
Worth actually comparing the same tuning on real Hue bulbs, not just assuming a screen
preference transfers.

**Verified this needs zero code changes on either app** -- `Config`/`ConfigStore` already
persist every `AudioEffectSettings` field as plain `config.json` keys (`audioBounceSmoothTime`,
`audioBrightnessSmoothTime`, `audioDynamismFloor`, `audioDriftBaseRateDegPerSec`, ...), and
both `Aurora-App-Windows` and `Aurora-App-Linux`'s `main.cpp` build `AudioEffectSettings`
fresh from `Config` on every run (confirmed in both, not assumed). The comparison is:
edit `config.json`'s audio keys to the tuned values, restart, watch the real bulbs, edit
back to defaults, restart again. Sequential, not simultaneous -- `Config` is only loaded
once at startup, no live-reload exists.

**Two real preconditions to check before running it**, not yet verified: `useAudioMode`
needs `activeInputName` empty and `activeAudioInputName` set (e.g. `"windows-audio"`) in
`config.json`, and the app needs to have actually been built with its audio-grabber flag
enabled (`AURORA_INPUT_WINDOWS_AUDIO_AVAILABLE` / the Linux equivalent) -- getting audio
mode running at all is a separate first step from the tuning comparison itself.

## Related docs

- `docs/AudioAnalysis.md` — the aubio verification pass and
  `AudioFeatureExtractor`'s design, which the audio-reassessment section
  above argues makes it a WASM-reuse candidate.
- `DistributedArchitecturePlan.md` — the one-seam/double-seam question this
  connects to; the "`Output` doesn't care about `Frame` provenance" finding
  this whole doc builds on.
- `OpenFormatsResearch.md` — the VJ-input/authored-track mapping this
  mirrors, and the phase-5 "verify a library's real behavior first" habit
  this doc's Ogg/OpenCV caveat follows.
- `ImplementationPlan.md` — phase 3, which this doc feeds into once a shape
  is chosen.
- `ModuleSplitPlan.md` — the repo-split reasoning (originally written for
  Input/Output plugins) that `Aurora-Demo-Web`'s split applies too, more
  cleanly than any existing plugin repo.
- RockyRoadImport's `native-logic-reuse-decision` doc
  — the general WASM-reuse-vs-hand-port framework the follow-up above
  applies to `Processing`/`Smoother`.
