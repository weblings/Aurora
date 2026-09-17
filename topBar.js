// Shared top-bar renderer -- the one reusable piece enforcing "one top bar
// formula, everywhere" structurally (see Analysis/WebUI/WebUI_Design_1stPass.md's Shell
// conventions) instead of leaving every screen to copy the markup by hand.
//
// options:
//   title       (string, required)
//   showBack    (bool, default false)
//   onBack      (() => void, required if showBack)
//   statusPill  (string, optional -- Dashboard only per the spec)
export function renderTopBar(container, { title, showBack = false, onBack, statusPill = null }) {
  container.innerHTML = `
    <div class="top-bar">
      ${showBack ? '<button type="button" class="top-bar-back">&larr; Back</button>' : '<span></span>'}
      <h1 class="top-bar-title">${escapeHtml(title)}</h1>
      <div class="top-bar-trailing">
        ${statusPill ? `<span class="status-pill">${escapeHtml(statusPill)}</span>` : ''}
      </div>
    </div>
  `;

  if (showBack) {
    container.querySelector('.top-bar-back').addEventListener('click', onBack);
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
