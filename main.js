import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { zoneMap } from './zonemap.js';

const PLANE_WIDTH = 16;
const PLANE_HEIGHT = 9;
const LIGHT_PADDING = 1.5;
const LIGHT_Z = 2;

// World position for each zone's light, derived from its row/col label rather than its
// UV rect — a zone's UV crop and its light's 3D position are independently configurable.
const halfW = PLANE_WIDTH / 2 + LIGHT_PADDING;
const halfH = PLANE_HEIGHT / 2 + LIGHT_PADDING;
const lightPositions = {
  0: [-halfW, halfH], 1: [0, halfH], 2: [halfW, halfH],
  3: [-halfW, 0], 4: [halfW, 0],
  5: [-halfW, -halfH], 6: [0, -halfH], 7: [halfW, -halfH],
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111318);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 22);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT),
  new THREE.MeshBasicMaterial({ color: 0x222630 }),
);
scene.add(plane);

// Thirds gridlines over the plane, purely visual confirmation of the nine-slice layout.
const gridPoints = [];
for (const f of [1 / 3, 2 / 3]) {
  gridPoints.push(
    new THREE.Vector3(-PLANE_WIDTH / 2 + f * PLANE_WIDTH, PLANE_HEIGHT / 2, 0.01),
    new THREE.Vector3(-PLANE_WIDTH / 2 + f * PLANE_WIDTH, -PLANE_HEIGHT / 2, 0.01),
    new THREE.Vector3(-PLANE_WIDTH / 2, PLANE_HEIGHT / 2 - f * PLANE_HEIGHT, 0.01),
    new THREE.Vector3(PLANE_WIDTH / 2, PLANE_HEIGHT / 2 - f * PLANE_HEIGHT, 0.01),
  );
}
scene.add(new THREE.LineSegments(
  new THREE.BufferGeometry().setFromPoints(gridPoints),
  new THREE.LineBasicMaterial({ color: 0x4a4f5c }),
));

const zoneLights = zoneMap.map((zone) => {
  const [x, y] = lightPositions[zone.zoneId];
  const light = new THREE.PointLight(0xffffff, 30, 40);
  light.position.set(x, y, LIGHT_Z);
  scene.add(light);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  marker.position.copy(light.position);
  scene.add(marker);

  return { zoneId: zone.zoneId, light, marker };
});

// Stand-in for real Processing output: one color per zone, cycling independently so each
// zone's light is visually distinguishable. Replaced once the real hand-ported pipeline exists.
function fakeZoneColor(zoneId, tSeconds) {
  const hue = ((tSeconds * 0.08) + zoneId / zoneLights.length) % 1;
  return new THREE.Color().setHSL(hue, 0.75, 0.55);
}

const clock = new THREE.Clock();
function animate() {
  const t = clock.getElapsedTime();
  for (const { zoneId, light, marker } of zoneLights) {
    const color = fakeZoneColor(zoneId, t);
    light.color.copy(color);
    marker.material.color.copy(color);
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
