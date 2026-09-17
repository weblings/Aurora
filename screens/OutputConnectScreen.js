// Output Connect: the first real screen, and the first full vertical slice
// through the whole stack (server, credential persistence, pairing
// endpoints, Dropdown, waiting/error states). See
// Analysis/WebUI/WebUI_Design_1stPass.md's Output Connect section and build-order step 10.
//
// showBack/onBack default to the hub-and-spoke shape (Back == onComplete ==
// Dashboard), matching every Dashboard-driven call site unchanged. app.js's
// first-run bootstrap (step 18) overrides both explicitly: showBack:false
// when this is the first screen the boot chain shows (nothing to return to
// yet), and a distinct onBack pointing at whatever step preceded this one
// otherwise -- this file doesn't need to know which case it's in.
//
// Four phases, each its own render function: entry (address + Autodetect +
// Continue) -> pairing (push-link wait, huenicorn's real click-to-retry
// model, not a client-side poll loop -- see ApiTools/PairingRoutes'
// register endpoint) -> configSelect (skips the Dropdown entirely when only
// one entertainment configuration exists, since there's nothing to actually
// choose -- but never auto-selects among more than one, see output.md's
// "more than one entertainment configuration is normal" lesson) -> done.
import { renderTopBar } from '../topBar.js';
import { Dropdown } from '../Dropdown.js';

export class OutputConnectScreen {
  constructor(app, { onComplete, onBack, showBack = true }) {
    this.app = app;
    this.onComplete = onComplete;
    this.onBack = onBack ?? onComplete;
    this.showBack = showBack;
    this.phase = 'entry';
    this.bridgeAddress = '';
    this.username = '';
    this.clientkey = '';
    this.configs = null; // null = not loaded yet, distinct from "loaded, zero results"
    this.selectedConfigId = '';
    this.error = null;
    this.dropdown = null;
  }

  async mount(container) {
    this.container = container;
    container.innerHTML = `
      <div class="top-bar-slot"></div>
      <div class="oc-body"></div>
    `;
    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: 'Connect to your Hue Bridge',
      showBack: this.showBack,
      onBack: () => this.onBack(),
      onSettings: () => this.app.openSettings(),
    });

    // Pre-fill from any already-persisted connection -- lets re-pairing an
    // existing bridge start from its current address instead of blank.
    try {
      const connection = await (await fetch('/api/hue/connection')).json();
      if (connection.bridgeAddress) this.bridgeAddress = connection.bridgeAddress;
    } catch {
      // No persisted connection yet, or the probe failed -- entry starts blank either way.
    }

    this._render();
  }

  unmount() {
    this.dropdown?.destroy();
    this.dropdown = null;
  }

  _render() {
    const body = this.container.querySelector('.oc-body');
    this.dropdown?.destroy();
    this.dropdown = null;

    if (this.phase === 'entry') this._renderEntry(body);
    else if (this.phase === 'pairing') this._renderPairing(body);
    else if (this.phase === 'configSelect') this._renderConfigSelect(body);
    else if (this.phase === 'done') this._renderDone(body);
  }

  _renderEntry(body) {
    body.innerHTML = `
      <div class="field">
        <label class="field-label" for="oc-address-input">Bridge address</label>
      </div>
      <div class="oc-address-row">
        <div class="field">
          <input id="oc-address-input" class="text-input" type="text" placeholder="192.168.1.42" />
        </div>
        <button type="button" class="btn btn-secondary" id="oc-autodetect">Autodetect</button>
      </div>
      ${this.error ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error)}</p>` : ''}
      <div class="oc-actions">
        <button type="button" class="btn btn-primary" id="oc-continue">Continue</button>
      </div>
    `;

    const input = body.querySelector('#oc-address-input');
    input.value = this.bridgeAddress;
    input.addEventListener('input', () => {
      this.bridgeAddress = input.value;
    });

    body.querySelector('#oc-autodetect').addEventListener('click', (e) => this._autodetect(e.currentTarget));
    body.querySelector('#oc-continue').addEventListener('click', (e) => this._validateAndPair(e.currentTarget));
  }

  _renderPairing(body) {
    body.innerHTML = `
      <p class="status-text">Press the button on your bridge, then continue.</p>
      ${this.error ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error)}</p>` : ''}
      <div class="oc-actions">
        <button type="button" class="btn btn-link" id="oc-change-address">Change address</button>
        <button type="button" class="btn btn-primary" id="oc-retry-register">Continue</button>
      </div>
    `;
    body.querySelector('#oc-retry-register').addEventListener('click', (e) => this._register(e.currentTarget));
    body.querySelector('#oc-change-address').addEventListener('click', () => {
      this.phase = 'entry';
      this.error = null;
      this._render();
    });
  }

  _renderConfigSelect(body) {
    if (this.configs === null) {
      body.innerHTML = `<p class="status-text">Loading entertainment configurations…</p>`;
      return;
    }

    const errorHtml = this.error ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error)}</p>` : '';

    if (this.configs.length === 0) {
      body.innerHTML = `
        <p class="status-text status-text-error">No entertainment configurations found. Create one in the official Hue app first, then check again.</p>
        <div class="oc-actions">
          <button type="button" class="btn btn-secondary" id="oc-refresh-configs">Check again</button>
        </div>
      `;
      body.querySelector('#oc-refresh-configs').addEventListener('click', () => this._loadConfigs());
      return;
    }

    if (this.configs.length === 1) {
      this.selectedConfigId = this.configs[0].id;
      body.innerHTML = `
        <p class="status-text">Entertainment configuration: <strong>${escapeHtml(this.configs[0].name)}</strong></p>
        ${errorHtml}
        <div class="oc-actions">
          <button type="button" class="btn btn-primary" id="oc-finish">Finish</button>
        </div>
      `;
      body.querySelector('#oc-finish').addEventListener('click', (e) => this._finish(e.currentTarget));
      return;
    }

    body.innerHTML = `
      <div class="field">
        <label class="field-label" id="oc-config-label">Entertainment configuration</label>
        <div id="oc-config-dropdown-slot"></div>
      </div>
      ${errorHtml}
      <div class="oc-actions">
        <button type="button" class="btn btn-primary" id="oc-finish">Finish</button>
      </div>
    `;

    if (!this.selectedConfigId) this.selectedConfigId = this.configs[0].id;
    const slot = body.querySelector('#oc-config-dropdown-slot');
    this.dropdown = new Dropdown(
      slot,
      this.configs.find((c) => c.id === this.selectedConfigId)?.name ?? this.configs[0].name,
      (value) => { this.selectedConfigId = value; },
      { labelId: 'oc-config-label', fill: true },
    );
    this.dropdown.setOptions(this.configs.map((c) => ({
      label: c.name,
      value: c.id,
      selected: c.id === this.selectedConfigId,
    })));

    body.querySelector('#oc-finish').addEventListener('click', (e) => this._finish(e.currentTarget));
  }

  _renderDone(body) {
    body.innerHTML = `
      <p class="status-text status-text-success">✓ Paired to your bridge.</p>
      <div class="oc-actions">
        <button type="button" class="btn btn-primary" id="oc-done-continue">Continue</button>
      </div>
    `;
    body.querySelector('#oc-done-continue').addEventListener('click', () => this.onComplete());
  }

  async _autodetect(button) {
    button.disabled = true;
    this.error = null;
    try {
      const result = await (await fetch('/api/hue/discover')).json();
      if (result.succeeded && Array.isArray(result.bridges) && result.bridges.length > 0) {
        const address = result.bridges[0].internalipaddress;
        if (address) this.bridgeAddress = address;
        else this.error = 'Autodetect found a bridge but no usable address.';
      } else {
        this.error = result.error || 'No bridges found on this network.';
      }
    } catch {
      this.error = 'Could not reach the discovery service.';
    }
    button.disabled = false;
    this._render();
  }

  async _validateAndPair(button) {
    const address = this.bridgeAddress.trim();
    if (!address) {
      this.error = 'Enter a bridge address or use Autodetect.';
      this._render();
      return;
    }

    button.disabled = true;
    this.error = null;
    try {
      const result = await (await fetch('/api/hue/validate', {
        method: 'PUT',
        body: JSON.stringify({ bridgeAddress: address }),
      })).json();
      if (!result.succeeded) {
        this.error = "Couldn't reach a bridge at that address.";
        button.disabled = false;
        this._render();
        return;
      }
    } catch {
      this.error = "Couldn't reach a bridge at that address.";
      button.disabled = false;
      this._render();
      return;
    }

    this.bridgeAddress = address;
    this.phase = 'pairing';
    this._render();
    await this._register();
  }

  async _register(button) {
    if (button) button.disabled = true;
    this.error = null;
    try {
      const result = await (await fetch('/api/hue/register', {
        method: 'PUT',
        body: JSON.stringify({ bridgeAddress: this.bridgeAddress }),
      })).json();
      if (result.succeeded) {
        this.username = result.username;
        this.clientkey = result.clientkey;
        this.phase = 'configSelect';
        await this._loadConfigs();
        return;
      }
      // link_button_not_pressed is the expected, non-error waiting state --
      // huenicorn's own real UX (verified in Analysis/WebUI/WebUI_Design_1stPass.md's
      // step 5 research) just re-shows the same wait message, no auto-retry.
      if (result.error !== 'link_button_not_pressed') {
        this.error = "Couldn't pair with the bridge. Check the address and try again.";
      }
    } catch {
      this.error = "Couldn't reach the bridge.";
    }
    if (button) button.disabled = false;
    this._render();
  }

  async _loadConfigs() {
    this.configs = null;
    this._render();
    try {
      const result = await (await fetch('/api/hue/entertainment-configurations', {
        method: 'PUT',
        body: JSON.stringify({ bridgeAddress: this.bridgeAddress, username: this.username }),
      })).json();
      this.configs = result.succeeded ? result.configurations : [];
    } catch {
      this.configs = [];
    }
    this._render();
  }

  async _finish(button) {
    button.disabled = true;
    this.error = null;
    try {
      const result = await (await fetch('/api/hue/connection', {
        method: 'POST',
        body: JSON.stringify({
          bridgeAddress: this.bridgeAddress,
          username: this.username,
          clientkey: this.clientkey,
          entertainmentConfigurationId: this.selectedConfigId,
        }),
      })).json();
      if (result.succeeded) {
        this.phase = 'done';
        this._render();
        return;
      }
      this.error = "Couldn't save the connection.";
    } catch {
      this.error = "Couldn't save the connection.";
    }
    button.disabled = false;
    this._render();
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
