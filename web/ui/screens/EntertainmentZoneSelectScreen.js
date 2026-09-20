// Entertainment zone select: the new Screen 2 of the onboarding sequence
// (docs/WebUI/WebUI_Design_2ndPass.md) -- picks which entertainment
// config to use and shows what's in it (ChannelList), before Mode+Device or
// Zone Mapping ever run. Composes EntertainmentConfigSelect (owns the
// dropdown + persists the pick via POST /api/hue/connection, hidden
// entirely at exactly one config) and ChannelList (the plain, read-only
// preview) rather than duplicating either's fetch/render logic.
//
// The "zero entertainment configurations" case migrated here from
// OutputConnectScreen's old configSelect phase -- config selection is
// entirely this screen's job now, so this is its rightful new home.
//
// Test Pulse omitted for now (WebUI_Fixes.md's Pass 2 section) -- a nice-
// to-have visual confirmation step, not load-bearing for onboarding, and a
// live pass found it unreliable even after fixing the entertainment-rid/
// light-rid mismatch underneath it. The backend route (POST
// /api/hue/test-pulse) is untouched; only this screen's own button is gone.
import { renderTopBar } from '../topBar.js';
import { renderNavFooter } from '../NavFooter.js';
import { EntertainmentConfigSelect } from '../EntertainmentConfigSelect.js';
import { ChannelList } from '../ChannelList.js';

export class EntertainmentZoneSelectScreen {
  constructor(app, { onComplete, onBack, showBack = true }) {
    this.app = app;
    this.onComplete = onComplete;
    this.onBack = onBack ?? onComplete;
    this.showBack = showBack;
    this.entertainmentConfigSelect = new EntertainmentConfigSelect({
      onChange: () => this._reload(),
      onError: (message) => { this.error = message; this._render(); },
    });
    this.channelList = new ChannelList();
    this.error = null;
  }

  async mount(container) {
    this.container = container;
    container.innerHTML = `
      <div class="top-bar-slot"></div>
      <div class="ezs-body"></div>
      <div class="nav-footer-slot"></div>
    `;
    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: 'Choose your lights',
      showBack: false,
    });

    await this._reload();
  }

  unmount() {
    this.entertainmentConfigSelect.destroy();
  }

  async _reload() {
    this.error = null;
    await this.entertainmentConfigSelect.load();
    await this.channelList.load();
    this._render();
  }

  _render() {
    const body = this.container.querySelector('.ezs-body');
    const footer = this.container.querySelector('.nav-footer-slot');
    const configs = this.entertainmentConfigSelect.configs ?? [];

    if (configs.length === 0) {
      body.innerHTML = `
        <p class="status-text status-text-error">No entertainment configurations found. Create one in the official Hue app first, then check again.</p>
        <button type="button" class="btn btn-secondary" id="ezs-refresh">Check again</button>
      `;
      body.querySelector('#ezs-refresh').addEventListener('click', () => this._reload());

      renderNavFooter(footer, { showBack: this.showBack, onBack: () => this.onBack(), onContinue: () => this.onComplete() });
      footer.querySelector('.nav-footer-continue').disabled = true;
      return;
    }

    const selected = this.entertainmentConfigSelect.getSelected();
    const usingLabelHtml = configs.length === 1 && selected
      ? `<p class="status-text">Using: <strong>${escapeHtml(selected.name)}</strong></p>`
      : '';
    const errorHtml = this.error ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error)}</p>` : '';

    body.innerHTML = `
      <div id="ezs-config-slot"></div>
      ${usingLabelHtml}
      <div id="ezs-channel-list-slot"></div>
      ${errorHtml}
    `;

    this.entertainmentConfigSelect.mount(body.querySelector('#ezs-config-slot'));
    this.channelList.mount(body.querySelector('#ezs-channel-list-slot'));

    renderNavFooter(footer, {
      showBack: this.showBack,
      onBack: () => this.onBack(),
      onContinue: () => this.onComplete(),
    });
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
