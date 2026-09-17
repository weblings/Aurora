// Plain, non-interactive list of a config's channel/light names -- the
// "here's what's in this config" moment on the new onboarding
// "Entertainment zone select" screen (Analysis/WebUI/
// WebUI_Design_2ndPass.md). No dropdown, no toggles -- unlike
// ZoneMappingScreen's own zone dropdown/active list, nothing here is
// editable, so it needs neither `Dropdown.js` (implies selection) nor
// `.toggle-row` (implies editability).
//
// load() (fetch) and mount() (draw) are split the same way
// EntertainmentConfigSelect's are, for the same reason: a caller whose own
// DOM gets fully rebuilt on render shouldn't have to re-fetch just to
// redraw the same already-known data.
export class ChannelList {
  constructor() {
    this.channels = null; // null = not loaded yet
  }

  // Fetches /api/hue/channels -- reflects whichever entertainment config is
  // currently persisted (the same source ZoneMappingScreen's own zone
  // labels already use), so a caller should load() again after switching
  // configs via EntertainmentConfigSelect's onChange.
  async load() {
    try {
      const result = await (await fetch('/api/hue/channels')).json();
      this.channels = result.succeeded ? result.channels : [];
    } catch {
      this.channels = [];
    }

    return this.channels;
  }

  // Draws into the given container using whatever load() already fetched.
  mount(container) {
    this.container = container;
    const channels = this.channels ?? [];

    if (channels.length === 0) {
      this.container.innerHTML = `<p class="status-text">No channel information available yet.</p>`;
      return;
    }

    this.container.innerHTML = `
      <ul class="channel-list">
        ${channels.map((c) => `<li class="channel-list-item">${escapeHtml(_channelLabel(c))}</li>`).join('')}
      </ul>
    `;
  }
}

// Same "Zone N (light names)" format ZoneMappingScreen's own _zoneLabel
// uses, for a consistent name between the onboarding preview and the real
// editing screen it leads into.
function _channelLabel(channel) {
  return channel.lightNames?.length ? `Zone ${channel.channelId} (${channel.lightNames.join(', ')})` : `Zone ${channel.channelId}`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
