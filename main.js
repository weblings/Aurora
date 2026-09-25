import * as THREE from 'three';
import { createSceneCore } from './scene-core.js';
// RectAreaLightUniformsLib.init() moved to rectarea-rig.js (runs on import there).
import { buildPointLights } from './point-rig.js';
import { buildRectAreaLights } from './rectarea-rig.js';
import { ROOM_ZONE_MAP, createRoomRig } from './room-rig.js';
export { ROOM_ZONE_MAP };
import { zoneMap } from './zonemap.js';
import { getDemoStore } from './demo-state.js';
import { configToPipeline } from './demo-tuning.js';

// Live zone view (Phase 3): the shim owns zone state once demo-boot runs;
// per-frame and rebuild reads go through it so PUTs apply live. Falls back
// to the static zonemap (flat-rig data) when the boot module is absent.
function demoZones() {
  return getDemoStore()?.liveZones() ?? zoneMap;
}

// Room-path equivalent: the rig's 4 quadrant zones, live from the shim once
// booted (seeded from ROOM_ZONE_MAP), static fallback for bare-scene use.
function roomZones() {
  return getDemoStore()?.liveZones() ?? ROOM_ZONE_MAP;
}
import {
  video, videoTexture, testPatterns, getTvScreenTexture, invalidateScreenTexture,
  loadImagePattern, setSampleWidth, setSmoothing, sampleFrame as sampleVideoFrame,
} from './video-source.js';
import {
  setColorModel, applyAudioTuning, setPlaying, sampleFrame as sampleAudioFrame,
} from './audio-source.js';

const PLANE_WIDTH = 16;
const DEFAULT_PLANE_HEIGHT = 9; // used until the real video's aspect ratio is known
const FRAME_Z = -8; // pushes the video+lights+backdrop back from the camera/origin as a group
// Real standoff distance, not near-zero -- Three's own RectAreaLight example keeps its
// lights 6 units from the surface; 1.5 stays safely under the perspective-bug threshold.
const BACKDROP_Z = FRAME_Z - 1.5;
// Additive, same units on all four sides -- a uniform-width ring around the video, at the
// cost of the backdrop's own aspect ratio no longer matching the video's (same as a picture mat).
const BACKDROP_MARGIN = 1.3 * (2 / 3); // lowered by a third
// Fraction of the margin's own width used as the mask's blur radius -- higher = softer/more
// gradual fade, lower = sharper edge. 1.0 would blur across the entire margin band.
const MASK_FEATHER = 0.45;
// Sample width + smoothing live in video-source.js (setSampleWidth /
// setSmoothing); tuned live via applyLiveTuning below.
// native default is 0, so a default config un-smooths this (parity, not regression -- see tuning-ledger.md)

// Rig tuning lives with its rig module now (point-rig.js, rectarea-rig.js,
// room-rig.js); the flat rigs' shared frame constants stay here.
// Two light rigs, selectable live (see the dropdown wiring below) rather than one
// replacing the other -- useful for comparing approaches, not just picking one forever.
// Sized against inter-light spacing (adjacent centroids are ~3-5.33 apart, opposite/diagonal
// zones ~10+), not the backdrop edge (the mask owns that job) -- reaches immediate neighbors
// for a real blend, but stops far/opposite zones from washing every hue together into gray.
const POINT_OPTS = () => ({ halfW: currentHalfW, halfH: currentHalfH, pointZ: FRAME_Z, intensity: 25, distance: 6, decay: 2 });
const RECTAREA_OPTS = () => ({
  halfW: currentHalfW, halfH: currentHalfH, rectZ: FRAME_Z, backdropZ: BACKDROP_Z,
  intensity: 5, depth: 0.3, lengthOverlap: 1,
});

// gj0.5 slice 1: scene/renderer/camera/controls live in scene-core.js so the
// viz.html standalone page can share them; same names, same behavior.
const { scene, camera, renderer, controls, scenePane, scenePaneSize, applySpawnPose } =
  createSceneCore({ frameZ: FRAME_Z });

// Video element/texture live in video-source.js; audio element/graph/state in
// audio-source.js. What stays here is page wiring (metadata rebuilds, autoplay
// fallback) further below.

// Audio color models, analyser graph, and playback live in audio-source.js;
// the render loop below consumes them through sampleAudioFrame().

// Read from the DOM, not hardcoded -- browsers restore a <select>'s displayed value across a
// reload on their own, independent of any JS/HTML default; reading it back keeps state in sync
// with what's actually shown instead of needing a manual re-click to take effect.
const lightRigSelect = document.getElementById('light-rig');
const sourceModeSelect = document.getElementById('source-mode');
const audioColorModelSelect = document.getElementById('audio-color-model');
setColorModel(audioColorModelSelect.value); // 'placeholder' | 'ported' | 'tuned' | 'midpoint' | 'attack' (see audio-source.js)

// Test patterns (rainbow/white/audio placeholder) live in video-source.js;
// this only swaps in the real jpg once loaded.
let sourceMode = sourceModeSelect ? sourceModeSelect.value : 'video';
loadImagePattern('assets/ElectricCabello.jpg').then((pattern) => {
  testPatterns.audio = pattern;
  invalidateScreenTexture('audio'); // the cached clone (if any) still points at the placeholder
  if (sourceMode !== 'audio') return;
  plane.material.map = pattern.texture;
  plane.material.needsUpdate = true;
  if (roomRig.tvScreenMesh) {
    roomRig.tvScreenMesh.material.map = getTvScreenTexture('audio');
    roomRig.tvScreenMesh.material.needsUpdate = true;
  }
}).catch((error) => console.error('Failed to load ElectricCabello.jpg', error));

// Rebuilt whenever the plane's real aspect ratio is known (see 'loadedmetadata' below),
// since a bundled/uploaded video isn't guaranteed to be exactly 16:9.
let plane, gridLines, backdrop, backdropOutline;
let zoneLights = [];
let showGrid = false; // off by default -- see the toggle button wiring below
let showBackdropBounds = true; // on by default while the backdrop's actual size is being tuned
let showRectDebugQuads = true; // RectAreaLight has no visible geometry of its own otherwise
let rectDebugQuads = [];
let currentRigType = lightRigSelect.value; // 'point' kept in code (point-rig.js) but no longer offered in the dropdown
// Room-model state (model, zone lights, shades, TV node) lives in room-rig.js;
// main.js reaches it through roomRig (created further below, after getTvScreenTexture).
let currentHalfW = PLANE_WIDTH / 2;
let currentHalfH = DEFAULT_PLANE_HEIGHT / 2;

// How far the camera frames out from the video itself -- a viewing choice, independent of
// BACKDROP_MARGIN (which is about how much room the light needs, not what the camera shows).
const VIEW_PADDING = 2;
let viewHalfExtents = { w: 0, h: 0 };

const FIT_MARGIN = 1; // headroom beyond an exact fit, so the frame's edge isn't flush with the viewport

// Frames the camera to the video plane plus VIEW_PADDING -- not to the backdrop, which can
// (and does) extend further out to give the lights room to fall off outside the visible frame.
function fitCameraToFrame() {
  const vFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const distanceForHeight = viewHalfExtents.h / Math.tan(vFov);
  const distanceForWidth = viewHalfExtents.w / (camera.aspect * Math.tan(vFov));
  camera.position.set(0, 0, FRAME_Z + Math.max(distanceForHeight, distanceForWidth) * FIT_MARGIN);
}

// Rebuilds just the lights for the currently selected rig -- swapping rigs (see the
// dropdown below) doesn't need to touch the plane/backdrop/gridlines at all.
// Builders live in point-rig.js / rectarea-rig.js / room-rig.js; this only dispatches.
function buildLights() {
  for (const { lights } of zoneLights) {
    for (const light of lights) scene.remove(light);
  }

  for (const quad of rectDebugQuads) {
    scene.remove(quad);
    quad.geometry.dispose();
    quad.material.dispose();
  }
  rectDebugQuads = [];

  if (currentRigType === 'rectArea') zoneLights = buildRectAreaLights(demoZones(), RECTAREA_OPTS());
  // 'point' stays reachable in code (not the dropdown) for reference/comparison.
  else if (currentRigType === 'point') zoneLights = buildPointLights(demoZones(), POINT_OPTS());
  else {
    // 'room': lights already live inside roomModel's own hierarchy (visibility follows the
    // model, not scene.add() below) -- reparenting them here would break that.
    zoneLights = roomRig.zoneLights;
    return;
  }

  for (const { lights } of zoneLights) {
    for (const light of lights) {
      scene.add(light);

      // RectAreaLight has no visible geometry of its own -- this wireframe traces its actual
      // position/size/orientation exactly, so it's directly inspectable rather than inferred.
      if (light.isRectAreaLight) {
        const quad = new THREE.Mesh(
          new THREE.PlaneGeometry(light.width, light.height),
          new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, side: THREE.DoubleSide }),
        );
        quad.position.copy(light.position);
        quad.quaternion.copy(light.quaternion);
        quad.visible = showRectDebugQuads;
        scene.add(quad);
        rectDebugQuads.push(quad);
      }
    }
  }
}

// Demo port entry (Phase 3): re-invoke the existing rebuild path after a
// zone PUT lands in the shim (wired via onZonesChanged in demo-boot.js).
export function rebuildZoneLights() {
  buildLights();
}

// Room model loading, zone assignment, and shade tinting live in
// room-rig.js; TV-screen textures live in video-source.js (imported above).
// The room rig owns the model and everything derived from it; the TV
// texture stays source-driven (video vs test pattern) via this closure.
const roomRig = createRoomRig({
  scene, camera, controls, fitMargin: FIT_MARGIN,
  getScreenTexture: () => getTvScreenTexture(sourceMode),
});

// Hides/shows the flat video+backdrop scene as a group, respecting the grid/bounds toggles'
// own on/off state rather than forcing them on whenever the flat scene becomes visible again.
function setFlatSceneVisible(visible) {
  if (plane) plane.visible = visible;
  if (gridLines) gridLines.visible = visible && showGrid;
  if (backdrop) backdrop.visible = visible;
  if (backdropOutline) backdropOutline.visible = visible && showBackdropBounds;
}

function buildStaticScene(planeHeight) {
  for (const obj of [plane, gridLines]) {
    if (!obj) continue;
    scene.remove(obj);
    obj.geometry?.dispose();
    obj.material?.dispose();
  }

  plane = new THREE.Mesh(
    new THREE.PlaneGeometry(PLANE_WIDTH, planeHeight),
    new THREE.MeshBasicMaterial({ map: sourceMode === 'video' ? videoTexture : testPatterns[sourceMode].texture }),
  );
  plane.position.z = FRAME_Z;
  scene.add(plane);

  // Thirds gridlines over the plane -- a pure visual explainer of the nine-slice zone
  // layout, hidden by default (see showGrid) so it doesn't sit on top of the video.
  const gridZ = FRAME_Z + 0.02; // just in front of the plane, avoids z-fighting
  const gridPoints = [];
  for (const f of [1 / 3, 2 / 3]) {
    gridPoints.push(
      new THREE.Vector3(-PLANE_WIDTH / 2 + f * PLANE_WIDTH, planeHeight / 2, gridZ),
      new THREE.Vector3(-PLANE_WIDTH / 2 + f * PLANE_WIDTH, -planeHeight / 2, gridZ),
      new THREE.Vector3(-PLANE_WIDTH / 2, planeHeight / 2 - f * planeHeight, gridZ),
      new THREE.Vector3(PLANE_WIDTH / 2, planeHeight / 2 - f * planeHeight, gridZ),
    );
  }
  gridLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(gridPoints),
    new THREE.LineBasicMaterial({ color: 0x4af0ff }),
  );
  gridLines.visible = showGrid;
  scene.add(gridLines);

  currentHalfW = PLANE_WIDTH / 2;
  currentHalfH = planeHeight / 2;

  // Camera must be positioned before sizing the backdrop, which corrects for its distance.
  viewHalfExtents = { w: currentHalfW + VIEW_PADDING, h: currentHalfH + VIEW_PADDING };
  fitCameraToFrame();
  rebuildBackdrop();

  buildLights();

  // A late video-metadata rebuild can land after the user's already switched to room mode --
  // undo the flat-camera move and re-hide the flat scene this function just did.
  if (currentRigType === 'room') {
    setFlatSceneVisible(false);
    roomRig.frameCameraToRoom();
  }
}

// Opaque over the video's own footprint, feathering to transparent at the backdrop's true
// edge -- enforces "fades before the edge" independent of any light's own falloff.
function buildEdgeMaskTexture(insetXFraction, insetYFraction) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const insetX = size * insetXFraction;
  const insetY = size * insetYFraction;
  ctx.filter = `blur(${Math.round(Math.min(insetX, insetY) * MASK_FEATHER)}px)`;
  ctx.fillStyle = '#fff';
  ctx.fillRect(insetX, insetY, size - insetX * 2, size - insetY * 2);
  return new THREE.CanvasTexture(canvas);
}

// BACKDROP_MARGIN is specified as if the backdrop sat at the frame's own depth. Since it
// actually sits BACKDROP_Z further back, its real size is scaled by the ratio of the two
// camera distances so the *apparent* (on-screen) padding comes out the same either way.
// Depends on the camera's current fit distance, so it's re-run on resize, not just on build.
function rebuildBackdrop() {
  for (const obj of [backdrop, backdropOutline]) {
    if (!obj) continue;
    scene.remove(obj);
    obj.geometry?.dispose();
    obj.material?.alphaMap?.dispose();
    obj.material?.dispose();
  }

  const distanceToFrame = camera.position.z - FRAME_Z;
  const distanceToBackdrop = camera.position.z - BACKDROP_Z;
  const perspectiveScale = distanceToBackdrop / distanceToFrame;

  const fullWidth = currentHalfW * 2 + BACKDROP_MARGIN * 2;
  const fullHeight = currentHalfH * 2 + BACKDROP_MARGIN * 2;
  const edgeMask = buildEdgeMaskTexture(BACKDROP_MARGIN / fullWidth, BACKDROP_MARGIN / fullHeight);

  // Additive + no depth-write: unlit areas contribute nothing (ready for AR passthrough),
  // lit areas add color on top -- this is the actual illusion mechanism, not a stand-in.
  backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(fullWidth * perspectiveScale, fullHeight * perspectiveScale),
    new THREE.MeshStandardMaterial({
      color: 0xe8e8e8, roughness: 1, metalness: 0, alphaMap: edgeMask,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  backdrop.position.z = BACKDROP_Z;
  scene.add(backdrop);

  // The backdrop is additive/invisible where unlit, so its own edge has no visible marker --
  // this outline exists purely so its real size is directly perceivable while tuning.
  backdropOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(backdrop.geometry),
    new THREE.LineBasicMaterial({ color: 0xff5050 }),
  );
  backdropOutline.position.z = BACKDROP_Z;
  backdropOutline.visible = showBackdropBounds;
  scene.add(backdropOutline);
}

buildStaticScene(DEFAULT_PLANE_HEIGHT);

video.addEventListener('loadedmetadata', () => {
  buildStaticScene(PLANE_WIDTH / (video.videoWidth / video.videoHeight));
});

video.play().catch(() => {
  // Muted autoplay is blocked in rare cases (e.g. certain embedded contexts) -- fall
  // back to starting on the first click rather than leaving the plane frozen.
  document.body.addEventListener('click', () => video.play(), { once: true });
});

// Orchestrator (gj0.5 slice 3): the render loop consumes color-provider
// implementations and applies their frames to the rig targets. Contract --
// sampleFrame() returns [{zoneId, color:{r,g,b} 0..1}] or null (no data this
// frame). Video takes (zones, mode); audio takes ({zones, targets}); the
// 'live' SSE provider (gj0.6) will be a third implementation, additive.
function applyFrameToTargets(frame, zones) {
  const frameById = new Map(zones.map((z) => [z.zoneId, z]));
  const updated = new Set();
  for (const zoneFrame of frame) {
    const target = zoneLights.find((z) => z.zoneId === zoneFrame.zoneId);
    if (!target) continue;
    updated.add(zoneFrame.zoneId);
    for (const light of target.lights) {
      light.color.setRGB(zoneFrame.color.r, zoneFrame.color.g, zoneFrame.color.b);
    }
  }
  // Demo deviation, same as before: inactive zones go dark instead of
  // holding, so the toggle reads as on/off in the scene.
  for (const { zoneId, lights } of zoneLights) {
    if (updated.has(zoneId)) continue;
    if (frameById.get(zoneId)?.active === false) {
      for (const light of lights) light.color.setRGB(0, 0, 0);
    }
  }
}

function animate() {
  if (sourceMode === 'audio') {
    // Room mode drives its 4 quadrant zones live from the shim (same array
    // the Dashboard edits), not the flat rigs' 8-zone zonemap.js.
    const zones = roomZones();
    applyFrameToTargets(sampleAudioFrame({ zones, targets: zoneLights }), zones);
  } else {
    const activeZoneMap = currentRigType === 'room' ? roomZones() : demoZones();
    const frame = sampleVideoFrame(activeZoneMap, sourceMode);
    if (frame) applyFrameToTargets(frame, activeZoneMap);
  }

  roomRig.syncLampShades();

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

new ResizeObserver(() => {
  const { width, height } = scenePaneSize();
  camera.aspect = width / height;
  if (currentRigType === 'room') {
    roomRig.frameCameraToRoom(); // no-op until the model's loaded; harmless
    if (roomRig.model) applySpawnPose();
  } else {
    fitCameraToFrame(); // aspect changed, so the fit distance needs recomputing too
    rebuildBackdrop(); // its perspective-corrected size depends on that same fit distance
  }
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}).observe(scenePane);

const gridToggleButton = document.getElementById('toggle-grid');
gridToggleButton.addEventListener('click', () => {
  showGrid = !showGrid;
  gridLines.visible = showGrid;
  gridToggleButton.textContent = showGrid ? 'Hide zone grid' : 'Show zone grid';
});

const boundsToggleButton = document.getElementById('toggle-backdrop-bounds');
boundsToggleButton.addEventListener('click', () => {
  showBackdropBounds = !showBackdropBounds;
  backdropOutline.visible = showBackdropBounds;
  boundsToggleButton.textContent = showBackdropBounds ? 'Hide backdrop bounds' : 'Show backdrop bounds';
});

const rectDebugToggleButton = document.getElementById('toggle-rect-debug');
rectDebugToggleButton.addEventListener('click', () => {
  showRectDebugQuads = !showRectDebugQuads;
  for (const quad of rectDebugQuads) quad.visible = showRectDebugQuads;
  rectDebugToggleButton.textContent = showRectDebugQuads ? 'Hide rect-light quads' : 'Show rect-light quads';
});

// Shared by the change listener and the startup call below -- a page load that lands on
// 'room' (browser-restored dropdown) needs the same load/show/camera work a real switch does.
function activateLightRig(newType) {
  currentRigType = newType;
  buildLights();

  const isRoom = currentRigType === 'room';
  setFlatSceneVisible(!isRoom);

  if (isRoom) {
    roomRig.ensureRoomModelLoaded()?.then(() => {
      if (currentRigType !== 'room' || !roomRig.model) return; // switched away (or load failed) while loading
      roomRig.model.visible = true;
      roomRig.frameCameraToRoom();
      buildLights(); // roomZoneLights is populated now; the earlier synchronous call ran before it was
      applySpawnPose();
    });
  } else if (roomRig.model) {
    roomRig.model.visible = false;
    fitCameraToFrame();
    controls.target.set(0, 0, FRAME_Z);
  }
}
lightRigSelect.addEventListener('change', (event) => activateLightRig(event.target.value));
activateLightRig(currentRigType); // in case the browser restored 'room' on reload, not just the label

// Phase 4: extracted from the source-mode dropdown listener so the Dashboard
// Audio/Video toggle drives the same path. Null-safe for after the dropdown's
// own removal (Phase 4) -- the toggle is the only selector then.
function setSourceMode(mode) {
  sourceMode = mode;
  plane.material.map = sourceMode === 'video' ? videoTexture : testPatterns[sourceMode].texture;
  plane.material.needsUpdate = true;
  if (roomRig.tvScreenMesh) {
    roomRig.tvScreenMesh.material.map = getTvScreenTexture(sourceMode);
    roomRig.tvScreenMesh.material.needsUpdate = true;
  }
  setPlaying(sourceMode === 'audio', () => sourceMode === 'audio');
  if (sourceModeSelect) sourceModeSelect.value = mode;
}
if (sourceModeSelect) {
  sourceModeSelect.addEventListener('change', (event) => setSourceMode(event.target.value));
}

// Phase 4 live-apply entry, wired to the shim's onConfigPatch hook in
// demo-boot.js (+ one initial call there). Audio lands in place on the live
// midpoint object (state persists across edits, as natively); smoothing,
// sample width and mode land on the running scene.
export function applyLiveTuning(config) {
  const mapped = configToPipeline(config);
  applyAudioTuning(mapped.audio);
  setSmoothing(mapped.transitionSmoothing);
  if (mapped.sampleWidth !== null) setSampleWidth(mapped.sampleWidth);
  setSourceMode(mapped.mode);
}
setPlaying(sourceMode === 'audio', () => sourceMode === 'audio'); // in case the browser restored 'audio' on reload

audioColorModelSelect.addEventListener('change', (event) => { setColorModel(event.target.value); });
