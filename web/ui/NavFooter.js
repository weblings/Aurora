// Shared onboarding wizard footer -- Back (omitted on a screen's first
// step) / Continue, centered as a pair (docs/WebUI/
// WebUI_Design_2.5Pass.md's NUX Polish Pass -- RockyRoad's own real
// shared `.frame .actions` bar, not a guess). Replaces reliance on the top
// bar's own back arrow, which was never consistently positioned or
// present screen to screen -- the root complaint that started this
// redesign. Same one-call render+wire shape as topBar.js's renderTopBar.
export function renderNavFooter(container, { showBack = true, onBack, backLabel = 'Back', backIcon = true, continueLabel = 'Continue', onContinue }) {
  container.innerHTML = `
    <div class="nav-footer">
      ${showBack ? `
        <button type="button" class="btn btn-secondary nav-footer-back">
          ${backIcon ? '<img src="icons/back-arrow.svg" alt="" class="nav-footer-back-icon" />' : ''}
          <span>${escapeHtml(backLabel)}</span>
        </button>
      ` : ''}
      <button type="button" class="btn btn-primary nav-footer-continue">${escapeHtml(continueLabel)}</button>
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
