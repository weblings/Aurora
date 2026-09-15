import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { zoneMap } from './zonemap.js';
import { composeFrame } from './processing.js';
import { Smoother } from './smoother.js';

const PLANE_WIDTH = 16;
const DEFAULT_PLANE_HEIGHT = 9; // used until the real video's aspect ratio is known
const LIGHT_Z = 0; // exactly on the frame's plane, so the glow reads as emitting from its edge
const BACKDROP_Z = -3; // same light-to-backdrop distance as before LIGHT_Z moved from 2 to 0
const BACKDROP_MARGIN = 3.5; // extra room around the outermost lights so glow has space to spread
const LIGHT_INTENSITY = 150; // untested against a real render yet -- the first knob to retune by eye
const LIGHT_DISTANCE = 8; // kept close to BACKDROP_MARGIN so the glow stays tight around the frame
// Lower than the physically-correct default (2) -- trades a sharp hot center for a much
// wider blend zone between neighbors. Drop to 0 for an even flatter, more washed-out spread.
const LIGHT_DECAY = 1;
const SAMPLE_WIDTH = 160; // per-frame color-sampling resolution, not the video's playback resolution
const SMOOTHING = 0.85; // native's own default is 0 (no smoothing); tuned here for a calmer demo visual

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111318);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 22);

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

function disposeSceneObjects() {
  for (const obj of [plane, gridLines, backdrop, ...zoneLights.map((z) => z.light)]) {
    if (!obj) continue;
    scene.remove(obj);
    obj.geometry?.dispose();
    obj.material?.dispose();
  }
  zoneLights = [];
}

function buildScene(planeHeight) {
  disposeSceneObjects();

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

  // World position for each zone's light, at the frame's own edge -- derived from its
  // row/col label rather than its UV rect, which stays independently configurable.
  const halfW = PLANE_WIDTH / 2;
  const halfH = planeHeight / 2;
  const lightPositions = {
    0: [-halfW, halfH], 1: [0, halfH], 2: [halfW, halfH],
    3: [-halfW, 0], 4: [halfW, 0],
    5: [-halfW, -halfH], 6: [0, -halfH], 7: [halfW, -halfH],
  };

  // A dark, diffuse backdrop behind the plane -- the actual light-spread visualization
  // (an "ambilight" wall glow). The video plane itself stays unlit/undimmed on top of it.
  backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry((halfW + BACKDROP_MARGIN) * 2, (halfH + BACKDROP_MARGIN) * 2),
    new THREE.MeshStandardMaterial({ color: 0x05060a, roughness: 1, metalness: 0 }),
  );
  backdrop.position.z = BACKDROP_Z;
  scene.add(backdrop);

  zoneLights = zoneMap.map((zone) => {
    const [x, y] = lightPositions[zone.zoneId];
    const light = new THREE.PointLight(0xffffff, LIGHT_INTENSITY, LIGHT_DISTANCE, LIGHT_DECAY);
    light.position.set(x, y, LIGHT_Z);
    scene.add(light);

    return { zoneId: zone.zoneId, light };
  });
}

buildScene(DEFAULT_PLANE_HEIGHT);

video.addEventListener('loadedmetadata', () => {
  buildScene(PLANE_WIDTH / (video.videoWidth / video.videoHeight));
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
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const gridToggleButton = document.getElementById('toggle-grid');
gridToggleButton.addEventListener('click', () => {
  showGrid = !showGrid;
  gridLines.visible = showGrid;
  gridToggleButton.textContent = showGrid ? 'Hide zone grid' : 'Show zone grid';
});
