// The Dashboard's effect control (Aurora-kep2.8): one full-width trigger and a non-modal panel
// holding Built-in, Custom and Hidden groups as buttons (Aurora-kep2.15: VoiceOver on iOS drops
// role=tree). Spec: kep2.2 design field, frame 8 of Static_kep2_Mocks, kep2.6 for row menus.
// Rows commit on Enter, Space or click and arrows only move focus between rows. Tooltips and row
// menus live in the panel outside the scroll region, placed under their row.
// Outside changes patch rows in place by effect id (update), never close or rebuild the panel.
import { effectTitle } from './CaptureSource.js';
import { applyTooltip } from './Tooltips.js';
import {
  actionAnnouncement, buildGroups, clipTitle, diffEffects, flatItems, focusAfterRemoval, menuItems, positionIn,
  rowItems, rowKey, resumeLine, runningId, startPoints, switchAnnouncement, titleClash, triggerLabel, typeAhead,
} from './EffectPanelModel.js';

const CHEVRON_URL = new URL('./icons/chevron-down.svg', import.meta.url).href;
const STORE_KEY = 'aurora.effectPanel.expanded';
const DEFAULT_EXPANDED = ['builtin', 'custom'];
const CONFIRM_ARM_MS = 400;

let _nextId = 0;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function loadExpanded() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (Array.isArray(saved)) return new Set(saved);
  } catch { /* storage blocked: defaults */ }
  return new Set(DEFAULT_EXPANDED);
}

function saveExpanded(set) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify([...set])); } catch { /* per-device nicety only */ }
}

export class EffectPanel {
  // onSelect(id): a row was committed. onAction(action, effect, extra): a row menu item. Edit
  // graph navigates, the others resolve { ok, id?, message? } once the list has refreshed.
  // onNewEffect(builtinId): the footer, with the chosen start point.
  constructor(container, { onSelect, onAction = async () => ({ ok: false }), onNewEffect = () => {} } = {}) {
    const uid = `effects-${_nextId++}`;
    this._uid = uid;
    this._onSelect = onSelect;
    this._onAction = onAction;
    this._onNewEffect = onNewEffect;
    this._effects = [];
    this._groups = [];
    this._state = null;
    this._opts = { hasAudio: true, canEdit: true, canDelete: true };
    this._fallbackTitle = '';
    this._renaming = null; // { id, input, error, busy, ending }
    this._confirmAt = 0;
    this._confirmArmed = false;
    this._expanded = loadExpanded();
    this._open = false;
    this._rows = new Map(); // effect id -> { opt, pick, name, secondary, check, tip, more }
    this._sections = new Map(); // group id -> { section, head, list, cue, cueText }
    this._menu = null; // { menu, id, opener }
    this._tip = null;
    this._typed = '';
    this._typedAt = 0;
    this._label = 'No effect running';
    this._busy = false;

    this.root = el('div', 'field ef-field');
    this.labelEl = el('label', 'field-label', 'Effect');
    this.labelEl.id = `${uid}-label`;

    this.dropdown = el('div', 'dropdown dropdown-fill ef-dropdown');
    this.trigger = el('button', 'dropdown-trigger');
    this.trigger.type = 'button';
    this.trigger.id = `${uid}-trigger`;
    this.trigger.setAttribute('aria-haspopup', 'dialog');
    this.trigger.setAttribute('aria-expanded', 'false');
    this.trigger.setAttribute('aria-controls', `${uid}-panel`);
    this.trigger.setAttribute('aria-labelledby', `${this.labelEl.id} ${this.trigger.id}`);
    this.labelText = el('span', 'dropdown-label', this._label);
    const chevron = el('img', 'dropdown-chevron');
    chevron.alt = '';
    chevron.src = CHEVRON_URL;
    this.trigger.append(this.labelText, chevron);
    applyTooltip(this.trigger, 'app.effect');

    this.panel = el('div', 'ef-panel');
    this.panel.id = `${uid}-panel`;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'false');
    this.panel.setAttribute('aria-labelledby', this.labelEl.id);
    this.panel.hidden = true;

    this.body = el('div', 'ef-body');
    this.scroll = el('div', 'ef-scroll');
    this.foot = el('div', 'ef-foot');
    this.newItem = el('button', 'ef-new', '+ New effect');
    this.newItem.type = 'button';
    this.newItem.dataset.key = 'new';
    this.foot.append(this.newItem);
    this.body.append(this.scroll, this.foot);
    this.panel.append(this.body);
    this.dropdown.append(this.trigger, this.panel);

    this.status = el('p', 'status-text ef-status');
    this.status.setAttribute('role', 'status');
    this.status.hidden = true;
    this.live = el('p', 'sr-only');
    this.live.setAttribute('aria-live', 'polite');

    this.root.append(this.labelEl, this.dropdown, this.status, this.live);
    container.appendChild(this.root);

    this.trigger.addEventListener('click', () => this.toggle());
    this.trigger.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.open(); }
    });
    this.panel.addEventListener('keydown', (e) => this._onKeydown(e));
    this.panel.addEventListener('click', (e) => this._onClick(e));
    this.panel.addEventListener('mouseover', (e) => this._onHover(e));
    this.panel.addEventListener('mouseleave', () => this._hideTip());
    this.panel.addEventListener('focusin', (e) => this._onFocusIn(e));
    this.panel.addEventListener('focusout', (e) => this._onFocusOut(e));
    this.panel.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this.panel.addEventListener('contextmenu', (e) => { if (e.target.closest('.ef-opt')) e.preventDefault(); });
    this.scroll.addEventListener('scroll', () => this._onScroll());
    this._onDocClick = (e) => {
      // The path, not contains(): a clicked menu item is already out of the DOM by now.
      if (this._open && !e.composedPath().includes(this.dropdown)) this.close({ refocus: false });
    };
  }

  get isOpen() {
    return this._open;
  }

  // state: GET /api/state. busy/pendingTitle: a switch in flight. rejected: a line for a request
  // that never ran. resumeTitle: a pick saved while paused. opts: hasAudio, canEdit (graph editor build), canDelete (Admin).
  update({ effects = this._effects, state = this._state, hasAudio, canEdit, canDelete, fallbackTitle, busy = false, pendingTitle = null, rejected = null, resumeTitle = null } = {}) {
    const before = this._effects;
    this._effects = effects;
    this._state = state;
    if (hasAudio !== undefined) this._opts.hasAudio = hasAudio;
    if (canEdit !== undefined) this._opts.canEdit = canEdit;
    if (canDelete !== undefined) this._opts.canDelete = canDelete;
    if (fallbackTitle !== undefined) this._fallbackTitle = fallbackTitle;

    this._label = triggerLabel(effects, state, this._label);
    this.labelText.textContent = this._label;
    // aria-disabled, not disabled: a disabled trigger would drop focus to body mid-switch.
    this._busy = busy;
    if (busy) { this.trigger.setAttribute('aria-disabled', 'true'); this.trigger.setAttribute('aria-busy', 'true'); }
    else { this.trigger.removeAttribute('aria-disabled'); this.trigger.removeAttribute('aria-busy'); }
    if (busy) this.close({ refocus: false });

    const text = busy && pendingTitle ? `Switching to ${pendingTitle}…` : (rejected || (resumeTitle ? resumeLine(resumeTitle) : ''));
    this.status.textContent = text;
    this.status.hidden = text === '';

    this._patch(diffEffects(before, effects));
  }

  announce(message) {
    // Clearing first makes a repeat of the same sentence announce again.
    this.live.textContent = '';
    this.live.textContent = message;
  }

  // A settled switch: success or failure, spoken through the polite live region (the shell
  // banner has none).
  announceSwitch(args) {
    const message = switchAnnouncement(args);
    if (message) this.announce(message);
  }

  toggle() {
    if (this._open) this.close();
    else this.open();
  }

  open() {
    if (this._open || this._busy) return;
    this._open = true;
    this.panel.hidden = false;
    this.dropdown.classList.add('open');
    this.trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', this._onDocClick);
    const running = runningId(this._state);
    const first = this._flat()[0];
    const key = running && this._visible(running) ? `r:${running}` : (first ? this._keyOf(first) : null);
    this._rove(key);
  }

  close({ refocus = true } = {}) {
    if (!this._open) return;
    if (this._renaming && !this._renaming.busy) this._endRename(false);
    this._closeMenu(false);
    this._hideTip();
    this._open = false;
    this.panel.hidden = true;
    this.dropdown.classList.remove('open');
    this.trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', this._onDocClick);
    if (refocus) this.trigger.focus();
  }

  destroy() {
    document.removeEventListener('click', this._onDocClick);
    this.root.remove();
  }

  // --- rendering -------------------------------------------------------------------------

  _flat() {
    return flatItems(this._groups, this._expanded, { canEdit: this._opts.canEdit });
  }

  _keyOf(item) {
    return item.type === 'group' ? `g:${item.id}` : item.type === 'row' ? `r:${item.id}` : 'new';
  }

  _elOf(key) {
    if (key === 'new') return this.newItem;
    if (key.startsWith('g:')) return this._sections.get(key.slice(2))?.head ?? null;
    if (key.startsWith('m:')) return this._rows.get(key.slice(2))?.more ?? null;
    return this._rows.get(key.slice(2))?.pick ?? null;
  }

  _visible(id) {
    const row = this._rows.get(id);
    return !!row && !row.opt.closest('[hidden]');
  }

  _focusedKey() {
    const node = document.activeElement?.closest?.('[data-key]');
    return node && this.body.contains(node) ? node.dataset.key : null;
  }

  // The rows share one tab stop that follows focus. Headers and New effect are always tab stops.
  _setStop(key) {
    this._tabKey = key;
    for (const node of this.body.querySelectorAll('.ef-pick')) node.tabIndex = node.dataset.key === key ? 0 : -1;
  }

  _rove(key, opts) {
    const target = key && this._elOf(key);
    if (!target) return;
    if (key.startsWith('r:')) this._setStop(key);
    target.focus(opts);
  }

  // Applies the current effects/state to the DOM, keeping every surviving row element.
  _patch(diff) {
    const focusedKey = this._focusedKey();
    const nextGroups = buildGroups(this._effects, this._opts);
    const nextIds = new Set(nextGroups.flatMap((g) => g.effects.map((e) => e.id)));

    // A removed row that holds focus hands it on by the Hide rule before it leaves.
    let refocus = null;
    if (this._open && /^[rm]:/.test(focusedKey ?? '') && !nextIds.has(focusedKey.slice(2))) {
      const id = focusedKey.slice(2);
      const stillThere = this._rows.get(id);
      refocus = focusAfterRemoval(this._flat(), id);
      if (stillThere) this.announce(`${stillThere.name.textContent} was removed`);
    }
    if (this._menu && this._menu.id !== 'new' && !nextIds.has(this._menu.id)) this._closeMenu(false);
    if (this._renaming && !nextIds.has(this._renaming.id)) this._renaming = null;

    for (const id of [...this._rows.keys()]) {
      if (nextIds.has(id)) continue;
      const row = this._rows.get(id);
      row.opt.remove();
      row.tip.remove();
      this._rows.delete(id);
    }
    this._groups = nextGroups;

    const running = runningId(this._state);
    for (const group of nextGroups) {
      const sec = this._ensureSection(group);
      let after = null;
      group.effects.forEach((effect, i) => {
        const row = this._ensureRow(effect);
        this._fillRow(row, effect, running === effect.id, group.id);
        // Move only rows that are out of place, so a focused row is never re-inserted.
        const expected = after ? after.nextElementSibling : sec.list.firstElementChild;
        if (row.opt !== expected) sec.list.insertBefore(row.opt, expected);
        after = row.opt;
        row.first = i === 0;
        row.last = i === group.effects.length - 1;
      });
    }
    // Sections: drop empty groups, keep the Built-in, Custom, Hidden order.
    let prev = null;
    for (const g of nextGroups) {
      const sec = this._sections.get(g.id);
      const expected = prev ? prev.nextElementSibling : this.scroll.firstElementChild;
      if (sec.section !== expected) this.scroll.insertBefore(sec.section, expected);
      prev = sec.section;
    }
    for (const [id, sec] of [...this._sections]) {
      if (nextGroups.some((g) => g.id === id)) continue;
      sec.section.remove();
      this._sections.delete(id);
    }
    this.newItem.hidden = !this._opts.canEdit;
    this.foot.hidden = !this._opts.canEdit;
    for (const g of nextGroups) this._syncSection(g, running);

    // One tab stop for the rows. A removed focus holder passes it on.
    const keys = this._flat().map((i) => this._keyOf(i));
    const rowKeys = keys.filter((k) => k.startsWith('r:'));
    const heldRow = /^[rm]:/.test(focusedKey ?? '') ? `r:${focusedKey.slice(2)}` : null;
    let stop = rowKeys.includes(heldRow) ? heldRow : (rowKeys.includes(this._tabKey) ? this._tabKey : null);
    if (refocus && rowKeys.includes(`r:${refocus}`)) stop = `r:${refocus}`;
    if (!stop) stop = running && rowKeys.includes(`r:${running}`) ? `r:${running}` : (rowKeys[0] ?? null);
    this._setStop(stop);
    if (refocus) {
      const to = keys.includes(`r:${refocus}`) ? `r:${refocus}` : keys.includes(`g:${refocus}`) ? `g:${refocus}` : keys[0];
      this._elOf(to)?.focus({ preventScroll: false });
    }
  }

  _ensureSection(group) {
    let sec = this._sections.get(group.id);
    if (sec) return sec;
    const section = el('div', 'ef-section');
    const headId = `${this._uid}-g-${group.id}`;
    const listId = `${headId}-list`;
    const heading = el('h3', 'ef-group');
    const head = el('button', 'ef-head');
    head.type = 'button';
    head.id = headId;
    head.dataset.key = `g:${group.id}`;
    head.setAttribute('aria-controls', listId);
    const twisty = el('img', 'ef-chev ef-twisty');
    twisty.alt = '';
    twisty.src = CHEVRON_URL;
    const cue = el('span', 'ef-cue', '✓');
    cue.setAttribute('aria-hidden', 'true');
    const cueText = el('span', 'sr-only', ', contains the current effect');
    head.append(twisty, el('span', '', group.name), cue, cueText);
    heading.append(head);
    const list = el('div', 'ef-list');
    list.id = listId;
    list.setAttribute('role', 'group');
    list.setAttribute('aria-labelledby', headId);
    section.append(heading, list);
    sec = { section, head, list, cue, cueText };
    this._sections.set(group.id, sec);
    return sec;
  }

  _syncSection(group, running) {
    const sec = this._sections.get(group.id);
    const open = this._expanded.has(group.id);
    sec.head.setAttribute('aria-expanded', String(open));
    sec.list.hidden = !open;
    // A collapsed group holding the running effect shows it on its header.
    const show = !open && running !== null && group.effects.some((e) => e.id === running);
    sec.cue.hidden = !show;
    sec.cueText.hidden = !show;
  }

  _ensureRow(effect) {
    let row = this._rows.get(effect.id);
    if (row) return row;
    const opt = el('div', 'ef-opt');
    opt.dataset.id = effect.id;
    const pick = el('button', 'ef-pick');
    pick.type = 'button';
    pick.dataset.key = `r:${effect.id}`;
    pick.tabIndex = -1;
    pick.setAttribute('aria-keyshortcuts', 'Shift+F10');
    const check = el('span', 'ef-check');
    check.setAttribute('aria-hidden', 'true');
    const text = el('span', 'ef-opt-text');
    const name = el('span', 'ef-opt-name');
    const secondary = el('span', 'ef-opt-secondary');
    text.append(name, secondary);
    pick.append(check, text);
    // Actions is a real button for touch and screen readers. Keyboard users reach it with Right
    // from the row, so it stays out of the tab order.
    const more = el('button', 'ef-more', '⋯');
    more.type = 'button';
    more.tabIndex = -1;
    more.dataset.key = `m:${effect.id}`;
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    opt.append(pick, more);
    const tip = el('div', 'ef-tip');
    tip.setAttribute('role', 'tooltip');
    tip.id = `${this._uid}-tip-${this._rows.size}-${Math.random().toString(36).slice(2, 7)}`;
    tip.hidden = true;
    this.panel.append(tip);
    row = { opt, pick, name, secondary, check, tip, more, first: false, last: false };
    this._rows.set(effect.id, row);
    return row;
  }

  _fillRow(row, effect, isRunning, groupId) {
    const title = effectTitle(effect);
    if (row.name.textContent !== title) row.name.textContent = title;
    // A hidden built-in says where it came from.
    const secondary = effect.hidden && effect.builtin ? 'Built-in' : '';
    if (row.secondary.textContent !== secondary) row.secondary.textContent = secondary;
    row.secondary.hidden = secondary === '';
    const description = effect.description || '';
    if (row.tip.textContent !== description) row.tip.textContent = description;
    if (description) row.pick.setAttribute('aria-describedby', row.tip.id);
    else row.pick.removeAttribute('aria-describedby');
    if (isRunning) row.pick.setAttribute('aria-current', 'true');
    else row.pick.removeAttribute('aria-current');
    row.check.textContent = isRunning ? '✓' : '';
    row.opt.classList.toggle('selected', isRunning);
    row.more.setAttribute('aria-label', `Actions for ${title}`);
    row.opt.dataset.group = groupId;
  }

  // --- layers ----------------------------------------------------------------------------

  // Under the row, else above it, else pinned to the viewport bottom.
  _place(layer, opt, overlap = 0) {
    const pr = this.panel.getBoundingClientRect();
    const rr = opt.getBoundingClientRect();
    const h = layer.offsetHeight;
    let top = rr.bottom - overlap;
    if (top + h > window.innerHeight) top = rr.top - h + overlap >= 0 ? rr.top - h + overlap : window.innerHeight - h;
    layer.style.top = `${top - pr.top}px`;
  }

  _showTip(opt) {
    this._hideTip();
    const row = this._rows.get(opt.dataset.id);
    if (!row || !row.tip.textContent || this._menu) return;
    row.tip.hidden = false;
    this._place(row.tip, opt, 4);
    this._tip = row.tip;
  }

  _hideTip() {
    if (this._tip) this._tip.hidden = true;
    this._tip = null;
  }

  _onHover(e) {
    const opt = e.target.closest('.ef-opt');
    if (opt) this._showTip(opt);
    else this._hideTip();
  }

  _onFocusIn(e) {
    const pick = e.target.closest('.ef-pick');
    if (pick && pick.matches(':focus-visible') && !this._menu) this._showTip(pick.closest('.ef-opt'));
    else if (!e.target.closest('.ef-menu')) this._hideTip();
    const keyed = e.target.closest('[data-key]');
    if (keyed && this.body.contains(keyed) && /^[rm]:/.test(keyed.dataset.key)) this._setStop(`r:${keyed.dataset.key.slice(2)}`);
  }

  // Non-modal: Tab out of the panel closes it, without pulling focus back.
  _onFocusOut(e) {
    if (!this._open) return;
    const to = e.relatedTarget;
    // No target is a click on plain space or a window blur: the document click handler decides.
    if (!to || this.panel.contains(to) || this.trigger.contains(to)) return;
    this.close({ refocus: false });
  }

  _onScroll() {
    this._hideTip();
    if (!this._menu) return;
    const hadFocus = this._menu.menu.contains(document.activeElement);
    this._closeMenu(hadFocus, { preventScroll: true });
  }

  // --- row menus -------------------------------------------------------------------------

  // opener: the control that had focus, which gets it back when the menu closes (default the row).
  _openMenu(id, { pointer = false, opener = null } = {}) {
    const row = this._rows.get(id);
    const effect = this._effects.find((e) => e.id === id);
    if (!row || !effect) return;
    this._closeMenu(false);
    const group = this._groups.find((g) => g.effects.some((e) => e.id === id));
    if (this._renaming) return;
    const items = menuItems(effect, {
      running: runningId(this._state) === id,
      canEdit: this._opts.canEdit,
      canDelete: this._opts.canDelete,
      first: row.first,
      last: row.last,
      testBase: this._state?.test?.active === true && this._state?.effect === id,
    });
    if (items.length === 0 || !group) return;
    const menu = el('div', 'ef-menu');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `Actions for ${effectTitle(effect)}`);
    // A touch menu starts with the description, like an iOS context-menu preview.
    if (pointer && effect.description) {
      const desc = el('p', 'ef-menu-desc', effect.description);
      desc.id = `${menu.id || this._uid}-desc-${id}`;
      menu.setAttribute('aria-describedby', desc.id);
      menu.append(desc);
    }
    for (const label of items) {
      menu.append(this._menuButton(label, label === 'Delete'));
    }
    this.panel.append(menu);
    this._hideTip();
    this._place(menu, row.opt);
    row.opt.classList.add('menu-open');
    row.more.classList.add('open');
    row.more.setAttribute('aria-expanded', 'true');
    this._menu = { menu, id, opener: opener ?? row.pick };
    menu.querySelector('[role="menuitem"]').focus();
  }

  _menuButton(label, divided = false, value = label) {
    const b = el('button', 'dropdown-option' + (divided ? ' dropdown-option-divided' : ''), label);
    b.type = 'button';
    b.tabIndex = -1;
    b.dataset.value = value;
    b.setAttribute('role', 'menuitem');
    return b;
  }

  _closeMenu(refocus = true, opts) {
    if (!this._menu) return;
    const { menu, id, opener } = this._menu;
    this._menu = null;
    const row = this._rows.get(id);
    if (id === 'new') {
      if (refocus) this._rove('new', opts);
    } else if (row) {
      row.opt.classList.remove('menu-open');
      row.more.classList.remove('open');
      row.more.setAttribute('aria-expanded', 'false');
      // Refocus before removing the menu so focus never drops to the body.
      if (refocus) (opener?.isConnected ? opener : row.pick).focus(opts);
    }
    menu.remove();
  }

  async _runAction(label, value) {
    const { id } = this._menu;
    if (id === 'new') {
      this._closeMenu(false);
      this.close();
      this._onNewEffect(value);
      return;
    }
    const effect = this._effects.find((e) => e.id === id);
    if (!effect) return;
    if (label === 'Rename') { this._closeMenu(false); this._startRename(id); return; }
    if (label === 'Delete') { this._openConfirm(effect, this._menu.opener); return; }
    this._closeMenu(true);
    if (label === 'Edit graph') { this._onAction(label, effect); return; }
    await this._perform(label, effect);
  }

  // Runs a row action, then announces and moves focus once the list has refreshed.
  async _perform(label, effect) {
    const id = effect.id;
    const title = effectTitle(effect);
    const leaves = label === 'Hide' || label === 'Unhide' || label === 'Delete';
    const dest = leaves ? focusAfterRemoval(this._flat(), id) : null;
    let result;
    try { result = await this._onAction(label, effect); } catch { result = { ok: false }; }
    if (!result?.ok) {
      this.announce(result?.message || actionAnnouncement(label, title, { ok: false }));
      return;
    }
    if (label === 'Move up' || label === 'Move down') {
      this.announce(actionAnnouncement(label, title, { position: positionIn(this._groups, id) }));
      if (this._open) this._rove(`r:${id}`);
    } else if (label === 'Duplicate') {
      this.announce(actionAnnouncement(label, title, { to: result.title }));
      if (this._open && result.id && this._rows.has(result.id)) {
        this._toggleGroup('custom', true);
        this._rove(`r:${result.id}`);
      }
    } else {
      this.announce(actionAnnouncement(label, title));
      if (this._open) this._rove(this._destKey(dest));
    }
  }

  // After a row leaves its list: the next row, the previous, the group, else the first item.
  _destKey(dest) {
    const keys = this._flat().map((i) => this._keyOf(i));
    if (dest && this._rows.has(dest) && keys.includes(`r:${dest}`)) return `r:${dest}`;
    if (dest && keys.includes(`g:${dest}`)) return `g:${dest}`;
    return keys[0] ?? null;
  }

  // --- delete confirm --------------------------------------------------------------------

  _openConfirm(effect, opener = null) {
    const { id } = effect;
    const row = this._rows.get(id);
    this._closeMenu(false);
    if (!row) return;
    const title = effectTitle(effect);
    const running = runningId(this._state) === id;
    const box = el('div', 'ef-menu ef-confirm');
    box.setAttribute('role', 'alertdialog');
    const head = el('p', 'ef-confirm-title', `Delete ${title}?`);
    head.id = `${this._uid}-confirm-title`;
    const fallback = running && this._fallbackTitle ? ` It's running now, so ${this._fallbackTitle} starts instead.` : '';
    const body = el('p', 'ef-confirm-body', `This can't be undone.${fallback}`);
    body.id = `${this._uid}-confirm-body`;
    box.setAttribute('aria-labelledby', head.id);
    box.setAttribute('aria-describedby', body.id);
    const actions = el('div', 'ef-confirm-actions');
    const cancel = el('button', 'ef-confirm-btn ef-confirm-cancel', 'Cancel');
    const yes = el('button', 'ef-confirm-btn ef-confirm-yes', 'Delete');
    cancel.type = 'button';
    yes.type = 'button';
    actions.append(cancel, yes);
    box.append(head, body, actions);
    this.panel.append(box);
    this._hideTip();
    this._place(box, row.opt);
    row.opt.classList.add('menu-open');
    row.more.classList.add('open');
    row.more.setAttribute('aria-expanded', 'true');
    this._menu = { menu: box, id, confirm: true, opener: opener ?? row.pick };
    this._confirmAt = Date.now();
    cancel.focus();
  }

  // Delete acts on a press that began on the confirm and not within the arm delay, so a double
  // tap on the menu item cannot delete. Keyboard activation has no pointer press (detail 0).
  _onConfirmClick(button, e) {
    if (button.classList.contains('ef-confirm-cancel')) { this._closeMenu(true); return; }
    const pointer = e.detail !== 0;
    const armed = this._confirmArmed && Date.now() - this._confirmAt > CONFIRM_ARM_MS;
    this._confirmArmed = false;
    if (pointer && !armed) return;
    this._confirmDelete();
  }

  async _confirmDelete() {
    const { id } = this._menu;
    const effect = this._effects.find((e) => e.id === id);
    this._closeMenu(false);
    if (!effect) return;
    if (runningId(this._state) === id) {
      // Deleting the running effect is a switch: the panel closes and the Dashboard shows the states.
      this.close();
      await this._onAction('Delete', effect, { running: true });
      return;
    }
    await this._perform('Delete', effect);
  }

  // --- rename ----------------------------------------------------------------------------

  _startRename(id) {
    const row = this._rows.get(id);
    const effect = this._effects.find((e) => e.id === id);
    if (!row || !effect || this._renaming) return;
    const input = el('input', 'ef-rename');
    input.type = 'text';
    input.value = effectTitle(effect);
    input.setAttribute('aria-label', `Rename ${effectTitle(effect)}`);
    row.opt.classList.add('renaming');
    row.opt.insertBefore(input, row.more);
    this._renaming = { id, input, error: null, busy: false, ending: false };
    input.addEventListener('blur', () => this._commitRename(false));
    // Not maxLength: it counts UTF-16 units, and the server counts characters.
    input.addEventListener('input', (e) => {
      const clipped = clipTitle(input.value);
      if (!e.isComposing && clipped !== input.value) input.value = clipped;
    });
    this._hideTip();
    input.focus();
    input.select();
  }

  _showRenameError(message) {
    const r = this._renaming;
    if (!r) return;
    if (!r.error) {
      r.error = el('p', 'ef-rename-error');
      r.error.id = `${this._uid}-rename-error`;
      r.input.after(r.error);
    }
    r.error.textContent = message;
    r.input.setAttribute('aria-invalid', 'true');
    r.input.setAttribute('aria-describedby', r.error.id);
  }

  _endRename(focusRow) {
    const r = this._renaming;
    if (!r || r.ending) return;
    r.ending = true;
    this._renaming = null;
    const row = this._rows.get(r.id);
    if (row) row.opt.classList.remove('renaming');
    if (focusRow && row) this._rove(`r:${r.id}`);
    r.input.remove();
    r.error?.remove();
  }

  async _commitRename(fromKey) {
    const r = this._renaming;
    if (!r || r.busy || r.ending) return;
    const effect = this._effects.find((e) => e.id === r.id);
    const value = r.input.value.trim();
    if (!effect || value === '' || value === effectTitle(effect)) { this._endRename(fromKey); return; }
    const clash = titleClash(value, this._effects, r.id);
    if (clash) {
      this._showRenameError(`Another effect is named ${clash}.`);
      if (fromKey) r.input.focus();
      return;
    }
    r.busy = true;
    let result;
    try { result = await this._onAction('Rename', effect, { title: value }); } catch { result = { ok: false }; }
    r.busy = false;
    if (this._renaming !== r) return;
    if (!result?.ok) {
      this._showRenameError(result?.message || `Couldn't rename ${effectTitle(effect)}.`);
      if (fromKey) r.input.focus();
      return;
    }
    this._endRename(true);
    this.announce(actionAnnouncement('Rename', effectTitle(effect), { to: value }));
  }

  // --- New effect: Start from menu -------------------------------------------------------

  _openStartMenu(starts) {
    this._closeMenu(false);
    const menu = el('div', 'ef-menu ef-menu-start');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Start from');
    menu.append(el('p', 'ef-menu-desc', 'Start from'));
    for (const e of starts) menu.append(this._menuButton(effectTitle(e), false, e.id));
    this.panel.append(menu);
    this._hideTip();
    this._place(menu, this.newItem);
    this._menu = { menu, id: 'new' };
    menu.querySelector('[role="menuitem"]').focus();
  }

  _onPointerDown(e) {
    this._pointerType = e.pointerType;
    this._confirmArmed = !!e.target.closest('.ef-confirm-yes');
  }

  // --- input -----------------------------------------------------------------------------

  _onClick(e) {
    const confirmButton = e.target.closest('.ef-confirm button');
    if (confirmButton) { this._onConfirmClick(confirmButton, e); return; }
    const item = e.target.closest('.ef-menu [role="menuitem"]');
    if (item) { this._runAction(item.textContent, item.dataset.value); return; }
    if (e.target.closest('.ef-menu')) return;
    const more = e.target.closest('.ef-more');
    if (more) {
      const id = more.closest('.ef-opt').dataset.id;
      // A second press on the same Actions button closes its menu.
      if (this._menu?.id === id) { this._closeMenu(true); return; }
      this._openMenu(id, { pointer: this._pointerType === 'touch' && e.detail !== 0, opener: more });
      return;
    }
    this._closeMenu(false);
    const head = e.target.closest('.ef-head');
    if (head) {
      this._toggleGroup(head.dataset.key.slice(2));
      head.focus();
      return;
    }
    const pick = e.target.closest('.ef-pick');
    if (pick) { this._commit(pick.closest('.ef-opt').dataset.id); return; }
    if (e.target.closest('.ef-new')) this._newEffect();
  }

  _toggleGroup(id, open = !this._expanded.has(id)) {
    if (open) this._expanded.add(id);
    else this._expanded.delete(id);
    saveExpanded(this._expanded);
    const group = this._groups.find((g) => g.id === id);
    if (group) this._syncSection(group, runningId(this._state));
  }

  _commit(id) {
    this.close();
    this._onSelect?.(id);
  }

  // The panel stays open on a Start from menu (Empty is always offered).
  _newEffect() {
    const starts = startPoints(this._effects, { hasAudio: this._opts.hasAudio });
    if (starts.length > 1) { this._openStartMenu(starts); return; }
    this.close();
    this._onNewEffect(starts[0]?.id);
  }

  _onKeydown(e) {
    if (this._renaming && e.target === this._renaming.input) {
      if (e.key === 'Enter') { e.preventDefault(); this._commitRename(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this._endRename(true); }
      return;
    }
    if (this._menu && this._menu.menu.contains(e.target)) { this._onMenuKeydown(e); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      return;
    }
    // Headers and New effect are plain buttons. Only rows and their Actions button take arrows.
    const key = this._focusedKey();
    if (!/^[rm]:/.test(key ?? '')) return;
    const id = key.slice(2);
    if (key.startsWith('m:')) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); this._rove(`r:${id}`); }
      return;
    }
    const rows = rowItems(this._flat());
    const at = rows.findIndex((r) => r.id === id);
    if (at === -1) return;
    const act = rowKey(rows, at, e.key, { shift: e.shiftKey });
    if (act === null) {
      this._typeAhead(e, rows, at);
      return;
    }
    e.preventDefault();
    if (act.focus !== undefined) this._rove(`r:${rows[act.focus].id}`);
    else if (act.actions) this._rove(`m:${act.actions}`);
    else if (act.menu) this._openMenu(act.menu);
  }

  _typeAhead(e, items, at) {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    const typing = this._typed !== '' && e.timeStamp - this._typedAt < 600;
    // A lone Space is the native click that commits the row.
    if (e.key === ' ' && !typing) return;
    this._typed = (typing ? this._typed : '') + e.key.toLowerCase();
    this._typedAt = e.timeStamp;
    const labels = items.map((i) => this._rows.get(i.id)?.name.textContent ?? '');
    const hit = typeAhead(labels, at, this._typed);
    e.preventDefault();
    if (hit !== null) this._rove(this._keyOf(items[hit]));
  }

  _onMenuKeydown(e) {
    if (this._menu.confirm) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this._closeMenu(true); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        const [first, last] = this._menu.menu.querySelectorAll('button');
        (document.activeElement === first ? last : first).focus();
      }
      return;
    }
    const all = [...this._menu.menu.querySelectorAll('[role="menuitem"]')];
    const i = all.indexOf(document.activeElement);
    const to = {
      ArrowDown: all[(i + 1) % all.length],
      ArrowUp: all[(i - 1 + all.length) % all.length],
      Home: all[0],
      End: all[all.length - 1],
    }[e.key];
    if (to) { e.preventDefault(); to.focus(); return; }
    if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      this._closeMenu(true);
    }
  }
}
