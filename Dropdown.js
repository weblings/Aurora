// Custom trigger+menu dropdown, ported from RockyRoad's own Dropdown.ts --
// kept deliberately over a native <select> for the same WebXR/touch reasons
// RockyRoad keeps it (see Analysis/WebUI/WebUI_Design_1stPass.md), which means inheriting
// the ARIA/keyboard work a native <select> gets for free. Implements the
// WAI-ARIA APG "Collapsible Dropdown Listbox" pattern (verified against
// https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-collapsible/,
// not guessed) with one deliberate divergence from that pattern's literal
// "select follows focus" model: arrow keys move the visual/ARIA active
// cursor (aria-activedescendant) without calling onSelect or changing
// aria-selected -- only Enter/Space/click/Tab-out actually commits. The
// reference pattern commits on every arrow press, fine for a plain value;
// Aurora's onSelect callbacks can trigger real side effects (switching a
// capture device, a REST call), so committing while the user is still
// browsing options would fire those prematurely and repeatedly. Typeahead
// (jump to an option by typing its first letter) is the one other piece of
// the reference pattern not implemented -- a deliberate, documented cut.
//
// One instance per dropdown; caller supplies the option list and trigger
// label, this owns open/closed state and the menu's DOM.

let _nextId = 0;

export class Dropdown {
  static _instances = [];
  static _outsideClickInstalled = false;

  // labelId: the id of an external <label>/<span> naming this dropdown (e.g.
  // "Monitor"). When omitted, aria-label falls back to the trigger's own
  // label text, kept in sync by setTriggerLabel().
  // fill: the trigger fills its container's width with the chevron pushed to
  // the far edge, instead of hugging its own content -- needed for the
  // full-width dropdowns shown on constrained layouts throughout
  // Analysis/WebUI/WebUI_Design_1stPass.md's screen designs.
  constructor(container, initialLabel, onSelect, { labelId = null, fill = false } = {}) {
    const id = `dropdown-${_nextId++}`;
    this._onSelect = onSelect;
    this._labelId = labelId;
    this._options = [];
    this._activeIndex = -1;
    this._open = false;

    this.root = document.createElement('div');
    this.root.className = fill ? 'dropdown dropdown-fill' : 'dropdown';

    this.trigger = document.createElement('button');
    this.trigger.type = 'button';
    this.trigger.id = `${id}-trigger`;
    this.trigger.className = 'dropdown-trigger';
    this.trigger.setAttribute('aria-haspopup', 'listbox');
    this.trigger.setAttribute('aria-expanded', 'false');

    this.labelEl = document.createElement('span');
    this.labelEl.className = 'dropdown-label';
    this.labelEl.textContent = initialLabel;

    this.chevron = document.createElement('span');
    this.chevron.className = 'dropdown-chevron';
    this.chevron.setAttribute('aria-hidden', 'true');
    this.chevron.textContent = '▾'; // same glyph either way -- CSS has
    // no swapped-open state (unlike RockyRoad's swapped up/down SVGs); the
    // open menu itself is feedback enough for a small chevron like this.

    this.trigger.append(this.labelEl, this.chevron);

    this.menu = document.createElement('div');
    this.menu.id = `${id}-listbox`;
    this.menu.className = 'dropdown-menu';
    this.menu.setAttribute('role', 'listbox');
    this.menu.tabIndex = -1;

    this._applyLabelling(initialLabel);

    this.root.append(this.trigger, this.menu);
    container.appendChild(this.root);

    this.trigger.addEventListener('click', () => this.toggle());
    this.trigger.addEventListener('keydown', (e) => this._onTriggerKeydown(e));
    this.menu.addEventListener('keydown', (e) => this._onMenuKeydown(e));

    // Prevent the browser from moving DOM focus onto the clicked option
    // button before the click fires -- focus must stay on the listbox
    // itself per the pattern, not move into individual options.
    this.menu.addEventListener('mousedown', (e) => {
      if (e.target.closest('.dropdown-option')) e.preventDefault();
    });
    this.menu.addEventListener('click', (e) => {
      const btn = e.target.closest('.dropdown-option');
      if (!btn) return;
      // dataset.value is always a string (DOM coercion) -- String() here so
      // a non-string option value (e.g. a numeric zoneId) still matches
      // instead of silently no-op'ing on click.
      const index = this._options.findIndex((o) => String(o.value) === btn.dataset.value);
      if (index === -1) return;
      this._commit(index);
      this.trigger.focus();
    });

    Dropdown._instances.push(this);
    Dropdown._ensureOutsideClickListener();
  }

  // Installed once, lazily, on first Dropdown construction -- never removed,
  // since it's a single stateless global listener regardless of how many
  // instances come and go. Ported unchanged from RockyRoad's own reasoning:
  // bubble phase (default) means a trigger's own click handler has already
  // toggled that dropdown's state by the time this runs, so the containment
  // check alone correctly distinguishes "clicked my own trigger" (stays
  // open) from "clicked outside" (closes) -- no capture-phase trickery
  // needed.
  static _ensureOutsideClickListener() {
    if (Dropdown._outsideClickInstalled) return;
    Dropdown._outsideClickInstalled = true;
    document.addEventListener('click', (e) => {
      if (!(e.target instanceof Node)) return;
      for (const dropdown of Dropdown._instances) {
        if (dropdown.isOpen && !dropdown.root.contains(e.target)) dropdown.close();
      }
    });
  }

  get isOpen() {
    return this._open;
  }

  toggle() {
    if (this._open) this.close();
    else this.openMenu();
  }

  openMenu() {
    if (this._open) return;
    this._open = true;
    this.root.classList.add('open');
    this.trigger.setAttribute('aria-expanded', 'true');
    const selectedIndex = this._options.findIndex((o) => o.selected);
    this._setActiveIndex(selectedIndex !== -1 ? selectedIndex : 0);
    this.menu.focus();
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this.root.classList.remove('open');
    this.trigger.setAttribute('aria-expanded', 'false');
  }

  setTriggerLabel(text) {
    this.labelEl.textContent = text;
    this._applyLabelling(text);
  }

  // Closes the menu too if hiding -- a hidden-but-still-open dropdown would
  // otherwise pop back open with no trigger click the next time it's shown.
  setVisible(visible) {
    if (!visible) this.close();
    this.root.style.display = visible ? '' : 'none';
  }

  // Full destroy+recreate of the option list on every call -- same
  // "destroy and recreate" approach as the original, no diffing needed at
  // this list size.
  setOptions(options) {
    this._options = options;
    this.menu.innerHTML = '';
    options.forEach((opt, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.tabIndex = -1;
      btn.id = `${this.menu.id}-option-${index}`;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', opt.selected ? 'true' : 'false');
      btn.className = 'dropdown-option' + (opt.selected ? ' selected' : '');
      btn.textContent = opt.label;
      btn.dataset.value = opt.value;
      this.menu.appendChild(btn);
    });
    const selectedIndex = options.findIndex((o) => o.selected);
    this._setActiveIndex(selectedIndex !== -1 ? selectedIndex : -1);
  }

  // Call before discarding an instance (e.g. before a full-container
  // innerHTML rebuild) so it doesn't linger in the static registry.
  destroy() {
    Dropdown._instances = Dropdown._instances.filter((d) => d !== this);
    this.root.remove();
  }

  _applyLabelling(fallbackText) {
    if (this._labelId) {
      this.trigger.setAttribute('aria-labelledby', `${this._labelId} ${this.trigger.id}`);
      this.menu.setAttribute('aria-labelledby', this._labelId);
    } else {
      this.trigger.setAttribute('aria-label', fallbackText);
      this.menu.setAttribute('aria-label', fallbackText);
    }
  }

  _optionButtons() {
    return this.menu.querySelectorAll('.dropdown-option');
  }

  // Moves the transient keyboard-navigation cursor -- see this file's top
  // comment for why this is separate from committing a value.
  _setActiveIndex(index) {
    const buttons = this._optionButtons();
    buttons.forEach((b) => b.classList.remove('active'));
    this._activeIndex = index;
    if (index >= 0 && index < buttons.length) {
      buttons[index].classList.add('active');
      this.menu.setAttribute('aria-activedescendant', buttons[index].id);
    } else {
      this.menu.removeAttribute('aria-activedescendant');
    }
  }

  // Updates this dropdown's own displayed label/aria-selected before
  // calling the caller's onSelect -- a caller's onSelect only needs to
  // stash the new value in its own state (both real call sites do exactly
  // that), not also remember to refresh how this component looks. Missing
  // this was the actual bug behind "clicking an option doesn't work": the
  // committed value was always correct (confirmed via the real PUT/POST
  // body sent), only the visible label never changed, indistinguishable
  // from a broken click without checking the network request directly.
  _commit(index) {
    const opt = this._options[index];
    if (opt) {
      this._options.forEach((o) => { o.selected = o.value === opt.value; });
      this.setTriggerLabel(opt.label);
      this._optionButtons().forEach((btn, i) => {
        const isSelected = this._options[i].value === opt.value;
        btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        btn.classList.toggle('selected', isSelected);
      });
    }
    this.close();
    if (opt) this._onSelect(opt.value);
  }

  _onTriggerKeydown(e) {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.openMenu();
        break;
      default:
        break;
    }
  }

  _onMenuKeydown(e) {
    const count = this._options.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._setActiveIndex(Math.min(this._activeIndex + 1, count - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._setActiveIndex(Math.max(this._activeIndex - 1, 0));
        break;
      case 'Home':
        e.preventDefault();
        if (count > 0) this._setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        if (count > 0) this._setActiveIndex(count - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        this._commit(this._activeIndex);
        this.trigger.focus();
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        this.trigger.focus();
        break;
      case 'Tab':
        // Commit but let the browser's own Tab handling continue --
        // forcing focus back to the trigger here would fight it.
        this._commit(this._activeIndex);
        break;
      default:
        break;
    }
  }
}
