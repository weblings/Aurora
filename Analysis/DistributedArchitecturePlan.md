# Distributed architecture — how far to decompose Input/Processing/Output over a network

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

- A VJ app's live output (NDI/Syphon/Spout) is just **another `IInput`** —
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
`IInput`, or handed directly by an authored-track/VJ bridge), not assume
every `Frame` originates from a crop step. This is true regardless of
which seam-count answer wins above.

## What this means for today's work

Nothing changes for `Aurora-App-Linux` — a single local process, no
network code yet. Nothing in `IInput`/`IOutput`/`Orchestrator`'s current
shape commits to either seam count: they're already clean interfaces, not
things wired together in a way that would need undoing. The registry/
config-driven plugin-selection work (see the "app" repo discussion) is
orthogonal to seam count too — it's about *which* plugins run, not how
many network hops separate them.

The one concrete principle worth carrying forward while building: don't
bake in an assumption that a `Frame` always comes from `composeFrame`.
Keeping that entry point open is cheap now and expensive to retrofit later,
regardless of how the seam-count question eventually resolves.

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
