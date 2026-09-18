// Entertainment-configuration picker: fetches the persisted connection +
// the bridge's config list itself, renders a dropdown (hidden entirely at
// zero/one config, same rule Output Connect's own picker already uses),
// and PATCHes the new selection back via POST /api/hue/connection --
// pulled out of ZoneMappingScreen.js so the new onboarding "Entertainment
// zone select" screen (Analysis/WebUI/WebUI_Design_2ndPass.md) can reuse the
// same fetch+render+switch logic instead of duplicating it.
//
// load() (fetch) and mount() (draw into a container) are deliberately
// separate: a caller whose own DOM gets fully rebuilt on every render
// (ZoneMappingScreen's own body.innerHTML = ... convention) can call
// mount() again with a fresh container node without re-fetching. Does not
// reload itself after a successful switch either -- every current/planned
// caller already does a full reload of whatever else depends on the new
// config (zones, channel light names) and calls load()+mount() again as
// part of that.
import { Dropdown } from './Dropdown.js';

export class EntertainmentConfigSelect {
  // onChange(configId) fires after a successful switch is persisted.
  // onError(message) fires on a failed switch; the caller decides how/where
  // to show it (this component renders no error text of its own).
  constructor({ onChange, onError } = {}) {
    this.onChange = onChange;
    this.onError = onError;
    this.container = null;
    this.dropdown = null;
    this.configs = null; // null = not loaded yet
    this.selectedId = '';
  }

  // Fetches the persisted connection (for the currently-selected id) and
  // the bridge's own config list. Returns the resolved list so a caller
  // can react even when the picker itself stays hidden (e.g. a static
  // "Using: <name>" label at exactly one config). Does not render --
  // call mount() (or re-mount()) afterward.
  async load() {
    try {
      const connection = await (await fetch('/api/hue/connection')).json();
      this.selectedId = connection.entertainmentConfigurationId ?? '';

      const result = await (await fetch('/api/hue/entertainment-configurations', {
        method: 'PUT',
        body: JSON.stringify({}),
      })).json();
      this.configs = result.succeeded ? result.configurations : [];

      // Nothing persisted yet, but getSelected()'s own fallback already
      // shows configs[0] as "selected" -- as a static label at exactly one
      // config (mount() renders no dropdown then, so onChange/_select()
      // below never fires), or as a dropdown's pre-highlighted first option
      // a user can proceed past without ever touching. Persist that same
      // resolved default now, silently (no onChange -- this is still the
      // initial load, not a user-driven switch), so completing onboarding
      // with a single entertainment config doesn't leave
      // entertainmentConfigurationId empty forever.
      if (!this.selectedId && this.configs.length > 0) {
        this.selectedId = this.configs[0].id;
        const persisted = await this._persist(this.selectedId);
        if (!persisted.succeeded) this.onError?.(persisted.error);
      }
    } catch {
      this.configs = [];
    }

    return this.configs;
  }

  // The resolved {id, name} entry, even when the picker itself is hidden
  // (falls back to the first config, same "always a real selection" rule
  // the dropdown itself uses once rendered).
  getSelected() {
    if (!this.configs?.length) return null;
    return this.configs.find((c) => c.id === this.selectedId) ?? this.configs[0];
  }

  // Draws into the given container using whatever load() already fetched.
  // Safe to call repeatedly with a fresh container across a parent's own
  // re-renders -- destroys any previous mount first.
  mount(container) {
    this.dropdown?.destroy();
    this.dropdown = null;
    this.container = container;
    this.container.innerHTML = '';

    if ((this.configs?.length ?? 0) <= 1) return;

    this.container.innerHTML = `
      <div class="field zm-entertainment-field">
        <label class="field-label" id="ecs-entertainment-label">Entertainment configuration</label>
        <div id="ecs-entertainment-dropdown-slot"></div>
      </div>
    `;

    const selected = this.getSelected();
    const slot = this.container.querySelector('#ecs-entertainment-dropdown-slot');
    this.dropdown = new Dropdown(
      slot,
      selected.name,
      (value) => this._select(value),
      { labelId: 'ecs-entertainment-label', fill: true, tooltipKey: 'output.hue.entertainmentConfig' },
    );
    this.dropdown.setOptions(this.configs.map((c) => ({
      label: c.name,
      value: c.id,
      selected: c.id === selected.id,
    })));
  }

  async _select(entertainmentConfigurationId) {
    this.selectedId = entertainmentConfigurationId;
    const persisted = await this._persist(entertainmentConfigurationId);
    if (!persisted.succeeded) {
      this.onError?.(persisted.error);
      return;
    }
    if (persisted.reloadError) {
      this.onError?.(`Saved, but the running output couldn't reload: ${persisted.reloadError}`);
    }
    this.onChange?.(entertainmentConfigurationId);
  }

  // Raw POST, shared by _select() (a user-driven switch, which also fires
  // onChange) and load()'s own silent auto-persist of an unset default.
  async _persist(entertainmentConfigurationId) {
    try {
      const result = await (await fetch('/api/hue/connection', {
        method: 'POST',
        body: JSON.stringify({ entertainmentConfigurationId }),
      })).json();

      if (!result.succeeded) return { succeeded: false, error: "Couldn't switch entertainment configuration." };
      return { succeeded: true, reloadError: result.reloadError };
    } catch {
      return { succeeded: false, error: "Couldn't reach the daemon." };
    }
  }

  // Call before discarding an instance (e.g. before a full-container
  // innerHTML rebuild) so its internal Dropdown doesn't linger.
  destroy() {
    this.dropdown?.destroy();
    this.dropdown = null;
  }
}
