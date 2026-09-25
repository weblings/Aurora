// Standalone viz entry (gj0.6): room rig only, driven live by the relay.
// No WebUI half, no VideoSource/AudioSource -- the third color provider
// (LiveDataSource) is additive, exactly as the gj0.5 refactor intended.
import * as THREE from 'three';
import { createSceneCore } from './scene-core.js';
import { ROOM_ZONE_MAP, createRoomRig } from './room-rig.js';
import { applyFrameToTargets } from './frame-apply.js';
import { createLiveDataSource } from './live-data-source.js';

// frameZ only seeds the orbit target; the room path reframes to the model
// on load, so 0 (not the flat scene's FRAME_Z) is the honest value here.
const { scene, camera, renderer, controls, scenePane, scenePaneSize } =
  createSceneCore({ frameZ: 0 });

// No video source on this page: a 1x1 black texture so the TV screen reads
// as off instead of untextured-white.
const blackTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
blackTexture.needsUpdate = true;

const roomRig = createRoomRig({
  scene, camera, controls, fitMargin: 1, getScreenTexture: () => blackTexture,
});

const statusEl = document.getElementById('viz-status');
const live = createLiveDataSource({ onStatus: (text) => { statusEl.textContent = text; } });

let zoneLights = [];
function animate() {
  // Null until the first mappable relay frame: the room renders but the
  // lights hold their as-loaded state.
  const frame = live.sampleFrame(ROOM_ZONE_MAP);
  if (frame) applyFrameToTargets(frame, ROOM_ZONE_MAP, zoneLights);
  roomRig.syncLampShades();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

new ResizeObserver(() => {
  const { width, height } = scenePaneSize();
  camera.aspect = width / height;
  roomRig.frameCameraToRoom(); // no-op until the model's loaded; harmless
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}).observe(scenePane);

roomRig.ensureRoomModelLoaded()?.then(() => {
  if (!roomRig.model) return; // load failed; console + status already say so
  roomRig.model.visible = true;
  roomRig.frameCameraToRoom();
  zoneLights = roomRig.zoneLights;
  // Dark until the first relay frame: the authored glTF intensities would
  // otherwise read as white output before any data arrives.
  applyFrameToTargets(
    zoneLights.map(({ zoneId }) => ({ zoneId, color: { r: 0, g: 0, b: 0 } })),
    ROOM_ZONE_MAP,
    zoneLights
  );
});
