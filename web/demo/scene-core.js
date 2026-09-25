// Scene core (gj0.5 slice 1): renderer, camera, controls, and the scene
// pane they live in. No rigs, no sources, no Dashboard coupling -- both
// index.html and the viz.html standalone page (gj0.6) build on this.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createSceneCore({ frameZ }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111318);

  const scenePane = document.getElementById('scene-pane');

  // Split-view shell owns the canvas geometry now, not the window: camera
  // aspect + renderer size follow the scene pane (Phase 1c). The observer
  // below fires on observe too, so the fit is pane-correct from the start.
  function scenePaneSize() {
    const rect = scenePane.getBoundingClientRect();
    return { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) };
  }
  const _initialPane = scenePaneSize();
  const camera = new THREE.PerspectiveCamera(50, _initialPane.width / _initialPane.height, 0.1, 200);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(_initialPane.width, _initialPane.height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // LinearToneMapping instead of NoToneMapping -- NoToneMapping ignores toneMappingExposure
  // entirely, which would silently break the exposure dial just added above.
  renderer.toneMapping = THREE.LinearToneMapping;
  renderer.toneMappingExposure = 1;
  scenePane.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, frameZ); // orbit pivots on the frame itself, not the world origin

  // Default spawn pose, tuned from a live orbit readout (az=35.8deg,
  // pol=87.7deg): imposed after every camera fit, so resizes keep the angles
  // while the fit distance stays aspect-correct. Convention verified against
  // the readout (offset = dist * (sin pol * sin az, cos pol, sin pol * cos az)).
  const SPAWN_AZ_DEG = 35.8;
  const SPAWN_POL_DEG = 87.7;
  function applySpawnPose() {
    const target = controls.target;
    const dist = camera.position.distanceTo(target);
    const az = THREE.MathUtils.degToRad(SPAWN_AZ_DEG);
    const pol = THREE.MathUtils.degToRad(SPAWN_POL_DEG);
    camera.position.set(
      target.x + dist * Math.sin(pol) * Math.sin(az),
      target.y + dist * Math.cos(pol),
      target.z + dist * Math.sin(pol) * Math.cos(az)
    );
  }

  return { scene, camera, renderer, controls, scenePane, scenePaneSize, applySpawnPose };
}
