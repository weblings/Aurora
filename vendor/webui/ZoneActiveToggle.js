// Two views over the same "which zones are active" data (Analysis/WebUI/
// WebUI_Design_2ndPass.md): a flat list of every zone (Bridge's collapsed
// "See all zones" content, extracted from ZoneMappingScreen.js's original
// always-visible active list) and a single zone's bool (Zone Mapping's/
// Dashboard's top tier, tied to whichever zone is "currently selected"
// elsewhere -- destroy and recreate when that selection changes, same
// convention every component here uses). Both PUT through the same
// ZonePatchQueue ZoneCanvas already uses, since active flips can outrace a
// network round trip the same way a drag's pointermove stream can.
import { ZonePatchQueue } from './ZonePatchQueue.js';
import { applyTooltip } from './Tooltips.js';

// Decoupled from shape editing entirely (WebUI/WebUI_Fixes.md's Zone
// Mapping follow-up): a flat toggle list, not tied to which zone is
// selected, and not huenicorn's two-column drag-and-drop, which solves a
// different (open-ended bridge-light membership) problem Aurora doesn't
// have -- Aurora's zone count is fixed.
export class ZoneActiveToggleList {
  // zones: live zone array (mutated in place, same convention as
  // ZoneCanvas). zoneLabel(zone) is injected -- this component knows
  // nothing about Hue channel/light names.
  constructor(container, { zones, zoneLabel, onError, tooltipKey = null }) {
    this.container = container;
    this.zones = zones;
    this.zoneLabel = zoneLabel;
    this.tooltipKey = tooltipKey;
    this._queue = new ZonePatchQueue({ onError });
    this._render();
  }

  _render() {
    this.container.innerHTML = this.zones.map((zone) => `
      <label class="toggle-row zm-active-toggle">
        <span class="toggle-row-label">${escapeHtml(this.zoneLabel(zone))}</span>
        <span class="toggle-switch">
          <input type="checkbox" data-zone-id="${zone.zoneId}" ${zone.active ? 'checked' : ''} />
          <span class="toggle-knob"></span>
        </span>
      </label>
    `).join('');

    // Title on the row itself (not the text span) so hovering the label,
    // the checkbox, or the space between shows the tooltip.
    this.container.querySelectorAll('label.toggle-row').forEach((row) => {
      applyTooltip(row, this.tooltipKey);
    });

    this.container.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener('change', (e) => {
        const zoneId = Number(e.currentTarget.dataset.zoneId);
        const zone = this.zones.find((z) => z.zoneId === zoneId);
        zone.active = e.currentTarget.checked;
        this._queue.queue(zoneId, { active: zone.active });
      });
    });
  }
}

export class ZoneActiveToggleSingle {
  constructor(container, { zone, onError }) {
    this.container = container;
    this.zone = zone;
    this._queue = new ZonePatchQueue({ onError });
    this._render();
  }

  _render() {
    this.container.innerHTML = `
      <label class="toggle-switch zat-single-toggle">
        <input type="checkbox" ${this.zone.active ? 'checked' : ''} />
        <span class="toggle-knob"></span>
      </label>
    `;

    this.container.querySelector('input').addEventListener('change', (e) => {
      this.zone.active = e.currentTarget.checked;
      this._queue.queue(this.zone.zoneId, { active: this.zone.active });
    });
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
