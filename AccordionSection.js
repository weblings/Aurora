// Collapsible section -- Dashboard's Tuning/Bridge accordion areas
// (Analysis/WebUI/WebUI_Design_2ndPass.md). Needs a real external API from
// the start (.expand()/.collapse(), not just internal click-to-toggle
// state): the Dashboard's "See all zones" link needs to command Bridge's
// section open from *outside* it -- Zone Mapping's top tier has no other
// way to reach into a sibling section's own state.
//
// Collapsed content stays mounted (hidden via the `hidden` attribute, not
// torn down) so a caller's own sub-components inside it don't need to be
// destroyed/recreated on every collapse -- expand() just needs to reveal
// what's already there.
export class AccordionSection {
  // title: header text. expanded: initial state (false by default --
  // Dashboard's own accordions start collapsed, see WebUI_Design_2ndPass.md's
  // video/audio mockups).
  constructor(container, { title, expanded = false }) {
    this.container = container;
    this._expanded = expanded;

    this.container.innerHTML = `
      <div class="accordion-section${expanded ? ' expanded' : ''}">
        <button type="button" class="accordion-header" aria-expanded="${expanded ? 'true' : 'false'}">
          <span class="accordion-title"></span>
          <span class="accordion-chevron" aria-hidden="true">▾</span>
        </button>
        <div class="accordion-content"></div>
      </div>
    `;

    this.root = this.container.querySelector('.accordion-section');
    this.header = this.container.querySelector('.accordion-header');
    this.titleEl = this.container.querySelector('.accordion-title');
    this.contentEl = this.container.querySelector('.accordion-content');
    this.titleEl.textContent = title;
    this.contentEl.hidden = !expanded;

    this.header.addEventListener('click', () => this.toggle());
  }

  // Exposed so a caller can mount its own sub-components directly into it
  // (DashboardScreen holds the instance and reaches this for composing
  // Tuning/Bridge's own content) -- same "caller owns what goes inside"
  // convention every other component here already uses.
  get content() {
    return this.contentEl;
  }

  get expanded() {
    return this._expanded;
  }

  setTitle(title) {
    this.titleEl.textContent = title;
  }

  expand() {
    if (this._expanded) return;
    this._expanded = true;
    this.root.classList.add('expanded');
    this.header.setAttribute('aria-expanded', 'true');
    this.contentEl.hidden = false;
  }

  collapse() {
    if (!this._expanded) return;
    this._expanded = false;
    this.root.classList.remove('expanded');
    this.header.setAttribute('aria-expanded', 'false');
    this.contentEl.hidden = true;
  }

  toggle() {
    if (this._expanded) this.collapse();
    else this.expand();
  }
}
