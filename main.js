import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { zoneMap } from './zonemap.js';
import { composeFrame } from './processing.js';
import { Smoother } from './smoother.js';

RectAreaLightUniformsLib.init(); // required once for RectAreaLight to shade correctly

const PLANE_WIDTH = 16;
const DEFAULT_PLANE_HEIGHT = 9; // used until the real video's aspect ratio is known
const BACKDROP_Z = -3;
const BACKDROP_MARGIN = 3.5; // extra room around the outermost lights so glow has space to spread
const SAMPLE_WIDTH = 160; // per-frame color-sampling resolution, not the video's playback resolution
const SMOOTHING = 0.85; // native's own default is 0 (no smoothing); tuned here for a calmer demo visual

// Three light rigs, selectable live (see the dropdown wiring below) rather than each
// replacing the last -- useful for comparing approaches, not just picking one forever.
const POINT_Z = 0; // sits on the frame's own edge, one light per zone
const POINT_INTENSITY = 2; // untested against a real render yet -- the first knob to retune by eye
const POINT_DISTANCE = 8;
const POINT_DECAY = 1; // lower than the physically-correct default (2) for a wider blend zone

const SPOT_Z = 0; // all 8 cluster here, at the frame's center, aimed outward per zone
const SPOT_INTENSITY = 30;
const SPOT_DISTANCE = 14; // reaches past the farthest target (a corner) with room to taper softly
const SPOT_ANGLE = THREE.MathUtils.degToRad(42);
const SPOT_PENUMBRA = 0.9;
const SPOT_DECAY = 1.25;

const RECTAREA_Z = 0; // sits on the frame's own edge, like the point rig
const RECTAREA_INTENSITY = 2; // untested -- RectAreaLight's units read very differently from point/spot
const RECTAREA_DEPTH = 0.8; // the light panel's thickness in its short axis
// Zones tiling the top/bottom thirds are wide+thin; the two side zones are tall+thin --
// see buildLightForRig's use of this below.
const HORIZONTAL_ZONE_IDS = new Set([0, 1, 2, 5, 6, 7]);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111318);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

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
let plane, gridLines, backdrop;
let zoneLights = [];
let showGrid = false; // off by default -- see the toggle button wiring below
let currentRigType = 'point';
let currentHalfW = PLANE_WIDTH / 2;
let currentHalfH = DEFAULT_PLANE_HEIGHT / 2;
let backdropHalfExtents = { w: 0, h: 0 };

const FIT_MARGIN = 1.15; // headroom beyond an exact fit, so the backdrop's edge isn't flush with the viewport

// Frames the camera so the full backdrop (and its light falloff) fits the viewport, instead
// of a fixed distance that leaves an arbitrary amount of dead space around it.
function fitCameraToBackdrop() {
  const vFov = THREE.MathUtils.degToRad(camera.fov / 2);
  const distanceForHeight = backdropHalfExtents.h / Math.tan(vFov);
  const distanceForWidth = backdropHalfExtents.w / (camera.aspect * Math.tan(vFov));
  camera.position.set(0, 0, BACKDROP_Z + Math.max(distanceForHeight, distanceForWidth) * FIT_MARGIN);
}

// One light per zone, positioned at that zone's edge/corner on the frame. Each rig aims
// straight back at the same (x, y) on the backdrop -- only the light type/shape differs.
function buildLightForRig(rig, zoneId, x, y) {
  switch (rig) {
    case 'spot': {
      const light = new THREE.SpotLight(0xffffff, SPOT_INTENSITY, SPOT_DISTANCE, SPOT_ANGLE, SPOT_PENUMBRA, SPOT_DECAY);
      light.position.set(0, 0, SPOT_Z);
      light.target.position.set(x, y, BACKDROP_Z);
      return light;
    }
    case 'rectArea': {
      const horizontal = HORIZONTAL_ZONE_IDS.has(zoneId);
      const width = horizontal ? (currentHalfW * 2) / 3 : RECTAREA_DEPTH;
      const height = horizontal ? RECTAREA_DEPTH : (currentHalfH * 2) / 3;
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
    if (light.target) scene.remove(light.target);
  }
  zoneLights = [];

  const positions = edgePositions();
  zoneLights = zoneMap.map((zone) => {
    const [x, y] = positions[zone.zoneId];
    const light = buildLightForRig(currentRigType, zone.zoneId, x, y);
    scene.add(light);
    if (light.target) scene.add(light.target);
    return { zoneId: zone.zoneId, light };
  });
}

function buildStaticScene(planeHeight) {
  for (const obj of [plane, gridLines, backdrop]) {
    if (!obj) continue;
    scene.remove(obj);
    obj.geometry?.dispose();
    obj.material?.dispose();
  }

  plane = new THREE.Mesh(
    new THREE.PlaneGeometry(PLANE_WIDTH, planeHeight),
    new THREE.MeshBasicMaterial({ map: videoTexture }),
  );
  scene.add(plane);

  // Thirds gridlines over the plane -- a pure visual explainer of the nine-slice zone
  // layout, hidden by default (see showGrid) so it doesn't sit on top of the video.
  const gridPoints = [];
  for (const f of [1 / 3, 2 / 3]) {
    gridPoints.push(
      new THREE.Vector3(-PLANE_WIDTH / 2 + f * PLANE_WIDTH, planeHeight / 2, 0.02),
      new THREE.Vector3(-PLANE_WIDTH / 2 + f * PLANE_WIDTH, -planeHeight / 2, 0.02),
      new THREE.Vector3(-PLANE_WIDTH / 2, planeHeight / 2 - f * planeHeight, 0.02),
      new THREE.Vector3(PLANE_WIDTH / 2, planeHeight / 2 - f * planeHeight, 0.02),
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

  // A light, diffuse backdrop behind the plane -- the actual light-spread visualization
  // (an "ambilight" wall glow). Light albedo so lit areas show true light color/brightness;
  // unlit areas still render dark since nothing (no ambient light) is illuminating them.
  backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry((currentHalfW + BACKDROP_MARGIN) * 2, (currentHalfH + BACKDROP_MARGIN) * 2),
    new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 1, metalness: 0 }),
  );
  backdrop.position.z = BACKDROP_Z;
  scene.add(backdrop);

  backdropHalfExtents = { w: currentHalfW + BACKDROP_MARGIN, h: currentHalfH + BACKDROP_MARGIN };
  fitCameraToBackdrop();

  buildLights();
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
  fitCameraToBackdrop(); // aspect changed, so the fit distance needs recomputing too
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const gridToggleButton = document.getElementById('toggle-grid');
gridToggleButton.addEventListener('click', () => {
  showGrid = !showGrid;
  gridLines.visible = showGrid;
  gridToggleButton.textContent = showGrid ? 'Hide zone grid' : 'Show zone grid';
});

document.getElementById('light-rig').addEventListener('change', (event) => {
  currentRigType = event.target.value;
  buildLights();
});
