// RectArea light rig (gj0.5 slice 2): one light per edge-segment, carried
// forward unchanged (deliberately dormant-not-deleted). Pure builder --
// takes zones + dims, returns [{zoneId, lights}].
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

RectAreaLightUniformsLib.init(); // required once for RectAreaLight to shade correctly

// Each physical edge is divided into 3 equal, snugly-adjacent segments along its own length --
// not derived per-zone. Corner zones sit on two edges and get one light per edge (they
// naturally overlap right at the corner, which is fine); edge-mid zones get just one.
const RECTAREA_EDGES = [
  { zoneIds: [0, 1, 2], horizontal: true, fixedSign: 1 }, // top
  { zoneIds: [5, 6, 7], horizontal: true, fixedSign: -1 }, // bottom
  { zoneIds: [0, 3, 5], horizontal: false, fixedSign: -1 }, // left
  { zoneIds: [2, 4, 7], horizontal: false, fixedSign: 1 }, // right
];

// One RectAreaLight per edge-segment (see RECTAREA_EDGES) rather than per zone -- a corner
// zone accumulates a light from each edge it sits on.
export function buildRectAreaLights(zones, { halfW, halfH, rectZ, backdropZ, intensity, depth, lengthOverlap }) {
  const lightsByZoneId = new Map();

  for (const edge of RECTAREA_EDGES) {
    const edgeLength = edge.horizontal ? halfW * 2 : halfH * 2;
    const segmentLength = (edgeLength / 3) * lengthOverlap;
    const fixedCoord = edge.fixedSign * (edge.horizontal ? halfH : halfW);

    edge.zoneIds.forEach((zoneId, i) => {
      // zoneIds are listed low-x-to-high-x for horizontal edges, but top-to-bottom (i.e.
      // high-y-to-low-y) for vertical ones -- the two axes run opposite directions in world space.
      const thirdCenter = (i + 0.5) * (edgeLength / 3);
      const along = edge.horizontal ? -edgeLength / 2 + thirdCenter : edgeLength / 2 - thirdCenter;
      const x = edge.horizontal ? along : fixedCoord;
      const y = edge.horizontal ? fixedCoord : along;
      const width = edge.horizontal ? segmentLength : depth;
      const height = edge.horizontal ? depth : segmentLength;

      const light = new THREE.RectAreaLight(0xffffff, intensity, width, height);
      light.position.set(x, y, rectZ);
      light.lookAt(x, y, backdropZ);

      if (!lightsByZoneId.has(zoneId)) lightsByZoneId.set(zoneId, []);
      lightsByZoneId.get(zoneId).push(light);
    });
  }

  return zones.map((zone) => ({ zoneId: zone.zoneId, lights: lightsByZoneId.get(zone.zoneId) || [] }));
}
