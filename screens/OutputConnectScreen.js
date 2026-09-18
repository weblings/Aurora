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
// Four phases: checking (silent, no UI to speak of -- resolving discovery
// before deciding whether entry is even needed) -> entry (address +
// Autodetect, shown only when checking couldn't resolve to one unambiguous,
// validated bridge) -> pairing (push-link wait, huenicorn's real
// click-to-retry model, not a client-side poll loop -- see
// ApiTools/PairingRoutes' register endpoint) -> connected (already paired,
// reached via mount()'s own saved-state check, not just a same-session
// "done" -- fixes the original bug where mount() always rendered the blank
// entry form regardless of already-saved state, dropping Back into a
// re-pairing flow it never asked for). "checking" auto-advances straight to
// pairing when discovery finds exactly one bridge and it validates -- the
// entry form only exists as a fallback for 0 or 2+ bridges found, discovery
// itself failing, or that bridge failing validation; "Change address" on the
// pairing screen is the same fallback's escape hatch for a case "checking"
// got unambiguously (and wrongly) confident about. Entertainment
// configuration selection is no longer this screen's job at all -- the new
// "Entertainment zone select" screen owns it, PATCHing
// entertainmentConfigurationId onto the connection this screen already
// saved (isConfigured() doesn't require it -- confirmed in
// CredentialsStoreTests.cpp). A successful pairing here already persists
// bridgeAddress/username/clientkey and calls onComplete() directly; no
// local config-select/done phase to skip past.
import { renderTopBar } from '../topBar.js';
import { renderNavFooter } from '../NavFooter.js';
import { applyTooltip } from '../Tooltips.js';

export class OutputConnectScreen {
  // discoveryPromise: an already-in-flight /api/hue/discover result, handed
  // in by whichever screen preceded this one (e.g. Welcome, which starts
  // discovery while the user is still reading its own copy) so mount()
  // doesn't have to wait out a fresh round-trip. Optional -- every other
  // call site (Dashboard's "Change bridge", etc.) omits it and this screen
  // just runs its own discovery exactly as before.
  //
  // startAtEntry: skips the "connected" phase's own confirmation screen
  // (Connected to X / [Change bridge]) even when a connection is already
  // configured -- for callers whose own button already means "change the
  // bridge" (Dashboard's), where that confirmation is just a second
  // "Change bridge" click standing between the button and the address form
  // it should have opened directly. The "connected" phase itself still
  // exists for a real use case (e.g. Back from a later onboarding step,
  // which hasn't already declared this intent) -- this flag doesn't remove
  // it, just opts a specific caller out of it.
  constructor(app, { onComplete, onBack, showBack = true, discoveryPromise = null, startAtEntry = false }) {
    this.app = app;
    this.onComplete = onComplete;
    this.onBack = onBack ?? onComplete;
    this.showBack = showBack;
    this.discoveryPromise = discoveryPromise;
    this.startAtEntry = startAtEntry;
    this.phase = 'entry'; // 'checking' | 'entry' | 'pairing' | 'connected'
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
    });

    // Checks saved state before rendering anything -- the actual fix for
    // Back dropping into a blank re-pairing form regardless of an already-
    // saved connection (WebUI_Fixes.md's Back-button task).
    try {
      const connection = await (await fetch('/api/hue/connection')).json();
      if (connection.bridgeAddress) this.bridgeAddress = connection.bridgeAddress;
      if (connection.configured && !this.startAtEntry) this.phase = 'connected';
    } catch {
      // No persisted connection yet, or the probe failed -- entry starts blank either way.
    }

    // Only for a genuinely fresh entry (no already-known/persisted address),
    // and only here in mount(), not on every return to the entry phase
    // (Change address/Change bridge already have their own explicit
    // re-detect via the button).
    if (this.phase === 'entry' && !this.bridgeAddress) {
      this.phase = 'checking';
      this._render();
      await this._autoAdvance();
      return;
    }

    this._render();
  }

  unmount() {}

  _render() {
    const body = this.container.querySelector('.oc-body');
    const footer = this.container.querySelector('.nav-footer-slot');

    if (this.phase === 'checking') this._renderChecking(body);
    else if (this.phase === 'entry') this._renderEntry(body, footer);
    else if (this.phase === 'pairing') this._renderPairing(body, footer);
    else this._renderConnected(body, footer);
  }

  // No footer -- matches ZoneMappingScreen._load()'s bare "Loading…" convention
  // for a state with nothing yet to act on.
  _renderChecking(body) {
    body.innerHTML = `<p class="status-text">Looking for your bridge…</p>`;
  }

  _renderEntry(body, footer) {
    body.innerHTML = `
      <div class="oc-address-row">
        <div class="field">
          <label class="field-label" for="oc-address-input">Bridge address</label>
          <input id="oc-address-input" class="text-input" type="text" placeholder="192.168.1.42" />
        </div>
        <button type="button" class="btn btn-secondary" id="oc-autodetect">Autodetect</button>
      </div>
      ${this.error ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error)}</p>` : ''}
    `;

    const input = body.querySelector('#oc-address-input');
    input.value = this.bridgeAddress;
    applyTooltip(input, 'output.hue.bridgeAddress');
    input.addEventListener('input', () => {
      this.bridgeAddress = input.value;
    });

    applyTooltip(body.querySelector('#oc-autodetect'), 'output.hue.autodetect');
    body.querySelector('#oc-autodetect').addEventListener('click', (e) => this._autodetect(e.currentTarget));

    renderNavFooter(footer, {
      showBack: this.showBack,
      onBack: () => this.onBack(),
      onContinue: (e) => this._validateAndPair(e.currentTarget),
    });
  }

  _renderPairing(body, footer) {
    body.innerHTML = `
      <div class="text-pair">
        <p class="text-primary">Press the button on your bridge</p>
        <p class="text-secondary">then Continue</p>
      </div>
      ${this.error ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error)}</p>` : ''}
    `;

    // "Wrong Bridge?" (still this.phase = 'entry' underneath, same as
    // before) lives in NavFooter's own Back slot now, not a standalone
    // link -- matches the mockup's matched-weight button pair. Not a real
    // "leave this screen" Back (that still doesn't exist during an
    // in-flight pairing attempt -- a bare Back here would suggest leaving
    // mid-exchange is equally safe, which it isn't, see Screen 1's
    // CONNECTED-state design in WebUI_Design_2ndPass.md) -- it just resets
    // this same screen back to the entry phase.
    renderNavFooter(footer, {
      showBack: true,
      backLabel: 'Wrong Bridge?',
      backIcon: false, // not a real Back -- no arrow, same reason as above
      onBack: () => {
        this.phase = 'entry';
        this.error = null;
        this._render();
      },
      onContinue: (e) => this._register(e.currentTarget),
    });
  }

  _renderConnected(body, footer) {
    body.innerHTML = `
      <p class="status-text">Connected to ${escapeHtml(this.bridgeAddress)}</p>
      <button type="button" class="btn btn-secondary" id="oc-change-bridge">Change bridge</button>
    `;
    applyTooltip(body.querySelector('#oc-change-bridge'), 'output.hue.changeBridge');
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

  // The "checking" phase's own logic, run once from mount() -- resolves
  // discovery (using discoveryPromise if Welcome already started one,
  // otherwise fetching fresh) and only auto-advances straight to pairing
  // when it found exactly one bridge *and* that bridge validates. Anything
  // less certain (0 or 2+ bridges, discovery failing outright, or a failed
  // validation) falls back to the entry form instead of a dead end -- so a
  // wrong guess on an ambiguous multi-bridge LAN never happens, only a
  // skipped form on the unambiguous single-bridge case most users are in.
  async _autoAdvance() {
    let bridges = [];
    try {
      const result = await (this.discoveryPromise ?? fetch('/api/hue/discover').then((r) => r.json()));
      if (result.succeeded && Array.isArray(result.bridges)) bridges = result.bridges;
    } catch {
      // Falls through to the entry form below.
    }

    if (bridges.length === 1 && bridges[0].internalipaddress) {
      const address = bridges[0].internalipaddress;
      if (await this._validate(address)) {
        this.bridgeAddress = address;
        this.phase = 'pairing';
        this._render();
        await this._register();
        return;
      }
    }

    this.phase = 'entry';
    this._render();
  }

  async _autodetect(button) {
    button.disabled = true;
    this.error = null;

    let address = null;
    let failureMessage = null;
    try {
      const result = await (await fetch('/api/hue/discover')).json();
      if (result.succeeded && Array.isArray(result.bridges) && result.bridges.length > 0) {
        address = result.bridges[0].internalipaddress;
        if (!address) failureMessage = 'Autodetect found a bridge but no usable address.';
      } else {
        failureMessage = result.error || 'No bridges found on this network.';
      }
    } catch {
      failureMessage = 'Could not reach the discovery service.';
    }

    if (address) this.bridgeAddress = address;
    else this.error = failureMessage;

    button.disabled = false;
    this._render();
  }

  // Shared by _autoAdvance and _validateAndPair -- just the raw yes/no of
  // whether /api/hue/validate confirmed a real bridge there. Each caller
  // decides how to surface a failure for its own context (silent fallback
  // to the entry form vs. an error message on it).
  async _validate(address) {
    try {
      const result = await (await fetch('/api/hue/validate', {
        method: 'PUT',
        body: JSON.stringify({ bridgeAddress: address }),
      })).json();
      return result.succeeded === true;
    } catch {
      return false;
    }
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
    if (!(await this._validate(address))) {
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
