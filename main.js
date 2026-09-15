import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
const SAMPLE_WIDTH = 160; // per-frame color-sampling resolution, not the video's playback resolution
const SMOOTHING = 0.85; // native's own default is 0 (no smoothing); tuned here for a calmer demo visual

// Two light rigs, selectable live (see the dropdown wiring below) rather than one
// replacing the other -- useful for comparing approaches, not just picking one forever.
const POINT_Z = FRAME_Z; // sits on the frame's own edge, one light per zone
const POINT_INTENSITY = 25;
// No cutoff (0 = unbounded) and gentle decay -- the edge mask on the backdrop now enforces
// "stops before the edge", so the light itself is free to blend broadly into its neighbors.
const POINT_DISTANCE = 0;
const POINT_DECAY = 1;

const RECTAREA_Z = FRAME_Z; // sits on the frame's own edge, like the point rig
const RECTAREA_INTENSITY = 5; // matches Three's own official RectAreaLight example's order of magnitude
const RECTAREA_DEPTH = 0.3; // the light panel's thickness in its short axis
// >1 so neighboring panels' long axes overlap instead of leaving a gap between zones.
const RECTAREA_LENGTH_OVERLAP = 1.75;
// Zones tiling the top/bottom thirds are wide+thin; the two side zones are tall+thin --
// see buildLightForRig's use of this below.
const HORIZONTAL_ZONE_IDS = new Set([0, 1, 2, 5, 6, 7]);

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

// Rebuilt whenever the plane's real aspect ratio is known (see 'loadedmetadata' below),
// since a bundled/uploaded video isn't guaranteed to be exactly 16:9.
let plane, gridLines, backdrop, backdropOutline;
let zoneLights = [];
let showGrid = false; // off by default -- see the toggle button wiring below
let showBackdropBounds = true; // on by default while the backdrop's actual size is being tuned
let currentRigType = 'point';
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

// One light per zone, positioned at that zone's edge/corner on the frame. Each rig aims
// straight back at the same (x, y) on the backdrop -- only the light type/shape differs.
function buildLightForRig(rig, zoneId, x, y) {
  switch (rig) {
    case 'rectArea': {
      const horizontal = HORIZONTAL_ZONE_IDS.has(zoneId);
      const width = horizontal ? ((currentHalfW * 2) / 3) * RECTAREA_LENGTH_OVERLAP : RECTAREA_DEPTH;
      const height = horizontal ? RECTAREA_DEPTH : ((currentHalfH * 2) / 3) * RECTAREA_LENGTH_OVERLAP;
      const light = new THREE.RectAreaLight(0xffffff, RECTAREA_INTENSITY, width, height);
      light.position.set(x, y, RECTAREA_Z);
      light.lookAt(x, y, BACKDROP_Z);
      return light;
    }
    case 'point':
    default: {
      const light = new THREE.PointLight(0xffffff, POINT_INTENSITY, POINT_DISTANCE, POINT_DECAY);
      light.position.set(x, y, POINT_Z);
      return light;
    }
  }
}

function edgePositions() {
  const halfW = currentHalfW;
  const halfH = currentHalfH;
  return {
    0: [-halfW, halfH], 1: [0, halfH], 2: [halfW, halfH],
    3: [-halfW, 0], 4: [halfW, 0],
    5: [-halfW, -halfH], 6: [0, -halfH], 7: [halfW, -halfH],
  };
}

// Rebuilds just the lights for the currently selected rig -- swapping rigs (see the
// dropdown below) doesn't need to touch the plane/backdrop/gridlines at all.
function buildLights() {
  for (const { light } of zoneLights) {
    scene.remove(light);
  }
  zoneLights = [];

  const positions = edgePositions();
  zoneLights = zoneMap.map((zone) => {
    const [x, y] = positions[zone.zoneId];
    const light = buildLightForRig(currentRigType, zone.zoneId, x, y);
    scene.add(light);
    return { zoneId: zone.zoneId, light };
  });
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
    new THREE.MeshBasicMaterial({ map: videoTexture }),
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
  ctx.filter = `blur(${Math.round(Math.min(insetX, insetY) * 0.6)}px)`;
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
      target.light.color.setRGB(zoneFrame.color.r / 255, zoneFrame.color.g / 255, zoneFrame.color.b / 255);
    }
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  fitCameraToFrame(); // aspect changed, so the fit distance needs recomputing too
  rebuildBackdrop(); // its perspective-corrected size depends on that same fit distance
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

document.getElementById('light-rig').addEventListener('change', (event) => {
  currentRigType = event.target.value;
  buildLights();
});
