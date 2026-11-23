// Settings accordion content (Aurora-vxhm): the first general settings. Every
// row saves at once like the rest of the Dashboard. Rows are shown only where
// they apply, so the panel is empty-state aware: no rows, no accordion.
//
// Launch Automatically in Game Mode (Aurora-xg8z) is the gameModeAutostart config flag,
// read by tools/steamos/aurora-gamemode.sh before each Game Mode start; the
// unit stays enabled and the flag is the switch. Shown only when the host
// reports the launcher unit installed (capabilities.gameModeLauncher).
export class SettingsPanel {
  // capabilities: the GET /api/capabilities body. onUnreachable: the shell's
  // checkNow, for a request that never got an answer.
  constructor(container, { capabilities, onUnreachable }) {
    this.container = container;
    this.onUnreachable = onUnreachable;
    this.showGameMode = capabilities?.gameModeLauncher === true;
  }

  // True when at least one row applies; the Dashboard skips the accordion otherwise.
  get hasRows() {
    return this.showGameMode;
  }

  async render() {
    this.container.innerHTML = '';
    if (this.showGameMode) {
      await this._renderGameMode();
    }
  }

  async _renderGameMode() {
    let enabled = true;
    try {
      const config = await (await fetch('/api/config')).json();
      enabled = config.gameModeAutostart !== false;
    } catch {
      this.onUnreachable?.();
      return;
    }

    const row = document.createElement('label');
    row.className = 'toggle-row settings-game-mode';
    row.innerHTML = `
      <span class="toggle-row-label">Launch Automatically in Game Mode</span>
      <span class="toggle-switch">
        <input type="checkbox" ${enabled ? 'checked' : ''} />
        <span class="toggle-knob"></span>
      </span>
    `;
    const hint = document.createElement('p');
    hint.className = 'status-text settings-hint';
    hint.textContent = 'Takes effect the next time Game Mode starts.';
    const error = document.createElement('p');
    error.className = 'status-text settings-error';
    error.hidden = true;
    this.container.append(row, hint, error);

    const input = row.querySelector('input');
    input.addEventListener('change', async () => {
      const wanted = input.checked;
      error.hidden = true;
      try {
        const result = await (await fetch('/api/config', {
          method: 'PUT',
          body: JSON.stringify({ gameModeAutostart: wanted }),
        })).json();
        if (!result.succeeded) throw new Error(result.error ?? 'save failed');
      } catch (e) {
        input.checked = !wanted;
        if (e instanceof TypeError) this.onUnreachable?.();
        error.textContent = 'Could not save this setting.';
        error.hidden = false;
      }
    });
  }
}
