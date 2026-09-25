// Point light rig (gj0.5 slice 2): one light per zone at the zone's own
// centroid. Pure builder -- takes zones + dims, returns [{zoneId, lights}].
import * as THREE from 'three';

export function buildPointLights(zones, { halfW, halfH, pointZ, intensity, distance, decay }) {
  return zones.map((zone) => {
    const [x, y] = zoneCentroid(zone, halfW, halfH);
    const light = new THREE.PointLight(0xffffff, intensity, distance, decay);
    light.position.set(x, y, pointZ);
    return { zoneId: zone.zoneId, lights: [light] };
  });
}

// The center of the zone's own UV rect, in world space -- now that the mask (not the light's
// position) is what hugs the screen edge, the light can sit where it actually represents its
// own zone instead of pinned to a corner/edge point covering a much larger area.
function zoneCentroid(zone, halfW, halfH) {
  const centroidU = (zone.uvs.min[0] + zone.uvs.max[0]) / 2;
  const centroidV = (zone.uvs.min[1] + zone.uvs.max[1]) / 2;
  return [(centroidU - 0.5) * halfW * 2, (0.5 - centroidV) * halfH * 2];
}
