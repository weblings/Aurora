// Shared onboarding wizard footer: Back (omitted on a screen's first step) and
// Continue, centered as a pair. The React island (graph-editor/src/islands) draws it
// on Grille buttons. islands.js loads before app.js, so window.auroraIslands is there
// when a screen renders. Re-render with new options to change labels or disable Continue.
const unmounts = new WeakMap();
let warned = false;

export function renderNavFooter(container, { showBack = true, onBack, backLabel = 'Back', backIcon = true, continueLabel = 'Continue', continueDisabled = false, onContinue }) {
  unmounts.get(container)?.();
  unmounts.delete(container);
  container.innerHTML = '';

  const mount = globalThis.auroraIslands?.mountNavFooter;
  if (mount) {
    unmounts.set(container, mount(container, { showBack, onBack, backLabel, backIcon, continueLabel, continueDisabled, onContinue }));
    return;
  }

  // The bundle is required for app builds. This keeps onboarding usable if it failed to load.
  if (!warned) {
    warned = true;
    console.error('NavFooter: islands.js is not loaded, using plain buttons');
  }
  container.innerHTML = `
    <div class="nav-footer">
      ${showBack ? `<button type="button" class="btn btn-secondary nav-footer-back">${escapeHtml(backLabel)}</button>` : ''}
      <button type="button" class="btn btn-primary nav-footer-continue"${continueDisabled ? ' disabled' : ''}>${escapeHtml(continueLabel)}</button>
    </div>
  `;
  if (showBack) {
    container.querySelector('.nav-footer-back').addEventListener('click', onBack);
  }
  container.querySelector('.nav-footer-continue').addEventListener('click', onContinue);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
