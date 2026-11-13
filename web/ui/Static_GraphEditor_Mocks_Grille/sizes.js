// Aurora-u8jx.11: the button sizes the editor ends up with on Grille 0.1.0-dev.15, drawn with Grille's own button and icon rules.
// Loaded before mock.js, drawn by mock.js's drawBoard('sizes'). Uses el(), VS and ZEST at call time. Nothing here touches the real editor.

function szSection(s6section, s6note) {
  // Grille's Icon: size 'sm' is a 12px layout box, the default is 16px (the 4px overhang is pulled back by a negative margin).
  const ic = (paths, grid, sm) => el('span', { 'aria-hidden': 'true', style: 'display:contents', html: `<svg class="ui-icon" ${sm ? 'data-size="sm"' : ''} viewBox="0 0 ${grid} ${grid}" fill="currentColor">${paths}</svg>` })
  const btn = (kids, { icon = false, name, sm } = {}) => el('button', { type: 'button', class: 'ui-button', 'data-icon': icon, 'data-size': sm ? 'sm' : undefined, 'aria-label': name }, kids)
  const undo = (sm) => btn(ic(ZEST.undo, 24, true), { icon: true, name: 'Undo', sm })
  const redo = (sm) => btn(ic(ZEST.redo, 24, true), { icon: true, name: 'Redo', sm })
  const bar = (sm) => el('div', { class: 'sz-bar' },
    btn([ic(VS.back, 32, true), 'Dashboard']), el('span', { class: 'sz-grow' }), btn(['Screen colors', ic(VS.chevDown, 32, true)]),
    undo(sm), redo(sm), btn([ic(VS.play, 32, true), 'Test']))
  const row = (label, note, b) => el('tr', {}, el('th', {}, label, el('small', {}, note)), el('td', {}, b), el('td', { class: 'sz-h' }))
  const sec = s6section('s7-sizes', 'Aurora-u8jx.11', 'Button sizes on Grille dev.15',
    'Real Grille buttons at their default size (the 31px Rocky Road form). The heights in the right-hand column are measured from what is drawn. From dev.16 an icon-only button (data-icon) is a 31px square whatever the glyph; the same button with data-size="sm" is still padding plus the glyph (24px with a 12px glyph). The first bar below uses the sm form for Undo and Redo, the second is as shipped.',
    el('table', { class: 'sz-table' }, el('tbody', {},
      row('Text button', 'Dashboard, Add node, Test: 8px padding + a 15px line', btn('Add node')),
      row('Text button with a 12px glyph', 'Bar buttons: the glyph is size="sm" and does not set the height', btn([ic(VS.add, 32, true), 'Add node'])),
      row('Icon-only (data-icon), 12px glyph', 'Grille Button icon, 12px glyph: dense panels (Dashboard controls, Remove stop), and the bar', btn(ic(ZEST.undo, 24, true), { icon: true, name: 'Undo' })),
      row('Icon-only (data-icon), 16px glyph', 'Same button, 16px glyph: the same 31px square', btn(ic(ZEST.undo, 24, false), { icon: true, name: 'Undo' })))),
    el('div', { class: 'sz-bars' },
      el('figure', {}, el('figcaption', {}, el('b', {}, 'Bar on dev.15: Undo / Redo as size="sm" icon buttons'), el('span', { class: 'sz-bar-h' }), 'Undo and Redo are 24px, so they shrink below the 31px line the others share.'), bar(true)),
      el('figure', {}, el('figcaption', {}, el('b', {}, 'Bar on dev.16 (shipped): Undo / Redo are 31px squares'), el('span', { class: 'sz-bar-h' }), 'Every button fills the 31px band the guides mark, and the bar is 48px.'), bar(false))),
    s6note('Settled by Grille-kca (dev.16): no local height rule in the editor.'))
  setTimeout(() => {
    sec.querySelectorAll('.sz-table tr').forEach((tr) => { const r = tr.querySelector('.ui-button').getBoundingClientRect(); tr.querySelector('.sz-h').textContent = `${Math.round(r.width)} x ${Math.round(r.height * 10) / 10} px` })
    sec.querySelectorAll('figure').forEach((f) => { f.querySelector('.sz-bar-h').textContent = ` bar ${Math.round(f.querySelector('.sz-bar').getBoundingClientRect().height)} px · ` + [...f.querySelectorAll('.ui-button[data-icon]')].map((b) => `${b.getAttribute('aria-label')} ${Math.round(b.getBoundingClientRect().height)}`).join(', ') })
  }, 0)
  return sec
}
