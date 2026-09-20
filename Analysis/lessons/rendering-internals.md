# Rendering internals

This project's own 3D-scene design decisions and techniques (not a third-party library's own
API/behavior — see `rendering-apis.md` for those), each demonstrated via a real issue while
building `Aurora-Demo-Web`'s Three.js scenes. See [`README.md`](README.md) for routing rules.
Split out of `engineering-hygiene.md` alongside `rendering-apis.md`, mirroring RockyRoad's
`engine/xr-3d-rendering.md` vs. `engine/runtime-apis.md` split.

---

## Falloff shape and "stop at a fixed boundary" are two different jobs, and one mechanism usually can't do both
Tags: rendering, demo-web, falloff, lights
Applies-when: shaping light falloff with a hard boundary

Hit building `Aurora-Demo-Web`'s light rigs. A light's `distance`/
`decay` is a *radial* falloff from a point (or, for `RectAreaLight`, a
panel) — it can't natively respect an arbitrary rectangular boundary like a
backdrop's edge. Tuning one light's falloff to simultaneously (a) blend
smoothly with its neighbors and (b) never visibly spill past a fixed edge
was often mathematically impossible once neighbor spacing and edge distance
were both fixed by the scene's geometry: tightening for (b) broke (a), and
loosening for (a) broke (b).

**Fix:** decouple the two. Let lights blend as broadly as looks good
(large/no cutoff, gentle decay), and enforce the hard boundary separately —
here, via an alpha mask on the receiving material (a canvas-drawn
soft-edged rectangle as `alphaMap`, opaque over the content, transparent
past its edge) — independent of any light's own physics.

---

## Matching apparent size across two camera depths needs the depth *ratio*, not a flat world-space offset
Tags: rendering, demo-web, camera, scale
Applies-when: matching apparent size across camera depths

Hit in the same `Aurora-Demo-Web` work, sizing a backdrop plane sitting
behind a foreground video plane. A farther object needs to be **larger** in
real world units just to *look* the same size as a nearer one — perspective
apparent size is roughly `actualSize / distance`. Using the same flat
world-space margin at both depths made the backdrop look *smaller* than
intended, since its extra distance from the camera shrank its apparent size
faster than the margin grew it.

**Fix:** scale the farther object's real size by
`distanceToFarObject / distanceToNearObject` before applying any margin, so
the *apparent* padding comes out equal regardless of the actual depth gap.
Recompute this on any camera-distance change (e.g. a resize that affects a
fit-to-frame distance) — it's not a one-time constant.

---

## A texture's on-screen rotation direction from `texture.rotation` isn't safely derivable by reasoning through UV-space math — verify with one real render
Tags: rendering, demo-web, textures, verification
Applies-when: reasoning about texture rotation direction by hand

Mapping a video texture onto `TV_Room.glb`'s `TV_Screen` mesh needed a 90°
correction for the mesh's own UV unwrap. Reasoning through the sign by hand
(treating positive `Texture.rotation` as counterclockwise in an abstract
UV plane) predicted the wrong on-screen direction — applying it moved the
video's floor from the left edge to the top instead of the intended
bottom, the opposite of what the math suggested.

**Fix:** treat the sign as unknown until confirmed by one real render, not
something to get right analytically — expose it as a single named constant
and flip it once based on what's actually seen, rather than re-deriving
the math. Cheaper than reasoning correctly about a coordinate convention
(UV space vs. screen space vs. a separate `flipY` setting) that combines
multiple unverified assumptions at once.
