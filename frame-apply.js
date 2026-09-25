// Shared frame applier (gj0.6): writes a provider frame onto rig targets.
// Frame contract: [{zoneId, color:{r,g,b} 0..1}]. Targets keep their color
// when their id is absent from the frame; zones flagged active:false go dark
// (demo legibility deviation -- native holds last color instead).
export function applyFrameToTargets(frame, zones, targets) {
  const frameById = new Map(zones.map((z) => [z.zoneId, z]));
  const updated = new Set();
  for (const zoneFrame of frame) {
    const target = targets.find((z) => z.zoneId === zoneFrame.zoneId);
    if (!target) continue;
    updated.add(zoneFrame.zoneId);
    for (const light of target.lights) {
      light.color.setRGB(zoneFrame.color.r, zoneFrame.color.g, zoneFrame.color.b);
    }
  }
  for (const { zoneId, lights } of targets) {
    if (updated.has(zoneId)) continue;
    if (frameById.get(zoneId)?.active === false) {
      for (const light of lights) light.color.setRGB(0, 0, 0);
    }
  }
}
