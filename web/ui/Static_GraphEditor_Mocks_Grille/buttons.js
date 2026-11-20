// Aurora-u8jx.7 (stage 7.0h): the editor's button styling, three candidates on every button type, side by side.
// Static and self-contained: loaded before mock.js, drawn by mock.js's drawBoard('buttons'). It uses mock.js's el(), VS and ZEST at call time.
// Nothing here touches the real editor. The scheme classes (.bs-a / .bs-b / .bs-c) are defined in buttons.css.

const BS_SCHEMES = [
  ['bs-a', 'A · Grille spec', 'Grille small button everywhere: padding 6px 10px, 12px font, height is the content (about 27px). Icon buttons pad 6px.'],
  ['bs-b', 'B · the bar rule everywhere', 'Fixed 32px, padding-block 0, padding-inline 10px, gap 6px. Icon buttons 32px wide. Today\'s top-bar rule, applied to every button.'],
  ['bs-c', 'C · Rocky Road scheme', 'XR panel.css: 5px radius, 8px padding, 2px gap, 12px font. Default #333 on white, emphasised #dadada on dark, strong secondary #8b8b8b bold. Action buttons 150 x 36px at 13px.'],
  ['bs-cp', "C′ · Rocky Road, Grille's gap", "C with a 6px gap (B's) in place of XR's 2px, which was tuned for XR's padded icons. Radius, padding, colours and the 150 x 36 action are unchanged."],
]

function bsDraw(scheme) {
  const ic = (paths, grid = 32) => el('span', { 'aria-hidden': 'true', style: 'display:contents', html: `<svg class="ge-icon ge-vs" viewBox="0 0 ${grid} ${grid}">${paths}</svg>` })
  // state: 'hover' | 'pressed' | 'focus' | 'disabled'. Grille's own data attributes drive the look, as react-aria sets them in the editor.
  const attrsFor = (state) => ({
    'data-hovered': state === 'hover', 'data-pressed': state === 'pressed', 'data-focus-visible': state === 'focus',
    'data-disabled': state === 'disabled', disabled: state === 'disabled',
  })
  // kind: 'sec' (default) | 'pri' (emphasised) | 'strong' (C only: secondary-dark). role: 'action' = C's 150 x 36 form.
  const b = (label, { kind = 'sec', icon = false, state, role, name, extra = {} } = {}) => el('button', {
    type: 'button', class: `ui-button${role ? ` bs-${role}` : ''}${kind === 'strong' ? ' bs-strong' : ''}`, 'data-size': 'sm',
    'data-variant': kind === 'pri' ? 'primary' : undefined, 'data-icon': icon, 'aria-label': name, ...attrsFor(state), ...extra,
  }, label)
  const chev = () => ic(VS.chevDown)
  const warn = () => ic(ZEST.warning, 24)
  const ctx = (title, note, ...body) => el('section', { class: 'bs-ctx' }, el('h3', {}, title, note ? el('small', {}, note) : null), ...body)

  // ---- top bar ----
  const split = (state) => el('span', { class: 'bs-split' }, b([ic(VS.play), 'Test'], { state }), b(chev(), { icon: true, name: 'Test options', state }))
  const bar = (testKind) => el('div', { class: 'bs-bar' },
    b([ic(VS.back), 'Dashboard']), el('span', { class: 'bs-sep' }), b(['Screen colors', chev()]), el('span', { class: 'bs-grow' }),
    b(ic(ZEST.undo, 24), { icon: true, name: 'Undo' }), b(ic(ZEST.redo, 24), { icon: true, name: 'Redo', state: 'disabled' }),
    el('span', { class: 'bs-sep' }), b([warn(), '2 problems', chev()]),
    testKind === 'pri' ? el('span', { class: 'bs-split' }, b([ic(VS.play), 'Test'], { kind: 'pri' }), b(chev(), { icon: true, kind: 'pri', name: 'Test options' })) : split())

  // ---- canvas islands ----
  const islands = () => el('div', { class: 'bs-canvas' },
    el('div', { class: 'bs-corner' }, b([ic(VS.add), 'Add node'])),
    el('div', { class: 'bs-corner bs-right' }, b(['Dashboard controls', el('span', { class: 'bs-muted' }, '3')])),
    el('div', { class: 'bs-corner bs-bottom' }, b(['View', chev()])))

  // ---- drawer: Dashboard controls and details ----
  const drawer = () => el('div', { class: 'bs-drawer' },
    el('div', { class: 'bs-drawer-head' }, el('b', {}, 'Dashboard controls'), b(ic(VS.close), { icon: true, name: 'Close' })),
    ...[['Brightness', true], ['Speed', false]].map(([label, first]) => el('div', { class: 'bs-drow' }, el('span', {}, label),
      b(ic(VS.chevUp), { icon: true, name: 'Move up', state: first ? 'disabled' : undefined }), b(ic(VS.chevDown), { icon: true, name: 'Move down' }), b(ic(VS.close), { icon: true, name: 'Remove' }))),
    el('div', { class: 'bs-drow' }, el('span', {}, 'Zone count'), b(['Choose', chev()])))

  // ---- param widgets on a node ----
  const params = () => el('div', { class: 'bs-node' },
    el('div', { class: 'bs-node-title' }, 'Gradient'),
    ...['#ff4d4d 0%', '#4d79ff 100%'].map((s, i) => el('div', { class: 'bs-drow' }, el('i', { class: 'bs-sw', style: `background:${s.split(' ')[0]}` }), el('span', {}, s), b(ic(ZEST.minus, 24), { icon: true, name: 'Remove stop', state: i === 0 ? 'disabled' : undefined }))),
    el('div', { class: 'bs-drow' }, b([ic(VS.add), 'Add stop']), b(['Reverse'])))

  // ---- problems chip, popover, shell row, toast, dialog ----
  const callouts = () => el('div', { class: 'bs-stack' },
    el('div', { class: 'bs-row' }, el('p', {}, warn(), " Couldn't apply settings: no output is paired."), b('Retry'), b(ic(VS.close), { icon: true, name: 'Dismiss' })),
    el('div', { class: 'bs-row' }, el('p', {}, 'An agent is testing an effect on the lights.'), b('Stop test')),
    el('div', { class: 'bs-toast' }, el('span', {}, 'Removed Brightness from the Dashboard'), b('Undo')))
  const dialog = () => el('div', { class: 'bs-dialog' },
    el('b', {}, 'Keep your unsaved edits?'), el('p', {}, 'The effect on disk changed while you were editing.'),
    el('div', { class: 'bs-dialog-actions' }, b('Discard', { role: 'action' }), b('Keep my edits', { kind: 'pri', role: 'action' })))

  // ---- emphasis x state matrix ----
  const STATES = [['default'], ['hover', 'hover'], ['pressed', 'pressed'], ['focus', 'focus'], ['disabled', 'disabled']]
  const kinds = scheme.startsWith('bs-c') ? [['sec', 'Default'], ['pri', 'Emphasised'], ['strong', 'Strong secondary']] : [['sec', 'Secondary'], ['pri', 'Primary']]
  const matrix = () => el('div', { class: 'bs-matrix-wrap' }, el('table', { class: 'bs-matrix' },
    el('thead', {}, el('tr', {}, el('th', {}), ...STATES.map(([l]) => el('th', {}, l)))),
    el('tbody', {},
      ...kinds.flatMap(([k, label]) => [
        el('tr', {}, el('th', {}, label, ' text'), ...STATES.map(([, s]) => el('td', {}, b(['Add node'], { kind: k, state: s })))),
        el('tr', {}, el('th', {}, label, ' icon'), ...STATES.map(([, s]) => el('td', {}, b(ic(VS.add), { icon: true, kind: k, name: 'Add', state: s })))),
      ]),
      el('tr', {}, el('th', {}, 'Action 150x36 in C'), ...STATES.map(([, s]) => el('td', {}, b('Keep my edits', { kind: 'pri', role: 'action', state: s })))))))

  const meta = BS_SCHEMES.find(([c]) => c === scheme)
  return el('figure', { class: `bs ${scheme === 'bs-cp' ? 'bs-c bs-cp' : scheme}` }, el('figcaption', {}, el('b', {}, meta[1]), el('span', {}, meta[2])),
    ctx('Top bar', 'Back, title menu, Undo / Redo (Redo disabled), problems chip, Test split button', bar('sec')),
    ctx('Top bar, Test on lights as primary', 'The mock\'s other Decision switch', bar('pri')),
    ctx('Canvas islands', 'Add node, Dashboard controls with its muted count, View', islands()),
    ctx('Drawer', 'Dashboard controls: close, move up (first row disabled), move down, remove, a Choose menu', drawer()),
    ctx('Param widgets', 'Gradient stops: remove (one disabled), Add stop, a plain text button', params()),
    ctx('Shell row, notice row, toast', 'Retry, Dismiss, Stop test, toast Undo', callouts()),
    ctx('Dialog', 'Discard and Keep my edits: the action form in C', dialog()),
    ctx('Emphasis by state', 'Hover, pressed, focus and disabled are forced with Grille\'s own data attributes', matrix()))
}

// The measured heights come from the drawn buttons, so they stay true if a rule changes.
function bsMeasure(root) {
  const table = root.querySelector('.bs-measure tbody')
  const rows = [['Text button (Add node)', '.bs-matrix tbody tr:nth-child(1) .ui-button'], ['Icon button', '.bs-matrix tbody tr:nth-child(2) .ui-button'],
    ['Primary text button', '.bs-matrix tbody tr:nth-child(3) .ui-button'], ['Dialog action', '.bs-dialog .ui-button']]
  for (const [label, sel] of rows) {
    table.append(el('tr', {}, el('th', {}, label), ...BS_SCHEMES.map(([c]) => {
      const node = root.querySelector(`.${c} ${sel}`)
      const r = node?.getBoundingClientRect()
      return el('td', {}, r ? `${Math.round(r.width)} x ${Math.round(r.height * 10) / 10} px` : '-')
    })))
  }
}

function bsSection(s6section, s6note) {
  const sec = s6section('s7-buttons', 'Aurora-u8jx.7 (7.0h)', 'One button feel for the whole editor',
    'Every button type drawn three ways, same screens side by side. Real Grille buttons (data-size="sm"), with only the scheme CSS differing, so the difference you see is the proposal. The real editor is unchanged.',
    el('table', { class: 'bs-measure' }, el('thead', {}, el('tr', {}, el('th', {}, 'Measured'), ...BS_SCHEMES.map(([, l]) => el('th', {}, l)))), el('tbody', {})),
    el('div', { class: 'bs-cols' }, ...BS_SCHEMES.map(([c]) => bsDraw(c))),
    s6note('Open question to settle: is 32px a bar-only rule or the editor-wide height (compare B against A on the canvas islands and the drawer rows). Grille has no menu-item size matching its small button (see u8jx.4.3), so menu rows pad separately in all three. Owner picks, then the pick and reason are recorded on Aurora-u8jx.7 and a follow-up applies it.'))
  setTimeout(() => bsMeasure(sec), 0)
  return sec
}
