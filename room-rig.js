// Room light rig (gj0.5 slice 2): TV_Room.glb's own 4 KHR_lights_punctual
// lights, each matched to a video quadrant by real geometry. Owns the model,
// its zone assignment, lamp-shade tint meshes, and the TV-screen node --
// main.js drives it through this handle and never touches the model itself.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The room's own 4 point lights each drive one video quadrant instead of the flat rigs' 8 zones.
export const ROOM_ZONE_MAP = [
  { zoneId: 'front-left', uvs: { min: [0, 0], max: [0.5, 0.5] }, active: true, gamma: 0 },
  { zoneId: 'front-right', uvs: { min: [0.5, 0], max: [1, 0.5] }, active: true, gamma: 0 },
  { zoneId: 'back-left', uvs: { min: [0, 0.5], max: [0.5, 1] }, active: true, gamma: 0 },
  { zoneId: 'back-right', uvs: { min: [0.5, 0.5], max: [1, 1] }, active: true, gamma: 0 },
];
// Best guess, not verified visually -- flip if the room shows left/right swapped once rendered.
const ROOM_LEFT_IS_POSITIVE_Z = true;

// TV_Room.glb's lamps export at Blender's real Watt->candela conversion (~543 cd each),
// physically-realistic but way past LinearToneMapping's clip point -- scaled down here instead
// of re-exporting. Tune these directly while checking the room.
const ROOM_LIGHT_INTENSITY_SCALE = 0.025; // multiplies every glTF-authored light's own intensity
const ROOM_LIGHT_DISTANCE = 4; // meters; glTF export leaves this at 0 (unbounded/pure inverse-square)

// Diffuse alone left most of each shade black -- no material here has an emissive component, and
// the room has no ambient light, so faces angled away from their own bulb get zero incident light.
const LAMP_SHADE_EMISSIVE_INTENSITY = 3; // <1 so the directly-lit panel still shows real shading

export function createRoomRig({ scene, camera, controls, fitMargin, getScreenTexture }) {
  const gltfLoader = new GLTFLoader();
  const roomStatus = document.getElementById('room-status');

  let roomModel = null; // THREE.Group, loaded once via GLTFLoader and reused across mode switches
  let roomModelLoading = null;
  let roomZoneLights = []; // computed once on load by assignRoomZoneLights()
  let tvScreenMesh = null; // the room model's own 'TV_Screen' node, found once on load
  let roomLampShades = []; // [{mesh, light}], shades + bulbs, each tinted from its own nearest light

  function setRoomStatus(text) {
    if (!roomStatus) return; // viz.html has no status node; model errors go to the console there
    roomStatus.textContent = text;
    roomStatus.hidden = !text;
  }

  // Matches each of the room's 4 point lights to a video quadrant by real geometry: distance to
  // TV_Screen splits front (flanking it) from back (rear wall); within each pair, whichever axis
  // actually differs between the two splits left from right (sign per ROOM_LEFT_IS_POSITIVE_Z).
  function assignRoomZoneLights(gltfScene) {
    const tvScreen = gltfScene.getObjectByName('TV_Screen');
    const pointLights = [];
    gltfScene.traverse((obj) => { if (obj.isPointLight) pointLights.push(obj); });

    if (!tvScreen || pointLights.length !== 4) {
      console.warn('Room zone-light mapping skipped -- expected TV_Screen + 4 point lights, found', !!tvScreen, pointLights.length);
      return [];
    }

    const tvPos = tvScreen.getWorldPosition(new THREE.Vector3());
    const withDistance = pointLights
      .map((light) => {
        const pos = light.getWorldPosition(new THREE.Vector3());
        return { light, pos, distance: pos.distanceTo(tvPos) };
      })
      .sort((a, b) => a.distance - b.distance);
    const front = withDistance.slice(0, 2);
    const back = withDistance.slice(2, 4);

    const axis = ['x', 'y', 'z'].reduce((best, a) =>
      Math.abs(front[0].pos[a] - front[1].pos[a]) > Math.abs(front[0].pos[best] - front[1].pos[best]) ? a : best);
    const isLeft = (entry) => (entry.pos[axis] > 0) === ROOM_LEFT_IS_POSITIVE_Z;
    const pick = (pair, wantLeft) => {
      const entry = pair.find((e) => isLeft(e) === wantLeft);
      return entry ? [entry.light] : [];
    };

    return [
      { zoneId: 'front-left', lights: pick(front, true) },
      { zoneId: 'front-right', lights: pick(front, false) },
      { zoneId: 'back-left', lights: pick(back, true) },
      { zoneId: 'back-right', lights: pick(back, false) },
    ];
  }

  // Each of these glTF materials is one shared instance across the room's 4 lamps (shade panel,
  // bulb) -- clone per-mesh so each instance can be independently tinted from its own nearest light.
  function setupEmissiveTintMeshes(gltfScene, lights, materialName) {
    const meshes = [];
    gltfScene.traverse((obj) => { if (obj.isMesh && obj.material?.name === materialName) meshes.push(obj); });

    return meshes.map((mesh) => {
      mesh.material = mesh.material.clone();
      mesh.material.transparent = false;
      mesh.material.opacity = 1;
      mesh.material.depthWrite = true; // GLTFLoader sets this false for alphaMode BLEND; undo it
      mesh.material.color.set(0xffffff);
      mesh.material.emissiveIntensity = LAMP_SHADE_EMISSIVE_INTENSITY;

      const meshPos = mesh.getWorldPosition(new THREE.Vector3());
      const byDistance = lights.map((l) => ({ l, d: l.getWorldPosition(new THREE.Vector3()).distanceTo(meshPos) }));
      return { mesh, light: byDistance.sort((a, b) => a.d - b.d)[0].l };
    });
  }

  // Loads the model once and reuses it across mode switches -- toggling the dropdown back and
  // forth shouldn't re-fetch/re-parse a multi-MB glb every time.
  function ensureRoomModelLoaded() {
    if (!roomModelLoading) {
      setRoomStatus('Loading TV_Room.glb...');
      roomModelLoading = gltfLoader.loadAsync('assets/TV_Room.glb').then((gltf) => {
        roomModel = gltf.scene;
        roomModel.visible = false; // shown explicitly by the caller once ready
        roomModel.traverse((obj) => {
          if (!obj.isPointLight && !obj.isSpotLight) return;
          obj.intensity *= ROOM_LIGHT_INTENSITY_SCALE;
          if (obj.distance === 0) obj.distance = ROOM_LIGHT_DISTANCE;
        });
        scene.add(roomModel);
        roomModel.updateMatrixWorld(true); // world positions below need real, not stale/identity, transforms
        roomZoneLights = assignRoomZoneLights(roomModel);
        console.log('Room zone lights:', roomZoneLights.map((z) => ({ zoneId: z.zoneId, light: z.lights[0]?.name })));
        const roomLights = roomZoneLights.flatMap((z) => z.lights);
        roomLampShades = [
          ...setupEmissiveTintMeshes(roomModel, roomLights, 'LampShade'),
          ...setupEmissiveTintMeshes(roomModel, roomLights, 'BlocksGem'), // the bulb geometry itself
        ];

        // Unlit (MeshBasicMaterial), like the flat plane -- this represents a self-lit screen,
        // not a surface the room's own lights should shade.
        tvScreenMesh = roomModel.getObjectByName('TV_Screen');
        if (tvScreenMesh) tvScreenMesh.material = new THREE.MeshBasicMaterial({ map: getScreenTexture() });
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
    const distance = (radius / Math.tan(vFov)) * fitMargin;
    camera.position.set(center.x, center.y, center.z + distance);
    controls.target.copy(center);
  }

  // Per-frame cosmetics: each shade reads back its own already-updated
  // light's color. Emissive, not diffuse -- angle-independent, so every face
  // glows regardless of whether this light's direction actually reaches it.
  function syncLampShades() {
    for (const { mesh, light } of roomLampShades) mesh.material.emissive.setRGB(1, 1, 1).lerp(light.color, 0.95);
  }

  return {
    ensureRoomModelLoaded,
    frameCameraToRoom,
    syncLampShades,
    get model() { return roomModel; },
    get zoneLights() { return roomZoneLights; },
    get lampShades() { return roomLampShades; },
    get tvScreenMesh() { return tvScreenMesh; },
  };
}
