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

const MIN_RECT_SIZE = 0.02; // 2% of the frame, in normalized UV units
const CORNERS = ['tl', 'tr', 'bl', 'br'];

export class ZoneCanvas {
  // zones: live zone array (mutated in place for immediate visual feedback
  // during a drag -- the caller's own array stays the one source of
  // truth, same as before extraction). onSelect(zoneId) fires whenever the
  // selected zone changes via a tag click or the dropdown (not during
  // construction -- read .selectedZoneId right after constructing for the
  // initial value). onError(message) fires on a failed PUT.
  constructor(container, { zones, selectedZoneId, zoneLabel, onSelect, onError }) {
    this.container = container;
    this.zones = zones;
    this.zoneLabel = zoneLabel;
    this.onSelect = onSelect;
    this.onError = onError;
    this.zoneDropdown = null;
    this._pendingPatches = new Map();
    this._inFlightZoneIds = new Set();

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
      this._drawZoneTag(overlay, zone);
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

    // Handles and the size readout render as plain HTML in the overlay, not
    // SVG shapes, and the label's vertical position is computed in real
    // pixels rather than viewBox units -- the SVG's own viewBox stretches
    // non-uniformly to fill a 16:9 box (correct for the zone rect itself,
    // which should always fill the box edge-to-edge), but that same stretch
    // silently distorts any *fixed-size* shape or text drawn in its
    // coordinate space: a circle comes out an ellipse, text comes out
    // squished. Confirmed via a real Chromium render for step 19's QA pass
    // (jsdom never lays out SVG at all, so nothing here could have caught
    // it) -- a `.zm-handle` measured ~24x14px instead of a circle.
    const bounds = svg.getBoundingClientRect();
    const sizeLabel = document.createElement('div');
    sizeLabel.className = 'zm-size-label';
    sizeLabel.style.left = `${(min[0] + max[0]) * 50}%`;
    _positionSizeLabel(sizeLabel, min[1], bounds.height);
    sizeLabel.textContent = `${round1((max[0] - min[0]) * 100)}% x ${round1((max[1] - min[1]) * 100)}%`;
    overlay.appendChild(sizeLabel);

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
      handles[corner].addEventListener('pointerdown', (e) => this._startDrag(e, svg, zone, corner, rect, sizeLabel, handles));
    }
  }

  _drawZoneTag(overlay, zone) {
    const { min, max } = zone.uvs;
    const tag = document.createElement('div');
    tag.className = 'zm-zone-tag';
    tag.style.left = `${(min[0] + max[0]) * 50}%`;
    tag.style.top = `${(min[1] + max[1]) * 50}%`;
    tag.innerHTML = `<span>${zone.zoneId}</span>`;
    tag.querySelector('span').addEventListener('click', () => this._selectZone(zone.zoneId));
    overlay.appendChild(tag);
  }

  _renderSelectedRow(container, zone) {
    container.innerHTML = `
      <div class="field zm-zone-field">
        <label class="field-label" id="zc-zone-label">Zone</label>
        <div id="zc-zone-dropdown-slot"></div>
      </div>
      ${this._sliderFieldHtml(zone)}
    `;
    this._renderZoneDropdown(container.querySelector('#zc-zone-dropdown-slot'), zone);

    const input = container.querySelector('#zm-gamma');
    const readout = container.querySelector('#zm-gamma-val');
    input.addEventListener('input', () => {
      zone.gamma = Number(input.value);
      readout.textContent = round1(zone.gamma).toFixed(1);
      this._queuePatch(zone.zoneId, { gamma: zone.gamma });
    });
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
        <input type="range" class="slider-input" id="zm-gamma" min="-1" max="1" step="0.1" value="${zone.gamma}" />
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
  _startDrag(event, svg, zone, corner, rect, sizeLabel, handles) {
    event.preventDefault();
    const handle = handles[corner];
    handle.setPointerCapture(event.pointerId);

    const onMove = (e) => this._dragTo(svg, zone, corner, rect, sizeLabel, handles, e.clientX, e.clientY);
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);

    this._dragTo(svg, zone, corner, rect, sizeLabel, handles, event.clientX, event.clientY);
  }

  _dragTo(svg, zone, corner, rect, sizeLabel, handles, clientX, clientY) {
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
    sizeLabel.style.left = `${(min[0] + max[0]) * 50}%`;
    _positionSizeLabel(sizeLabel, min[1], bounds.height);
    sizeLabel.textContent = `${round1((max[0] - min[0]) * 100)}% x ${round1((max[1] - min[1]) * 100)}%`;

    for (const c of CORNERS) {
      const [cx, cy] = _cornerPoint(c, min, max);
      handles[c].style.left = `${cx * 100}%`;
      handles[c].style.top = `${cy * 100}%`;
    }

    this._queuePatch(zone.zoneId, { uvs: { min: [...min], max: [...max] } });
  }

  // Coalesces rapid updates (a drag can fire pointermove far faster than
  // once per network round trip) per zoneId: at most one PUT in flight per
  // zone, always eventually sending whatever's most recent rather than
  // queuing a backlog of stale intermediate frames.
  _queuePatch(zoneId, patch) {
    const existing = this._pendingPatches.get(zoneId) ?? {};
    this._pendingPatches.set(zoneId, { ...existing, ...patch });
    this._flushPatch(zoneId);
  }

  async _flushPatch(zoneId) {
    if (this._inFlightZoneIds.has(zoneId)) return;

    const patch = this._pendingPatches.get(zoneId);
    if (!patch) return;
    this._pendingPatches.delete(zoneId);
    this._inFlightZoneIds.add(zoneId);

    try {
      const result = await (await fetch('/api/zones', {
        method: 'PUT',
        body: JSON.stringify({ zoneId, ...patch }),
      })).json();
      if (!result.succeeded) this.onError?.("Couldn't save a zone edit.");
    } catch {
      this.onError?.("Couldn't reach the daemon.");
    }

    this._inFlightZoneIds.delete(zoneId);
    if (this._pendingPatches.has(zoneId)) this._flushPatch(zoneId);
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

// Prefers sitting just above the rect's own top edge (matching the label's
// job: a caption for the shape below it), but flips to just inside the top
// edge instead once the rect is close enough to the canvas's own top that
// "above" would push the label past overflow:hidden and clip it entirely --
// the label has no natural height to measure before it's painted, so this
// uses a fixed px threshold generous enough for its own ~11px text.
function _positionSizeLabel(sizeLabel, minV, boundsHeight) {
  const topPx = minV * boundsHeight;
  if (topPx > 16) {
    sizeLabel.style.top = `${topPx - 4}px`;
    sizeLabel.style.transform = 'translate(-50%, -100%)';
  } else {
    sizeLabel.style.top = `${topPx + 4}px`;
    sizeLabel.style.transform = 'translate(-50%, 0)';
  }
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
