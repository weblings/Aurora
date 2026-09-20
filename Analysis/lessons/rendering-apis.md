# Rendering APIs

Third-party facts about Three.js/GLTFLoader/Blender's glTF export — not this project's own
design choices, but real API/tool behavior that constrains how code against them must be
written. See [`README.md`](README.md) for how entries get routed here vs. `rendering-internals.md`.
Split out of `engineering-hygiene.md` once this project's own Three.js/glTF cluster reached 7
entries, following the same own-internals/third-party-facts split as RockyRoad's
`runtime-apis` lesson.

---

## A light type's constructor parameters are the whole contract — don't assume it mirrors a sibling type's API shape
Tags: rendering, threejs, lights, api
Applies-when: constructing Three.js light types by analogy

Hit in `Aurora-Demo-Web` while building the Three.js browser demo's light
rigs. `PointLight`/`SpotLight` expose `distance` (a hard cutoff) and `decay`
(the falloff curve) as independent parameters. `RectAreaLight`'s constructor
only takes `(color, intensity, width, height)` — no `distance`, no `decay`.
Its brightness at any point is governed entirely by the panel's physical
size and position via solid-angle math, so tuning size to change spread
also changes brightness, and vice versa. Several rounds of intensity/depth
tuning felt inconsistent until this was recognized as a structural property
of the light type, not a wrong number — cost real time because the
assumption (same knobs as `PointLight`, just a different shape) was never
checked against the actual constructor signature or docs first.

**Fix:** check what parameters a light/material/shader type actually
exposes before assuming it mirrors a sibling type's API shape, same weight
as checking a native library's header. If a hard spatial cutoff is required
and the light type has no such knob, get it from somewhere else entirely
(a mask on the receiving material, a custom shader) rather than continuing
to fight the light's own parameters.

---

## Blender's glTF exporter drops light data by default, and Area lights never export at all
Tags: rendering, blender, gltf, lights
Applies-when: exporting lights from Blender to glTF

Hit importing `TV_Room.glb` into `Aurora-Demo-Web`'s Three.js scene. The
first export had zero `KHR_lights_punctual` data despite the Blender scene
having real lamps — the exporter's "Punctual Lights" checkbox (Export
panel's Include section) is off by default, so no light data is written
regardless of scene content. Separately, even with it enabled, only
Point/Sun/Spot lights map to glTF's punctual-light types; Area lights have
no glTF equivalent and are silently dropped, no export warning either way.

**Fix:** enable "Punctual Lights" on export, and convert any Area lights to
Point/Spot in Blender first if their data needs to survive the round-trip.
Confirmed against the actual re-exported file (`KHR_lights_punctual`
present, 4 real `type: "point"` entries), not assumed from docs alone.

---

## A glTF material is shared by reference across every mesh that uses it — clone before giving one instance independent state
Tags: rendering, gltf, materials, threejs
Applies-when: giving one glTF mesh independent material state

`TV_Room.glb`'s `LampShade` and `BlocksGem` materials are each a single
glTF material entry referenced by all 4 lamp meshes (confirmed in the raw
JSON: one material index, 4 different mesh primitives pointing at it).
GLTFLoader honors that sharing exactly — one `THREE.Material` instance,
assigned by reference to all 4 meshes. Setting `.color`/`.emissive`
directly on one mesh's material would have overwritten it for all 4 lamps
at once, defeating the point of tinting each lamp from its own nearby
light independently.

**Fix:** `mesh.material = mesh.material.clone();` per mesh before mutating
anything, then pair each now-independent clone with whichever real scene
object should drive it (here: nearest point light by distance). Worth
checking on any per-instance customization of an imported multi-instance
asset, not just lights.

---

## glTF's `alphaMode: BLEND` sets more than `transparent` — undoing only the visible property leaves a material opaque-colored but still see-through
Tags: rendering, gltf, materials, transparency
Applies-when: reverting BLEND transparency on a glTF material

Cloning `TV_Room.glb`'s `LampShade` material (glTF `alphaMode: BLEND`) and
setting `transparent = false; opacity = 1;` to make it opaque still
rendered as see-through — nearer opaque panels didn't occlude farther ones
inside the same lamp. Three's own `GLTFLoader.js` source showed why: for
`BLEND` materials it sets *both* `materialParams.transparent = true` and
`materialParams.depthWrite = false`. The clone carried both forward;
resetting only the one visibly about transparency left `depthWrite` still
false, so the object's own fragments never wrote into the depth buffer and
didn't properly occlude geometry drawn behind it.

**Fix:** `mesh.material.depthWrite = true;` alongside `transparent = false`.
General principle: an imported/library-set rendering mode can bundle
multiple related property changes together — reverting the one property
that visibly matches the symptom doesn't guarantee the others are reverted
too; check the actual code path that set the mode, not just its name.
