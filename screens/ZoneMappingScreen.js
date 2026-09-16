// Zone Mapping: one canvas showing every zone's UV rect, a per-zone active
// checkbox always visible, and corner-drag + gamma editing for whichever
// zone is currently selected. Ported from huenicorn's real `ScreenWidget.js`
// (`Handle`/`Rectangle` classes, read in full -- see
// Analysis/WebUIAnalysis.md's Zone Mapping section and build-order step 15),
// with its two identified real gaps closed: Pointer Events instead of
// mouse-only events (touch support), and a native `<input type="range">`
// gamma slider instead of a second hand-rolled SVG drag control. A third
// gap not in the original research, found while porting: huenicorn's own
// `Handle.setPosition` only clamps to the screen's own bounds, not against
// the *opposite* corner -- dragging a corner past its sibling produces an
// inverted UV rect (min > max), which `ImageProcessing::getSubImage` has no
// defense against (an invalid `cv::Range`, a real crash risk server-side,
// confirmed by reading it, not assumed). This port clamps every drag to a
// minimum 2% rect size against the opposite corner instead.
//
// No active/inactive two-list panel (cut in the original plan): every
// zone's checkbox is always visible and editable regardless of selection,
// since Aurora's zone count is fixed by the capture scheme, not an
// open-ended bridge-light membership problem.
//
// The header's own "Save" button does not gate persistence -- every edit
// here (drag, checkbox, gamma) already PUTs immediately, matching
// huenicorn's own real save-on-every-setter feel and step 14's backend
// design (`Orchestrator::updateZone` persists unconditionally, with no
// staged/uncommitted concept at all). "Save" here just means "done editing,
// back to Dashboard" -- resolves an ambiguity the original spec's header
// line left open without saying so.
import { renderTopBar } from '../topBar.js';

const MIN_RECT_SIZE = 0.02; // 2% of the frame, in normalized UV units
const CORNERS = ['tl', 'tr', 'bl', 'br'];

export class ZoneMappingScreen {
  constructor(app, { onComplete, onBack, showBack = true }) {
    this.app = app;
    this.onComplete = onComplete;
    this.onBack = onBack ?? onComplete;
    this.showBack = showBack;
    this.outputName = '';
    this.zones = null; // null = not loaded yet
    this.selectedZoneId = null;
    this.error = null;
    this._pendingPatches = new Map();
    this._inFlightZoneIds = new Set();
  }

  async mount(container) {
    this.container = container;
    container.innerHTML = `
      <div class="top-bar-slot"></div>
      <div class="zm-body"></div>
    `;
    renderTopBar(container.querySelector('.top-bar-slot'), {
      title: 'Zone mapping',
      showBack: this.showBack,
      onBack: () => this.onBack(),
      onSettings: () => this.app.openSettings(),
    });

    await this._load();
  }

  unmount() {}

  async _load() {
    const body = this.container.querySelector('.zm-body');
    body.innerHTML = `<p class="status-text">Loading…</p>`;

    try {
      const result = await (await fetch('/api/zones')).json();
      this.outputName = result.outputName ?? '';
      this.zones = result.zones ?? [];
    } catch {
      this.zones = null;
      this.error = "Couldn't reach the daemon.";
    }

    this.selectedZoneId = null;
    this._render();
  }

  _render() {
    const body = this.container.querySelector('.zm-body');

    if (this.zones === null) {
      body.innerHTML = `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error ?? 'Something went wrong.')}</p>`;
      return;
    }

    if (!this.outputName) {
      body.innerHTML = `<p class="status-text">Zone mapping isn't available right now -- it needs an active output and Video mode.</p>`;
      return;
    }

    if (this.zones.length === 0) {
      body.innerHTML = `
        <p class="status-text">There are no zones available on this output yet.</p>
        <div class="zm-actions">
          <button type="button" class="btn btn-secondary" id="zm-refresh">Check again</button>
        </div>
      `;
      body.querySelector('#zm-refresh').addEventListener('click', () => this._load());
      return;
    }

    const selected = this.zones.find((z) => z.zoneId === this.selectedZoneId) ?? null;
    const errorHtml = this.error ? `<p class="status-text status-text-error">⚠ ${escapeHtml(this.error)}</p>` : '';

    body.innerHTML = `
      <div class="zm-canvas-wrap">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
        <div class="zm-overlay"></div>
      </div>
      ${selected ? '' : `<p class="zm-legend">Select a zone to edit its shape and gamma.</p>`}
      <div class="zm-selected-row" id="zm-selected-row"></div>
      ${errorHtml}
      <div class="zm-actions">
        <button type="button" class="btn btn-primary" id="zm-save">Save</button>
      </div>
    `;

    this._renderCanvas(body.querySelector('.zm-canvas-wrap'));
    if (selected) this._renderSelectedRow(body.querySelector('#zm-selected-row'), selected);

    body.querySelector('#zm-save').addEventListener('click', () => this.onComplete());
  }

  _renderCanvas(wrap) {
    const svg = wrap.querySelector('svg');
    const overlay = wrap.querySelector('.zm-overlay');
    svg.innerHTML = '';
    overlay.innerHTML = '';

    for (const zone of this.zones) {
      const isSelected = zone.zoneId === this.selectedZoneId;
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
    tag.innerHTML = `
      <span>${zone.zoneId}</span>
      <input type="checkbox" id="zm-active-${zone.zoneId}" ${zone.active ? 'checked' : ''} aria-label="Zone ${zone.zoneId} active" />
    `;
    tag.querySelector('span').addEventListener('click', () => this._selectZone(zone.zoneId));
    tag.querySelector('input').addEventListener('click', (e) => e.stopPropagation());
    tag.querySelector('input').addEventListener('change', (e) => {
      zone.active = e.currentTarget.checked;
      this._queueZonePatch(zone.zoneId, { active: zone.active });
    });
    overlay.appendChild(tag);
  }

  _renderSelectedRow(container, zone) {
    container.innerHTML = `
      <p class="status-text">Selected: Zone ${zone.zoneId}</p>
      ${this._sliderFieldHtml(zone)}
    `;
    const input = container.querySelector('#zm-gamma');
    const readout = container.querySelector('#zm-gamma-val');
    input.addEventListener('input', () => {
      zone.gamma = Number(input.value);
      readout.textContent = round1(zone.gamma).toFixed(1);
      this._queueZonePatch(zone.zoneId, { gamma: zone.gamma });
    });
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
    this.selectedZoneId = zoneId;
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

    this._queueZonePatch(zone.zoneId, { uvs: { min: [...min], max: [...max] } });
  }

  // Coalesces rapid updates (a drag can fire pointermove far faster than
  // once per network round trip) per zoneId: at most one PUT in flight per
  // zone, always eventually sending whatever's most recent rather than
  // queuing a backlog of stale intermediate frames.
  _queueZonePatch(zoneId, patch) {
    const existing = this._pendingPatches.get(zoneId) ?? {};
    this._pendingPatches.set(zoneId, { ...existing, ...patch });
    this._flushZonePatch(zoneId);
  }

  async _flushZonePatch(zoneId) {
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
      if (!result.succeeded) {
        this.error = "Couldn't save a zone edit.";
        this._render();
      }
    } catch {
      this.error = "Couldn't reach the daemon.";
      this._render();
    }

    this._inFlightZoneIds.delete(zoneId);
    if (this._pendingPatches.has(zoneId)) this._flushZonePatch(zoneId);
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

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
