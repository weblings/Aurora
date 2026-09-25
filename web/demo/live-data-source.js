// Live color provider (gj0.6): an EventSource client against the light-viz
// relay (tools/light-viz-relay/relay.py), feeding the room rig's fixed zone
// IDs. Third implementation of the provider contract (see frame-apply.js):
// sampleFrame() returns [{zoneId, color:{r,g,b} 0..1}] or null (no data yet).
//
// ID->slot decision (gj0.4 left it open): the relay's numeric channel ids
// index ROOM_ZONE_MAP in order -- 0=front-left, 1=front-right,
// 2=back-left, 3=back-right -- matching the conf-room-4zone fixture wiring.
const DEFAULT_RELAY_URL = 'http://127.0.0.1:18245/events';

// Pure mapping, unit-tested (live-data-source.test.mjs): relay payload ->
// provider frame. Tolerates what the wire actually carries (see gj0.6 bead
// notes): empty zone lists (validate.py sentinels), unknown top-level keys,
// and ids outside the zone map (dropped without failing the frame).
export function mapLiveFrame(payload, zones) {
  if (!payload || !Array.isArray(payload.zones) || payload.zones.length === 0) return null;
  const frame = [];
  for (const z of payload.zones) {
    const slot = zones[z?.id];
    if (!slot || typeof z.r !== 'number' || typeof z.g !== 'number' || typeof z.b !== 'number') continue;
    frame.push({ zoneId: slot.zoneId, color: { r: z.r, g: z.g, b: z.b } });
  }
  return frame.length > 0 ? frame : null;
}

export function createLiveDataSource({ url = DEFAULT_RELAY_URL, onStatus = () => {} } = {}) {
  let latest = null;
  let frameCount = 0;

  const source = new EventSource(url);
  source.onopen = () => onStatus('connected -- waiting for frames');
  source.onerror = () => onStatus('connection error / reconnecting...');
  source.onmessage = (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return; // malformed datagrams are dropped by the relay already; stay quiet
    }
    frameCount += 1;
    onStatus(`connected -- frame ${frameCount}, ${payload.zones?.length ?? 0} zones`);
    latest = payload;
  };

  return {
    // Null until the first mappable frame arrives: the scene renders but the
    // lights hold their as-loaded state, so "nothing" shows pre-data.
    sampleFrame(zones) {
      if (!latest) return null;
      return mapLiveFrame(latest, zones);
    },
    close() {
      source.close();
    },
  };
}
