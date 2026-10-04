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
//   trailingButtons ([{ id, label, onClick, icon, buttonClass, disabled }],
//                   optional -- replaces trailingButton when present.
//                   Dashboard's Pause + Stop pair (Aurora-5ipy.13): ids are
//                   caller-chosen so each button keeps a stable handle;
//                   buttonClass overrides the default icon/text styling
//                   (Stop uses .top-bar-power-btn to read lighter than
//                   Pause); disabled renders the native attribute.
export function renderTopBar(container, { title, logo = null, showBack = false, onBack, statusPill = null, trailingButton = null, trailingButtons = null }) {
  const titleContent = logo
    ? `<img src="${escapeHtml(logo.src)}" alt="${escapeHtml(logo.alt ?? title)}" class="top-bar-logo" />`
    : escapeHtml(title);
  const buttons = trailingButtons
    ?? (trailingButton ? [{ ...trailingButton, id: 'top-bar-trailing-btn' }] : []);
  const buttonsHtml = buttons.map((button, index) => {
    const id = button.id ?? `top-bar-trailing-btn-${index}`;
    const content = button.icon
      ? `<img src="${escapeHtml(button.icon)}" alt="" class="top-bar-trailing-icon" />`
      : escapeHtml(button.label ?? '');
    const labelAttr = button.icon ? ` aria-label="${escapeHtml(button.label)}"` : '';
    const buttonClass = button.buttonClass
      ?? (button.icon ? 'btn btn-secondary btn-icon' : 'btn btn-secondary');
    const disabledAttr = button.disabled ? ' disabled' : '';
    return `<button type="button" class="${buttonClass}" id="${escapeHtml(id)}"${labelAttr}${disabledAttr}>${content}</button>`;
  }).join('');

  container.innerHTML = `
    <div class="top-bar${logo ? ' top-bar-with-logo' : ''}">
      ${showBack ? '<button type="button" class="top-bar-back">&larr; Back</button>' : '<span></span>'}
      <h1 class="top-bar-title">${titleContent}</h1>
      <div class="top-bar-trailing">
        ${statusPill ? `<span class="status-pill">${escapeHtml(statusPill)}</span>` : ''}
        ${buttonsHtml}
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
  for (const [index, button] of buttons.entries()) {
    // Ids are caller-chosen ([a-z-] by convention), so no CSS.escape
    // dependency -- keeps this importable in plain-node tests.
    const id = button.id ?? `top-bar-trailing-btn-${index}`;
    container.querySelector(`#${id}`)?.addEventListener('click', button.onClick);
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
