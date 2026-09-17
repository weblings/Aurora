// Shared onboarding wizard footer -- Back (bottom-left, omitted on a
// screen's first step) / Continue (bottom-right), on every screen
// (Analysis/WebUI/WebUI_Design_2ndPass.md). Replaces reliance on the top
// bar's own back arrow, which was never consistently positioned or
// present screen to screen -- the root complaint that started this
// redesign. Same one-call render+wire shape as topBar.js's renderTopBar.
export function renderNavFooter(container, { showBack = true, onBack, continueLabel = 'Continue', onContinue }) {
  container.innerHTML = `
    <div class="nav-footer">
      ${showBack ? '<button type="button" class="btn btn-secondary nav-footer-back">Back</button>' : '<span></span>'}
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
