// Pair this device (Aurora-5ipy.6): an unpaired LAN browser requests a pairing,
// shows the code and polls; the approved poll sets the HttpOnly token cookie.
import { renderTopBar } from '../topBar.js';
import { renderNavFooter } from '../NavFooter.js';
import { guessDeviceName } from '../Pairing.js';

const LOGO_URL = new URL('../icons/aurora-logo.png', import.meta.url).href;
const DEFAULT_POLL_INTERVAL_MS = 2000;

export class PairingScreen {
  constructor(app, { onComplete, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, userAgent = globalThis.navigator?.userAgent ?? '' }) {
    this.app = app;
    this.onComplete = onComplete;
    this.pollIntervalMs = pollIntervalMs;
    this.phase = 'intro';
    this.deviceName = guessDeviceName(userAgent);
    this.code = '';
    this.pollKey = '';
    this.error = null;
    this.busy = false;
    this._pollTimer = null;
    this._mounted = false;
  }

  async mount(container) {
    this.container = container;
    this._mounted = true;
    container.innerHTML = `
      <div class="top-bar-slot"></div>
      <div class="pairing-body"></div>
      <div class="nav-footer-slot"></div>
    `;
    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: 'Pair this device',
      logo: { src: LOGO_URL, alt: 'Aurora' },
      showBack: false,
    });
    this._render();
  }

  unmount() {
    this._mounted = false;
    this._stopPolling();
  }

  _render() {
    const body = this.container.querySelector('.pairing-body');
    const footer = this.container.querySelector('.nav-footer-slot');
    if (this.phase === 'waiting') this._renderWaiting(body, footer);
    else this._renderIntro(body, footer);
  }

  _renderIntro(body, footer) {
    body.innerHTML = `
      <div class="text-pair">
        <p class="text-primary">This device isn't paired yet</p>
        <p class="text-secondary">Aurora needs to approve it once before it can change anything.</p>
      </div>
      <div class="field pairing-name-field">
        <label class="field-label" for="pairing-name-input">Device name</label>
        <input id="pairing-name-input" class="text-input" type="text" maxlength="64" />
      </div>
      ${this.error ? `<p class="status-text status-text-error"><span class="warn-glyph" aria-hidden="true"></span> ${escapeHtml(this.error)}</p>` : ''}
    `;
    const input = body.querySelector('#pairing-name-input');
    input.value = this.deviceName;
    input.addEventListener('input', () => {
      this.deviceName = input.value;
    });

    renderNavFooter(footer, {
      showBack: false,
      continueLabel: 'Pair this device',
      onContinue: (e) => this._request(e.currentTarget),
    });
  }

  _renderWaiting(body, footer) {
    body.innerHTML = `
      <div class="text-pair">
        <p class="text-primary">Approve this device in Aurora</p>
        <p class="text-secondary">On the computer running Aurora, open Aurora and approve ${escapeHtml(this.deviceName.trim() || 'this device')} if its code matches the one below.</p>
      </div>
      <p class="pairing-code" aria-label="Pairing code">${escapeHtml(this.code)}</p>
      <p class="status-text">Waiting for approval…</p>
    `;
    renderNavFooter(footer, {
      showBack: false,
      continueLabel: 'Cancel',
      onContinue: () => {
        this._stopPolling();
        this.phase = 'intro';
        this.error = null;
        this._render();
      },
    });
  }

  async _request(button) {
    if (this.busy) return;
    this.busy = true;
    if (button) button.disabled = true;
    this.error = null;
    try {
      const response = await fetch('/api/pairing/request', {
        method: 'POST',
        body: JSON.stringify({ name: this.deviceName.trim(), scope: 'admin' }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 202 && body.pollKey) {
        this.pollKey = body.pollKey;
        this.code = body.code ?? '';
        this.phase = 'waiting';
        this._render();
        this._schedulePoll();
        return;
      }
      this.error = response.status === 429
        ? 'Too many devices are waiting for approval. Try again in a few minutes.'
        : "Couldn't ask Aurora to pair this device. Try again.";
    } catch {
      // Unreachable belongs to the shell takeover.
      if (!(await this.app.checkNow())) return;
      this.error = "Couldn't ask Aurora to pair this device. Try again.";
    } finally {
      this.busy = false;
    }
    if (this._mounted) this._render();
  }

  _schedulePoll() {
    this._stopPolling();
    this._pollTimer = setTimeout(() => this._poll(), this.pollIntervalMs);
  }

  _stopPolling() {
    if (this._pollTimer !== null) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
  }

  async _poll() {
    this._pollTimer = null;
    const pollKey = this.pollKey;
    let status;
    try {
      status = (await fetch(`/api/pairing/request/${encodeURIComponent(pollKey)}`)).status;
    } catch {
      // A dropped poll retries; a real outage raises the shell takeover.
      void this.app.checkNow();
      status = 202;
    }
    // Cancelled or unmounted while the poll was in flight.
    if (!this._mounted || this.phase !== 'waiting' || this.pollKey !== pollKey) return;

    if (status === 200) {
      this.onComplete();
      return;
    }
    if (status === 202) {
      this._schedulePoll();
      return;
    }
    this.phase = 'intro';
    this.error = 'The request was declined or expired. Pair again to get a new code.';
    this._render();
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
