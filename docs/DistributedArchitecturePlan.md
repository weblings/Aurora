# Distributed architecture — how far to decompose Input/Processing/Output over a network

Status: exploratory — future network-transport options, none scheduled; WebSocket question deferred.

Prompted by comparing Aurora's shape against RockyRoad's self-hosted
song-server pivot (one server, browser-only clients moving heavy
per-device work client-side) and Jellyfin (self-hosted, still ships a
native app per platform). Captures an architecture question raised while
scoping `Aurora-App-Linux`, deliberately **left open, not resolved** — the
near-term work (a single local process on Linux) doesn't depend on
answering it, but future network-transport work (the deferred WebSockets
stretch goal) does.

## The three tiers aren't symmetric in what crosses a network seam

- **Input → Processing**: raw-ish pixel data (a subsampled frame — tens to
  hundreds of KB, at 30-60Hz). Real LAN bandwidth, and today's
  `Orchestrator` needs it synchronously to do the crop/dominant-color step
  (`composeFrame`), so Processing naturally wants to sit next to Input.
- **Processing → Output**: a `Contracts::Frame` — a handful of
  `{id, color, gamma}` entries regardless of zone count. Negligible
  bandwidth, latency-tolerant.

Any network seam is technically possible, but they aren't equally cheap.
Splitting Input away from Processing means shipping video-ish data over
the wire; splitting Output away from Processing means shipping almost
nothing.

## Why RockyRoad's collapse doesn't fully carry over

RockyRoad's song-server works because the *heavy* per-device work (Web
Audio synthesis, WebXR rendering) is something a generic browser can do on
any platform — the server's job is just serving files. Aurora's Input side
doesn't have that out: capturing a specific OS's screen buffer needs
X11/Wayland/DXGI (or a browser's `getDisplayMedia()`, a real but
lower-fidelity/higher-latency alternative worth keeping in mind, not a
today's-priority replacement for native capture). That's a hard platform
boundary, not a UI/distribution one — the same reason Jellyfin, despite
being self-hosted, still ships a native client per platform: the client
side still touches platform-specific concerns (hardware decode, app-store
distribution for Jellyfin; OS capture APIs for Aurora).

Output has no equivalent boundary — DTLS-to-a-bridge (or future
Art-Net/sACN/OSC) doesn't care what OS sent it the `Frame`. That's the part
that collapses cleanly into "one self-hosted brain," the same way
RockyRoad's server collapsed content-serving.

## One seam vs. a double seam (open question)

**Case for one seam** (Input+Processing co-located; Output the only
separable tier, or the mirror of that — whichever side is cheaper to keep
raw pixels on stays together):

- Matches the bandwidth asymmetry above — the expensive data (raw frames)
  never has to cross a network boundary at all.
- Dynamic swapping only needs one discovery/attach protocol ("a producer
  of `Frame`s connected or disconnected"), not two independent routing
  graphs.
- Every `Frame` producer looks the same to `Output` regardless of
  provenance (see the VJ/authored-track mapping below) — a strong argument
  that the natural pluggable boundary is "whatever produces a `Frame`,"
  not each of Input/Processing/Output independently.

**Case for a double seam** (Input, Processing, and Output each
independently placeable — not settled, recorded here so it isn't lost):

- A real, named use case exists: a deliberately low-power/dumb capture
  device (an HDMI capture dongle on a small ARM board, say) that can't run
  the crop/average math itself, wanting a beefier machine to do that work
  while yet another device (or the same one) owns the bridge connection.
- More flexible in the abstract — closer to a professional AV matrix
  (NDI-style routing, or Art-Net/sACN's universe-addressing model), which
  are proven patterns, not hypothetical ones.
- Not proven to be *harder* enough to rule out — the "two routing graphs"
  cost above is real but not necessarily prohibitive, especially if both
  seams end up needing similar discovery/attach machinery anyway (build it
  once, use it twice, rather than assuming the second seam is additional
  net-new complexity proportional to a from-scratch design).

**Status: unresolved, intentionally.** Recorded here so the case for a
double seam doesn't get silently dropped just because the one-seam case
was easier to articulate first. Revisit when the WebSockets stretch goal
actually gets picked up, with whatever's been learned by then about real
usage patterns (e.g., whether the low-power-capture-device scenario above
turns out to matter in practice).

## Where VJ I/O and authored tracks land

Tracing these against `OpenFormatsResearch.md`'s findings clarifies the
seam question rather than sitting outside it:

- A VJ app's live output (NDI/Syphon/Spout) is just **another `IVideoInput`** —
  same shape as `X11Grabber`, feeding real content into Processing instead
  of a captured desktop.
- Forwarding Aurora's `Frame` to Art-Net/sACN/OSC so a lighting console can
  ingest it is just **another `IOutput`** — already anticipated in the
  original format research.
- ISF shader effects are a **Processing-stage** enhancement (phase 5,
  already on the roadmap) — richer `composeFrame`, same architecture
  either way.
- An **authored track** (a pre-programmed cue sequence, not derived from
  live capture) is the interesting one: it already knows its per-zone
  colors, so it doesn't want to go through Processing's crop/average step
  at all — it wants to hand `Orchestrator`/`Output` a `Frame` directly.

That last point is the real finding, independent of the seam-count
question: **`Output` doesn't care where a `Frame` came from** — live
capture+crop, a VJ console, or a pre-authored cue file all look identical
by the time they reach it. `Orchestrator` should eventually accept a
`Frame` from more than one kind of upstream source (live-composited via
`IVideoInput`, or handed directly by an authored-track/VJ bridge), not assume
every `Frame` originates from a crop step. This is true regardless of
which seam-count answer wins above.

## What this means for today's work

`Aurora-App-Linux` now exists — a single local process, no network code
yet. Nothing in `IVideoInput`/`IAudioInput`/`IOutput`/`Orchestrator`'s
current shape commits to either seam count: they're already clean
interfaces, not things wired together in a way that would need undoing.
The registry/config-driven plugin-selection work (see the "app" repo
discussion) is orthogonal to seam count too — it's about *which* plugins
run, not how many network hops separate them.

The one concrete principle worth carrying forward while building: don't
bake in an assumption that a `Frame` always comes from `composeFrame`.
Keeping that entry point open is cheap now and expensive to retrofit later,
regardless of how the seam-count question eventually resolves.

## `Contracts` vs. the `IVideoInput`/`IAudioInput`/`IOutput` interfaces — two different layers, easy to conflate

Reasoned through while considering web/mobile shapes, worth stating
precisely since it looked contradictory before being separated out:

- **`Contracts`** (`ImageData`, `AudioBuffer`, `Frame`, `Zone`, `Color`,
  `AudioFeatures`) are plain data shapes. This is the thing that has to
  stay consistent across *every* deployment shape below, always crossing
  as data — a struct in memory, or its JSON-equivalent shape over a wire.
- **`IVideoInput`/`IAudioInput`/`IOutput`** are C++ virtual interfaces — a
  compiled-language mechanism for how `Registry` wires plugins together
  *within one process*. They never cross a process or language boundary in
  any of the shapes below, native-only or not — you can't invoke a C++
  virtual method from another language or another machine any more than
  you could from JS across a network.

So a browser (or a future mobile client, or a remote capture device) never
needs to "implement `IVideoInput`" — that was never the mechanism it would
use. Its job is producing/consuming data shaped like `Contracts`' types,
then serializing it. The interfaces are a within-process implementation
detail; `Contracts` is the actual cross-boundary agreement, and it's the
only thing every shape below has in common.

## Probable shapes, given the platforms actually under consideration

Not a decision — an inventory of what the existing Input/Processing/Output
split plus `Contracts` already seems to accommodate, reasoned through
directly against real platform constraints (web's permission/execution
model, Hue's own API limits — see `BrowserAnalysis.md` for the Hue-specific
findings) rather than staying abstract. None of these need a new
architecture; each is a new *implementation* of the existing three roles,
optionally split across a process/network boundary using `Contracts` as
the wire format when they are split.

1. **Native standalone** (built today, Windows/Linux) — capture+process+
   output, one process, no network seam at all.
2. **Native backend + remote web/mobile client** — an always-on native
   process exposes a relay endpoint; a thin client (a browser tab, a phone
   app) reaches it over the LAN for control/visualization/relay.
   Credentials stay native-side. The concrete case: a GitHub Pages-hosted
   page `fetch()`-ing an already-running native Aurora app (see
   `BrowserAnalysis.md`).
3. **Fully self-contained web/mobile demo** — its own Input (a file, not
   live capture), own Processing (JS or WASM), own Output (Three.js/canvas)
   — genuinely standalone, genuinely can't reach real bulbs, by design not
   as a limitation to fix. The decided Phase 3 demo strategy — see
   `BrowserAnalysis.md`.
4. **Cast/mirror-fed native backend** — a phone casts (AirPlay/Chromecast/
   Miracast, already-solved OS-native mechanisms) to a new native
   `IVideoInput` that receives the stream, feeding the same always-on
   pipeline as shape 1. Mobile never runs Aurora's own code in this shape,
   and never fights OS background-execution limits, since it never needs
   to run anything in the background at all.
5. **Full native stack on-device (mobile)** — genuinely mirrors shape 1 on
   a phone: capture (Android `MediaProjection`, iOS `ReplayKit`), process,
   and output (real UDP/DTLS is possible here — a native mobile app isn't
   sandboxed the way a browser tab is) all on-device. Not yet explored in
   any depth; the known obstacles (a foreground service + persistent
   notification on Android while capturing, a ~50MB memory ceiling for
   iOS's broadcast extension) are established, solved patterns other
   screen-recording apps already ship with, not open research questions —
   meaningfully more promising than the browser case, which hits a hard
   platform ceiling (no raw UDP API) that native mobile code doesn't have.
6. **Remote low-power capture device** — the concrete case the "double
   seam" argument above already named: Input runs on cheap/remote
   hardware, ships `Contracts`-shaped data to wherever Processing/Output
   actually live. The inverse seam placement from shape 2 (there, a thin
   client relays *to* Processing/Output; here, Input is the remote thin
   end).

The throughline worth naming explicitly: as more platforms get considered,
*more* of them land in the asymmetric client/relay bucket (shapes 2-4, 6),
not fewer — shape 1's "one self-hosted native brain" looks less like the
default case and more like a special case Windows/Linux happen to share.
That's a real, structural reason the one-seam-vs-double-seam question below
may not have one global answer at all — it may be a per-platform choice,
which argues for continuing to defer a single definitive network-shape
decision rather than generalizing from the two platforms built so far.

## Related docs

- `ModuleSplitPlan.md` — the Input/Processing/Output module boundaries this
  builds on.
- `OpenFormatsResearch.md` — the VJ/lighting protocol research the mapping
  above draws on.
- `RuntimeAnalysis.md` — `Orchestrator`'s current shape; the "accept a
  `Frame` from more than one kind of source" note above is a direct
  follow-up to it.
- `ImplementationPlan.md` — the WebSockets stretch goal this question
  actually needs resolving before.
- `BrowserAnalysis.md` — the decided Phase 3 demo strategy (shape 3 above),
  the Hue-API-throughput findings behind why the Entertainment API can't
  run in a browser, and the corrected GitHub Pages/Local Network Access
  finding behind shape 2's concrete example.
- `StackComparison.md` — the `ImageData` seam built so far, shown as real
  data flow across huenicorn and both current Aurora platforms rather than
  described in the abstract. Doesn't resolve the seam-count question above —
  it only shows what the one seam that exists today actually looks like.
