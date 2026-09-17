// Output Connect: the first real screen, and the first full vertical slice
// through the whole stack (server, credential persistence, pairing
// endpoints, waiting/error states). See Analysis/WebUI/WebUI_Design_1stPass.md's
// Output Connect section and build-order step 10; redesigned in
// Analysis/WebUI/WebUI_Design_2ndPass.md's Screen 1.
//
// showBack/onBack default to the hub-and-spoke shape (Back == onComplete ==
// Dashboard), matching every Dashboard-driven call site unchanged. app.js's
// first-run bootstrap overrides both explicitly: showBack:false when this
// is the first screen the boot chain shows (nothing to return to yet), and
// a distinct onBack pointing at whatever step preceded this one otherwise
// -- this file doesn't need to know which case it's in.
//
// Three phases: entry (address + Autodetect) -> pairing (push-link wait,
// huenicorn's real click-to-retry model, not a client-side poll loop --
// see ApiTools/PairingRoutes' register endpoint) -> connected (already
// paired, reached via mount()'s own saved-state check, not just a
// same-session "done" -- fixes the original bug where mount() always
// rendered the blank entry form regardless of already-saved state,
// dropping Back into a re-pairing flow it never asked for). Entertainment
// configuration selection is no longer this screen's job at all -- the new
// "Entertainment zone select" screen owns it, PATCHing
// entertainmentConfigurationId onto the connection this screen already
// saved (isConfigured() doesn't require it -- confirmed in
// CredentialsStoreTests.cpp). A successful pairing here already persists
// bridgeAddress/username/clientkey and calls onComplete() directly; no
// local config-select/done phase to skip past.
import { renderTopBar } from '../topBar.js';
import { renderNavFooter } from '../NavFooter.js';

export class OutputConnectScreen {
  constructor(app, { onComplete, onBack, showBack = true }) {
    this.app = app;
    this.onComplete = onComplete;
    this.onBack = onBack ?? onComplete;
    this.showBack = showBack;
    this.phase = 'entry'; // 'entry' | 'pairing' | 'connected'
    this.bridgeAddress = '';
    this.username = '';
    this.clientkey = '';
    this.error = null;
  }

  async mount(container) {
    this.container = container;
    container.innerHTML = `
      <div class="top-bar-slot"></div>
      <div class="oc-body"></div>
      <div class="nav-footer-slot"></div>
    `;
    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: 'Connect to your Hue Bridge',
      showBack: false,
      onSettings: () => this.app.openSettings(),
    });

    // Checks saved state before rendering anything -- the actual fix for
    // Back dropping into a blank re-pairing form regardless of an already-
    // saved connection (WebUI_Fixes.md's Back-button task).
    try {
      const connection = await (await fetch('/api/hue/connection')).json();
      if (connection.bridgeAddress) this.bridgeAddress = connection.bridgeAddress;
      if (connection.configured) this.phase = 'connected';
    } catch {
      // No persisted connection yet, or the probe failed -- entry starts blank either way.
    }

    this._render();
  }

  unmount() {}

  _render() {
    const body = this.container.querySelector('.oc-body');
    const footer = this.container.querySelector('.nav-footer-slot');

    if (this.phase === 'entry') this._renderEntry(body, footer);
    else if (this.phase === 'pairing') this._renderPairing(body, footer);
    else this._renderConnected(body, footer);
  }

  _renderEntry(body, footer) {
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
    `;

    const input = body.querySelector('#oc-address-input');
    input.value = this.bridgeAddress;
    input.addEventListener('input', () => {
      this.bridgeAddress = input.value;
    });

    body.querySelector('#oc-autodetect').addEventListener('click', (e) => this._autodetect(e.currentTarget));

    renderNavFooter(footer, {
      showBack: this.showBack,
      onBack: () => this.onBack(),
      onContinue: (e) => this._validateAndPair(e.currentTarget),
    });
  }

  _renderPairing(body, footer) {
    body.innerHTML = `
      <p class="status-text">Press the button on your bridge, then continue.</p>
      ${this.error ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error)}</p>` : ''}
      <button type="button" class="btn btn-link" id="oc-change-address">Change address</button>
    `;
    body.querySelector('#oc-change-address').addEventListener('click', () => {
      this.phase = 'entry';
      this.error = null;
      this._render();
    });

    // No Back during an in-flight pairing attempt -- "Change address"
    // already covers "abandon this and go back," and a bare Back here
    // would suggest leaving mid-exchange is equally safe, which it isn't
    // (see Screen 1's CONNECTED-state design in WebUI_Design_2ndPass.md).
    renderNavFooter(footer, {
      showBack: false,
      onContinue: (e) => this._register(e.currentTarget),
    });
  }

  _renderConnected(body, footer) {
    body.innerHTML = `
      <p class="status-text">Connected to ${escapeHtml(this.bridgeAddress)}</p>
      <button type="button" class="btn btn-secondary" id="oc-change-bridge">Change bridge</button>
    `;
    body.querySelector('#oc-change-bridge').addEventListener('click', () => {
      this.phase = 'entry';
      this.error = null;
      this._render();
    });

    // Back and Continue both just leave without changing anything --
    // "Change bridge" is the only action here that mutates state.
    renderNavFooter(footer, {
      showBack: this.showBack,
      onBack: () => this.onBack(),
      onContinue: () => this.onComplete(),
    });
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
        await this._save();
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

  // Persists bridgeAddress/username/clientkey without an
  // entertainmentConfigurationId -- isConfigured() doesn't require one, and
  // the new Entertainment zone select screen PATCHes it on separately once
  // it knows which config the user picked.
  async _save() {
    try {
      const result = await (await fetch('/api/hue/connection', {
        method: 'POST',
        body: JSON.stringify({
          bridgeAddress: this.bridgeAddress,
          username: this.username,
          clientkey: this.clientkey,
        }),
      })).json();
      if (result.succeeded) {
        this.onComplete();
        return;
      }
      this.error = "Couldn't save the connection.";
    } catch {
      this.error = "Couldn't save the connection.";
    }
    this._render();
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
