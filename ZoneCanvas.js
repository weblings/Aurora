// Zone shape editing: SVG rects for every zone's UV bounds, drag handles +
// a gamma slider for whichever zone is currently selected (tag click or
// the zone dropdown), pulled out of ZoneMappingScreen.js so both the
// Dashboard's video top tier and the onboarding "Zone Mapping (customize)"
// screen (Analysis/WebUI/WebUI_Design_2ndPass.md) can compose the same
// canvas without duplicating the drag math. zoneLabel(zone) is injected
// rather than computed here -- this component knows nothing about Hue
// channel/light names.
//
// Ported drag behavior/comments preserved from the original
// ZoneMappingScreen.js (huenicorn's real ScreenWidget.js gaps closed:
// Pointer Events, native range slider, opposite-corner clamping -- see
// Analysis/WebUI/WebUI_Design_1stPass.md's Zone Mapping section).
import { Dropdown } from './Dropdown.js';
import { ZonePatchQueue } from './ZonePatchQueue.js';
import { bindSliderFill } from './SliderFill.js';
import { applyTooltip } from './Tooltips.js';

const MIN_RECT_SIZE = 0.02; // 2% of the frame, in normalized UV units
const CORNERS = ['tl', 'tr', 'bl', 'br'];

export class ZoneCanvas {
  // zones: live zone array (mutated in place for immediate visual feedback
  // during a drag -- the caller's own array stays the one source of
  // truth, same as before extraction). onSelect(zoneId) fires whenever the
  // selected zone changes via a tag click or the dropdown (not during
  // construction -- read .selectedZoneId right after constructing for the
  // initial value). onError(message) fires on a failed PUT. onSeeAllZones,
  // when given, renders a "See all zones" link grouped with the "Zone"
  // label (2.5 pass) -- optional and re-wired on every render (this row is
  // torn down and rebuilt on every zone selection) so the onboarding Zone
  // Mapping screen, which has no such link, can omit it entirely.
  // renderActive, when true, adds Active as a third column in the same row
  // (2.5 pass) instead of leaving it to the caller -- also opt-in and
  // default false, so the onboarding screen (out of scope this pass) keeps
  // its own separate always-visible Active section unchanged. Persists
  // through the same _queue as gamma/uvs, not a separate callback -- an
  // Active flip has no side effect any caller needs to react to beyond
  // persistence, same as gamma.
  constructor(container, { zones, selectedZoneId, zoneLabel, onSelect, onError, onSeeAllZones, renderActive = false }) {
    this.container = container;
    this.zones = zones;
    this.zoneLabel = zoneLabel;
    this.onSelect = onSelect;
    this.onSeeAllZones = onSeeAllZones;
    this.renderActive = renderActive;
    this.zoneDropdown = null;
    this._queue = new ZonePatchQueue({ onError });

    const initial = zones.find((z) => z.zoneId === selectedZoneId) ?? zones[0];
    this._selectedZoneId = initial.zoneId;

    this._render();
  }

  get selectedZoneId() {
    return this._selectedZoneId;
  }

  _render() {
    this.zoneDropdown?.destroy();
    this.zoneDropdown = null;

    this.container.innerHTML = `
      <div class="zm-canvas-wrap">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
        <div class="zm-overlay"></div>
      </div>
      <div class="zm-selected-row" id="zc-selected-row"></div>
    `;

    const selected = this.zones.find((z) => z.zoneId === this._selectedZoneId) ?? this.zones[0];
    this._selectedZoneId = selected.zoneId;

    this._renderShapes(this.container.querySelector('.zm-canvas-wrap'));
    this._renderSelectedRow(this.container.querySelector('#zc-selected-row'), selected);
  }

  _renderShapes(wrap) {
    const svg = wrap.querySelector('svg');
    const overlay = wrap.querySelector('.zm-overlay');
    svg.innerHTML = '';
    overlay.innerHTML = '';

    // Selected zone paints last (on top, stable sort keeps the rest in
    // order) so picking it from the dropdown always brings its shape and
    // handles within reach, even when another zone's rect covers the same
    // region -- see WebUI/WebUI_Fixes.md's Zone Mapping follow-up section.
    const ordered = [...this.zones].sort((a, b) => (a.zoneId === this._selectedZoneId ? 1 : 0) - (b.zoneId === this._selectedZoneId ? 1 : 0));

    for (const zone of ordered) {
      const isSelected = zone.zoneId === this._selectedZoneId;
      this._drawZoneRect(svg, overlay, zone, isSelected);
      this._drawZoneNumber(overlay, zone, isSelected);
    }
  }

  _drawZoneRect(svg, overlay, zone, isSelected) {
    const { min, max } = zone.uvs;
    const rect = _svg('rect', {
      class: `zm-zone-rect${isSelected ? ' selected' : ''}`,
      x: min[0] * 100, y: min[1] * 100,
      width: (max[0] - min[0]) * 100, height: (max[1] - min[1]) * 100,
    });
    svg.appendChild(rect);

    if (!isSelected) {
      rect.style.cursor = 'pointer';
      rect.addEventListener('pointerdown', () => this._selectZone(zone.zoneId));
      return;
    }

    // Handles render as plain HTML in the overlay, not SVG shapes -- the
    // SVG's own viewBox stretches non-uniformly to fill a 16:9 box (correct
    // for the zone rect itself, which should always fill the box edge-to-
    // edge), but that same stretch silently distorts any *fixed-size* shape
    // drawn in its coordinate space into an ellipse. Confirmed via a real
    // Chromium render for step 19's QA pass (jsdom never lays out SVG at
    // all, so nothing here could have caught it) -- a `.zm-handle` measured
    // ~24x14px instead of a circle.
    const handles = {};
    for (const corner of CORNERS) {
      const [cx, cy] = _cornerPoint(corner, min, max);
      const handle = document.createElement('div');
      handle.className = 'zm-handle';
      handle.style.left = `${cx * 100}%`;
      handle.style.top = `${cy * 100}%`;
      overlay.appendChild(handle);
      handles[corner] = handle;
    }
    for (const corner of CORNERS) {
      handles[corner].addEventListener('pointerdown', (e) => this._startDrag(e, svg, zone, corner, rect, handles));
    }
  }

  // Plain text, no badge/background (2.5 pass) -- pointer-events: none (see
  // zone-mapping.css) so a click here always falls through to the zone
  // rect underneath instead of needing its own separate select handler,
  // same click target every other point in the rect already uses.
  _drawZoneNumber(overlay, zone, isSelected) {
    const { min, max } = zone.uvs;
    const number = document.createElement('div');
    number.className = `zm-zone-number${isSelected ? ' selected' : ''}`;
    number.style.left = `${(min[0] + max[0]) * 50}%`;
    number.style.top = `${(min[1] + max[1]) * 50}%`;
    number.textContent = zone.zoneId;
    overlay.appendChild(number);
  }

  _renderSelectedRow(container, zone) {
    const seeAllHtml = this.onSeeAllZones
      ? `<button type="button" class="btn btn-link" id="zc-see-all-zones">See all zones &rarr;</button>`
      : '';
    container.innerHTML = `
      <div class="field zm-zone-field">
        <div class="zm-zone-label-row">
          <label class="field-label" id="zc-zone-label">Zone</label>
          ${seeAllHtml}
        </div>
        <div id="zc-zone-dropdown-slot"></div>
      </div>
      ${this.renderActive ? this._activeFieldHtml(zone) : ''}
      ${this._sliderFieldHtml(zone)}
    `;
    this._renderZoneDropdown(container.querySelector('#zc-zone-dropdown-slot'), zone);
    applyTooltip(container.querySelector('label[for="zm-gamma"]'), 'zones.gamma');
    applyTooltip(container.querySelector('.zm-active-field-col .field-label'), 'zones.active');
    if (this.onSeeAllZones) {
      container.querySelector('#zc-see-all-zones').addEventListener('click', () => this.onSeeAllZones());
    }

    if (this.renderActive) {
      container.querySelector('#zc-active-toggle').addEventListener('change', (e) => {
        zone.active = e.currentTarget.checked;
        this._queue.queue(zone.zoneId, { active: zone.active });
      });
    }

    const input = container.querySelector('#zm-gamma');
    const readout = container.querySelector('#zm-gamma-val');
    bindSliderFill(input);
    input.addEventListener('input', () => {
      zone.gamma = Number(input.value);
      readout.textContent = round1(zone.gamma).toFixed(1);
      this._queue.queue(zone.zoneId, { gamma: zone.gamma });
    });
  }

  _activeFieldHtml(zone) {
    return `
      <div class="field zm-active-field-col">
        <label class="field-label">Active</label>
        <div class="zm-control-band">
          <label class="toggle-switch">
            <input type="checkbox" id="zc-active-toggle" ${zone.active ? 'checked' : ''} />
            <span class="toggle-knob"></span>
          </label>
        </div>
      </div>
    `;
  }

  _renderZoneDropdown(slot, selectedZone) {
    this.zoneDropdown = new Dropdown(
      slot,
      this.zoneLabel(selectedZone),
      (value) => this._selectZone(value),
      { labelId: 'zc-zone-label', fill: true },
    );
    this.zoneDropdown.setOptions(this.zones.map((z) => ({
      label: this.zoneLabel(z),
      value: z.zoneId,
      selected: z.zoneId === selectedZone.zoneId,
    })));
  }

  _sliderFieldHtml(zone) {
    return `
      <div class="field">
        <div class="slider-field-header">
          <label class="field-label" for="zm-gamma">Gamma</label>
          <span class="slider-value" id="zm-gamma-val">${round1(zone.gamma).toFixed(1)}</span>
        </div>
        <div class="zm-control-band">
          <input type="range" class="slider-input" id="zm-gamma" min="-1" max="1" step="0.1" value="${zone.gamma}" />
        </div>
      </div>
    `;
  }

  _selectZone(zoneId) {
    this._selectedZoneId = zoneId;
    this.onSelect?.(zoneId);
    this._render();
  }

  // Corner drag: setPointerCapture keeps pointermove/up delivered to the
  // handle itself even once the pointer leaves it, so no document-level
  // listener needs adding/removing across renders (unlike huenicorn's own
  // mouse-event version, which attaches a document "mouseup" once and
  // never removes it).
  _startDrag(event, svg, zone, corner, rect, handles) {
    event.preventDefault();
    const handle = handles[corner];
    handle.setPointerCapture(event.pointerId);

    const onMove = (e) => this._dragTo(svg, zone, corner, rect, handles, e.clientX, e.clientY);
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);

    this._dragTo(svg, zone, corner, rect, handles, event.clientX, event.clientY);
  }

  _dragTo(svg, zone, corner, rect, handles, clientX, clientY) {
    const bounds = svg.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;

    let u = clamp01((clientX - bounds.left) / bounds.width);
    let v = clamp01((clientY - bounds.top) / bounds.height);

    const { min, max } = zone.uvs;
    const isLeft = corner === 'tl' || corner === 'bl';
    const isTop = corner === 'tl' || corner === 'tr';

    if (isLeft) u = Math.min(u, max[0] - MIN_RECT_SIZE);
    else u = Math.max(u, min[0] + MIN_RECT_SIZE);
    if (isTop) v = Math.min(v, max[1] - MIN_RECT_SIZE);
    else v = Math.max(v, min[1] + MIN_RECT_SIZE);

    if (isLeft) min[0] = clamp01(u); else max[0] = clamp01(u);
    if (isTop) min[1] = clamp01(v); else max[1] = clamp01(v);

    rect.setAttribute('x', min[0] * 100);
    rect.setAttribute('y', min[1] * 100);
    rect.setAttribute('width', (max[0] - min[0]) * 100);
    rect.setAttribute('height', (max[1] - min[1]) * 100);

    for (const c of CORNERS) {
      const [cx, cy] = _cornerPoint(c, min, max);
      handles[c].style.left = `${cx * 100}%`;
      handles[c].style.top = `${cy * 100}%`;
    }

    this._queue.queue(zone.zoneId, { uvs: { min: [...min], max: [...max] } });
  }

  // Call before discarding an instance (e.g. before a full-container
  // innerHTML rebuild) so its internal Dropdown doesn't linger.
  destroy() {
    this.zoneDropdown?.destroy();
    this.zoneDropdown = null;
  }
}

function _svg(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function _cornerPoint(corner, min, max) {
  switch (corner) {
    case 'tl': return [min[0], min[1]];
    case 'tr': return [max[0], min[1]];
    case 'bl': return [min[0], max[1]];
    case 'br': return [max[0], max[1]];
    default: return [min[0], min[1]];
  }
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}
