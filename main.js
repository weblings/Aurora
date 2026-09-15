import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { zoneMap } from './zonemap.js';
import { composeFrame } from './processing.js';
import { Smoother } from './smoother.js';

RectAreaLightUniformsLib.init(); // required once for RectAreaLight to shade correctly

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
const SAMPLE_WIDTH = 160; // per-frame color-sampling resolution, not the video's playback resolution
const SMOOTHING = 0.85; // native's own default is 0 (no smoothing); tuned here for a calmer demo visual

// Two light rigs, selectable live (see the dropdown wiring below) rather than one
// replacing the other -- useful for comparing approaches, not just picking one forever.
const POINT_Z = FRAME_Z; // sits on the frame's own edge, one light per zone
const POINT_INTENSITY = 25;
// Sized against inter-light spacing (adjacent centroids are ~3-5.33 apart, opposite/diagonal
// zones ~10+), not the backdrop edge (the mask owns that job) -- reaches immediate neighbors
// for a real blend, but stops far/opposite zones from washing every hue together into gray.
const POINT_DISTANCE = 6;
const POINT_DECAY = 2;

const RECTAREA_Z = FRAME_Z; // sits on the frame's own edge, like the point rig
const RECTAREA_INTENSITY = 5; // matches Three's own official RectAreaLight example's order of magnitude
const RECTAREA_DEPTH = 0.3; // the light panel's thickness in its short axis
// >1 so neighboring panels along the same edge overlap instead of just touching.
const RECTAREA_LENGTH_OVERLAP = 1;

// Each physical edge is divided into 3 equal, snugly-adjacent segments along its own length --
// not derived per-zone. Corner zones sit on two edges and get one light per edge (they
// naturally overlap right at the corner, which is fine); edge-mid zones get just one.
const RECTAREA_EDGES = [
  { zoneIds: [0, 1, 2], horizontal: true, fixedSign: 1 }, // top
  { zoneIds: [5, 6, 7], horizontal: true, fixedSign: -1 }, // bottom
  { zoneIds: [0, 3, 5], horizontal: false, fixedSign: -1 }, // left
  { zoneIds: [2, 4, 7], horizontal: false, fixedSign: 1 }, // right
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111318);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// LinearToneMapping instead of NoToneMapping -- NoToneMapping ignores toneMappingExposure
// entirely, which would silently break the exposure dial just added above.
renderer.toneMapping = THREE.LinearToneMapping;
renderer.toneMappingExposure = 1;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, FRAME_Z); // orbit pivots on the frame itself, not the world origin

const video = document.createElement('video');
video.src = 'assets/168273-838673780.webm';
video.muted = true;
video.loop = true;
video.playsInline = true;
video.autoplay = true;
video.style.display = 'none';
document.body.appendChild(video);

const videoTexture = new THREE.VideoTexture(video);
videoTexture.colorSpace = THREE.SRGBColorSpace;

// Deterministic source modes for verifying the per-zone data pipeline and the light rig's
// own behavior independent of real video content -- see the dropdown wiring below.
// 'rainbow' checks per-zone color identification; 'white' isolates the light rig's own
// falloff/brightness symmetry, since every zone samples the exact same input color.
let sourceMode = 'video';
const testPatterns = {}; // mode -> { imageData, texture }, built once below

// Same 3x3 layout as zonemap.js -- lets a pattern assign a value per grid cell directly.
const ZONE_ID_BY_ROW_COL = { '0,0': 0, '0,1': 1, '0,2': 2, '1,0': 3, '1,2': 4, '2,0': 5, '2,1': 6, '2,2': 7 };

function buildPatternCanvas(fillStyleForCell) {
  const height = Math.round(SAMPLE_WIDTH * 9 / 16);
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const cellW = SAMPLE_WIDTH / 3;
  const cellH = height / 3;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      ctx.fillStyle = fillStyleForCell(row, col);
      ctx.fillRect(col * cellW, row * cellH, cellW, cellH);
    }
  }
  const imageData = ctx.getImageData(0, 0, SAMPLE_WIDTH, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { imageData, texture };
}

// Each zone gets its own evenly-spaced rainbow hue (by zoneId) -- every one of the 8 lights
// is individually identifiable, not just by column; the unused center cell reads as neutral.
testPatterns.rainbow = buildPatternCanvas((row, col) => {
  const zoneId = ZONE_ID_BY_ROW_COL[`${row},${col}`];
  return zoneId === undefined ? '#202020' : `hsl(${zoneId * 45}, 100%, 50%)`;
});
testPatterns.white = buildPatternCanvas(() => '#ffffff');

// Rebuilt whenever the plane's real aspect ratio is known (see 'loadedmetadata' below),
// since a bundled/uploaded video isn't guaranteed to be exactly 16:9.
let plane, gridLines, backdrop, backdropOutline;
let zoneLights = [];
let showGrid = false; // off by default -- see the toggle button wiring below
let showBackdropBounds = true; // on by default while the backdrop's actual size is being tuned
let showRectDebugQuads = true; // RectAreaLight has no visible geometry of its own otherwise
let rectDebugQuads = [];
let currentRigType = 'rectArea'; // 'point' kept in code (buildPointLights below) but no longer offered in the dropdown
let roomModel = null; // THREE.Group, loaded once via GLTFLoader and reused across mode switches
let roomModelLoading = null;
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

// The center of the zone's own UV rect, in world space -- now that the mask (not the light's
// position) is what hugs the screen edge, the light can sit where it actually represents its
// own zone instead of pinned to a corner/edge point covering a much larger area.
function zoneCentroid(zone) {
  const centroidU = (zone.uvs.min[0] + zone.uvs.max[0]) / 2;
  const centroidV = (zone.uvs.min[1] + zone.uvs.max[1]) / 2;
  return [(centroidU - 0.5) * currentHalfW * 2, (0.5 - centroidV) * currentHalfH * 2];
}

function buildPointLights() {
  return zoneMap.map((zone) => {
    const [x, y] = zoneCentroid(zone);
    const light = new THREE.PointLight(0xffffff, POINT_INTENSITY, POINT_DISTANCE, POINT_DECAY);
    light.position.set(x, y, POINT_Z);
    return { zoneId: zone.zoneId, lights: [light] };
  });
}

// One RectAreaLight per edge-segment (see RECTAREA_EDGES) rather than per zone -- a corner
// zone accumulates a light from each edge it sits on.
function buildRectAreaLights() {
  const lightsByZoneId = new Map();

  for (const edge of RECTAREA_EDGES) {
    const edgeLength = edge.horizontal ? currentHalfW * 2 : currentHalfH * 2;
    const segmentLength = (edgeLength / 3) * RECTAREA_LENGTH_OVERLAP;
    const fixedCoord = edge.fixedSign * (edge.horizontal ? currentHalfH : currentHalfW);

    edge.zoneIds.forEach((zoneId, i) => {
      // zoneIds are listed low-x-to-high-x for horizontal edges, but top-to-bottom (i.e.
      // high-y-to-low-y) for vertical ones -- the two axes run opposite directions in world space.
      const thirdCenter = (i + 0.5) * (edgeLength / 3);
      const along = edge.horizontal ? -edgeLength / 2 + thirdCenter : edgeLength / 2 - thirdCenter;
      const x = edge.horizontal ? along : fixedCoord;
      const y = edge.horizontal ? fixedCoord : along;
      const width = edge.horizontal ? segmentLength : RECTAREA_DEPTH;
      const height = edge.horizontal ? RECTAREA_DEPTH : segmentLength;

      const light = new THREE.RectAreaLight(0xffffff, RECTAREA_INTENSITY, width, height);
      light.position.set(x, y, RECTAREA_Z);
      light.lookAt(x, y, BACKDROP_Z);

      if (!lightsByZoneId.has(zoneId)) lightsByZoneId.set(zoneId, []);
      lightsByZoneId.get(zoneId).push(light);
    });
  }

  return zoneMap.map((zone) => ({ zoneId: zone.zoneId, lights: lightsByZoneId.get(zone.zoneId) || [] }));
}

// Rebuilds just the lights for the currently selected rig -- swapping rigs (see the
// dropdown below) doesn't need to touch the plane/backdrop/gridlines at all.
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

  if (currentRigType === 'rectArea') zoneLights = buildRectAreaLights();
  // 'point' stays reachable in code (not the dropdown) for reference/comparison.
  else if (currentRigType === 'point') zoneLights = buildPointLights();
  else zoneLights = []; // 'room': not wired up yet -- the model has no light data to hook up to (see plan step 3)

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

// TV_Room.glb's own 4 KHR_lights_punctual lights ride along on gltf.scene as real PointLights --
// not driven by the output pipeline yet, see buildLights()'s 'room' branch.
const gltfLoader = new GLTFLoader();
const roomStatus = document.getElementById('room-status');

function setRoomStatus(text) {
  roomStatus.textContent = text;
  roomStatus.hidden = !text;
}

// Loads the model once and reuses it across mode switches -- toggling the dropdown back and
// forth shouldn't re-fetch/re-parse a multi-MB glb every time.
function ensureRoomModelLoaded() {
  if (!roomModelLoading) {
    setRoomStatus('Loading TV_Room.glb...');
    roomModelLoading = gltfLoader.loadAsync('assets/TV_Room.glb').then((gltf) => {
      roomModel = gltf.scene;
      roomModel.visible = false; // shown explicitly by the caller once ready
      scene.add(roomModel);
      setRoomStatus('');
    }).catch((error) => {
      console.error('Failed to load TV_Room.glb', error);
      setRoomStatus('Failed to load TV_Room.glb -- see console');
      roomModelLoading = null; // allow a retry on the next mode switch
    });
  }
  return roomModelLoading;
}

// Fits the camera to the model's actual bounding box -- the flat demo's FRAME_Z/fitCameraToFrame
// math assumes the arbitrary flat-scene scale, not the room's real (meter-scale) geometry.
function frameCameraToRoom() {
  if (!roomModel) return;
  const box = new THREE.Box3().setFromObject(roomModel);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) / 2;
  const vFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const distance = (radius / Math.tan(vFov)) * FIT_MARGIN;
  camera.position.set(center.x, center.y, center.z + distance);
  controls.target.copy(center);
}

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
    frameCameraToRoom();
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

// Real per-frame processing, replacing the scaffold's fake color driver.
const sampleCanvas = document.createElement('canvas');
const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });
const smoother = new Smoother();

function sampleVideoFrame() {
  if (sourceMode !== 'video') return testPatterns[sourceMode].imageData;
  if (video.readyState < video.HAVE_CURRENT_DATA || video.videoWidth === 0) return null;

  const sampleHeight = Math.round(SAMPLE_WIDTH * (video.videoHeight / video.videoWidth));
  if (sampleCanvas.width !== SAMPLE_WIDTH || sampleCanvas.height !== sampleHeight) {
    sampleCanvas.width = SAMPLE_WIDTH;
    sampleCanvas.height = sampleHeight;
  }
  // drawImage's own scaling stands in for the native pipeline's separate rescale() step.
  sampleCtx.drawImage(video, 0, 0, SAMPLE_WIDTH, sampleHeight);
  return sampleCtx.getImageData(0, 0, SAMPLE_WIDTH, sampleHeight);
}

function animate() {
  const imageData = sampleVideoFrame();
  if (imageData) {
    const frame = smoother.smooth(composeFrame(imageData, zoneMap), SMOOTHING);
    for (const zoneFrame of frame) {
      const target = zoneLights.find((z) => z.zoneId === zoneFrame.zoneId);
      if (!target) continue;
      for (const light of target.lights) {
        light.color.setRGB(zoneFrame.color.r / 255, zoneFrame.color.g / 255, zoneFrame.color.b / 255);
      }
    }
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  if (currentRigType === 'room') {
    frameCameraToRoom(); // no-op until the model's loaded; harmless
  } else {
    fitCameraToFrame(); // aspect changed, so the fit distance needs recomputing too
    rebuildBackdrop(); // its perspective-corrected size depends on that same fit distance
  }
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

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

document.getElementById('light-rig').addEventListener('change', (event) => {
  currentRigType = event.target.value;
  buildLights();

  const isRoom = currentRigType === 'room';
  setFlatSceneVisible(!isRoom);

  if (isRoom) {
    ensureRoomModelLoaded()?.then(() => {
      if (currentRigType !== 'room' || !roomModel) return; // switched away (or load failed) while loading
      roomModel.visible = true;
      frameCameraToRoom();
    });
  } else if (roomModel) {
    roomModel.visible = false;
    fitCameraToFrame();
    controls.target.set(0, 0, FRAME_Z);
  }
});

document.getElementById('source-mode').addEventListener('change', (event) => {
  sourceMode = event.target.value;
  plane.material.map = sourceMode === 'video' ? videoTexture : testPatterns[sourceMode].texture;
  plane.material.needsUpdate = true;
});
