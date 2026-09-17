// Coalesces rapid PUT /api/zones edits per zoneId: at most one request in
// flight per zone, always eventually sending whatever's most recent rather
// than queuing a backlog of stale intermediate frames. Shared by ZoneCanvas
// (drag/gamma edits) and both ZoneActiveToggle variants (active flips) --
// all three patch the same resource and can each fire faster than one
// network round trip (a drag's pointermove stream; rapid double-toggling).
export class ZonePatchQueue {
  constructor({ onError } = {}) {
    this.onError = onError;
    this._pending = new Map();
    this._inFlight = new Set();
  }

  queue(zoneId, patch) {
    const existing = this._pending.get(zoneId) ?? {};
    this._pending.set(zoneId, { ...existing, ...patch });
    this._flush(zoneId);
  }

  async _flush(zoneId) {
    if (this._inFlight.has(zoneId)) return;

    const patch = this._pending.get(zoneId);
    if (!patch) return;
    this._pending.delete(zoneId);
    this._inFlight.add(zoneId);

    try {
      const result = await (await fetch('/api/zones', {
        method: 'PUT',
        body: JSON.stringify({ zoneId, ...patch }),
      })).json();
      if (!result.succeeded) this.onError?.("Couldn't save a zone edit.");
    } catch {
      this.onError?.("Couldn't reach the daemon.");
    }

    this._inFlight.delete(zoneId);
    if (this._pending.has(zoneId)) this._flush(zoneId);
  }
}
