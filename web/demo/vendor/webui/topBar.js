// Shared top-bar renderer -- the one reusable piece enforcing "one top bar
// formula, everywhere" structurally (see docs/WebUI/WebUI_Design_1stPass.md's Shell
// conventions) instead of leaving every screen to copy the markup by hand.
//
// options:
//   title          (string, required -- also the logo fallback text and alt)
//   logo           ({ src, alt }, optional -- renders an image in place of the
//                   title text, e.g. Dashboard's brand mark. Height is fixed
//                   in CSS so the bar row cannot resize.)
//   showBack       (bool, default false)
//   onBack         (() => void, required if showBack)
//   statusPill     (string, optional -- Dashboard only per the spec)
//   trailingButton ({ label, onClick, icon }, optional -- Dashboard's own
//                   Stop button, 2.5 pass. Re-wired on every call, same as
//                   onBack, since this function always rebuilds the bar's
//                   whole innerHTML. icon (optional, a path under icons/)
//                   renders in place of the visible label -- label still
//                   becomes the button's aria-label, so it stays
//                   accessible with nothing visible to read.)
export function renderTopBar(container, { title, logo = null, showBack = false, onBack, statusPill = null, trailingButton = null }) {
  const titleContent = logo
    ? `<img src="${escapeHtml(logo.src)}" alt="${escapeHtml(logo.alt ?? title)}" class="top-bar-logo" />`
    : escapeHtml(title);
  const trailingBtnContent = trailingButton?.icon
    ? `<img src="${escapeHtml(trailingButton.icon)}" alt="" class="top-bar-trailing-icon" />`
    : escapeHtml(trailingButton?.label ?? '');
  const trailingBtnLabelAttr = trailingButton?.icon ? ` aria-label="${escapeHtml(trailingButton.label)}"` : '';
  const trailingBtnClass = trailingButton?.icon ? 'btn btn-secondary btn-icon' : 'btn btn-secondary';

  container.innerHTML = `
    <div class="top-bar${logo ? ' top-bar-with-logo' : ''}">
      ${showBack ? '<button type="button" class="top-bar-back">&larr; Back</button>' : '<span></span>'}
      <h1 class="top-bar-title">${titleContent}</h1>
      <div class="top-bar-trailing">
        ${statusPill ? `<span class="status-pill">${escapeHtml(statusPill)}</span>` : ''}
        ${trailingButton ? `<button type="button" class="${trailingBtnClass}" id="top-bar-trailing-btn"${trailingBtnLabelAttr}>${trailingBtnContent}</button>` : ''}
      </div>
    </div>
  `;

  if (showBack) {
    container.querySelector('.top-bar-back').addEventListener('click', onBack);
  }
  if (logo) {
    // Missing/unreadable artwork falls back to the title text, so the bar
    // never renders an empty slot (or a broken-image glyph).
    const logoImg = container.querySelector('.top-bar-logo');
    logoImg?.addEventListener('error', () => {
      logoImg.replaceWith(document.createTextNode(title));
    });
  }
  if (trailingButton) {
    container.querySelector('#top-bar-trailing-btn').addEventListener('click', trailingButton.onClick);
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
