// Paired devices list with Revoke (Aurora-5ipy.6), Dashboard's "Paired
// devices" section. Admin only: the caller shows it on loopback or a paired admin.
export class PairedDevices {
  constructor(container, { onUnreachable = () => {} } = {}) {
    this.container = container;
    this.onUnreachable = onUnreachable;
    this.devices = null; // null until the first load answers
    this.error = null;
    this.busyId = null;
    this._destroyed = false;
  }

  async load() {
    try {
      const response = await fetch('/api/pairing/devices');
      const body = await response.json();
      this.devices = Array.isArray(body?.devices) ? body.devices : [];
    } catch {
      this.onUnreachable();
      this.devices ??= [];
    }
    this.render();
  }

  destroy() {
    this._destroyed = true;
  }

  render() {
    if (this._destroyed) return;
    if (this.devices === null) {
      this.container.innerHTML = `<p class="status-text">Loading…</p>`;
      return;
    }
    const rows = this.devices.map((device) => `
      <li class="paired-device-row">
        <div class="paired-device-text">
          <p class="paired-device-name">${escapeHtml(device.name ?? '')}</p>
          <p class="paired-device-meta">${escapeHtml(this._meta(device))}</p>
        </div>
        <button type="button" class="btn btn-secondary paired-device-revoke" data-id="${escapeHtml(device.id)}"${this.busyId === device.id ? ' disabled' : ''}>Revoke</button>
      </li>
    `).join('');
    this.container.innerHTML = `
      <p class="status-text">Devices on the Aurora computer itself never need pairing.</p>
      ${this.devices.length === 0
        ? `<p class="status-text">No other devices are paired.</p>`
        : `<ul class="paired-device-list">${rows}</ul>`}
      ${this.error ? `<p class="status-text status-text-error"><span class="warn-glyph" aria-hidden="true"></span> ${escapeHtml(this.error)}</p>` : ''}
    `;
    for (const button of this.container.querySelectorAll('.paired-device-revoke')) {
      button.addEventListener('click', () => this._revoke(button.dataset.id));
    }
  }

  _meta(device) {
    const paired = formatDate(device.createdAt);
    const lastSeen = formatDate(device.lastSeen);
    return lastSeen && lastSeen !== paired ? `Paired ${paired}, last used ${lastSeen}` : `Paired ${paired}`;
  }

  async _revoke(id) {
    if (this.busyId !== null) return;
    this.busyId = id;
    this.error = null;
    this.render();
    try {
      const response = await fetch(`/api/pairing/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (response.status === 500 && body.error === 'store_write_failed') {
        // Revoked in memory only (Aurora-m4wp): the row is gone, a restart brings it back.
        this.error = "Revoked until Aurora restarts. The change couldn't be saved, so the device will work again after a restart. Revoke it again then.";
      } else if (!response.ok && response.status !== 404) {
        this.error = "Couldn't revoke this device. Try again.";
      }
    } catch {
      this.onUnreachable();
    }
    this.busyId = null;
    await this.load();
  }
}

// Unix seconds -> short local date; empty for a missing timestamp.
function formatDate(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  return new Date(seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
