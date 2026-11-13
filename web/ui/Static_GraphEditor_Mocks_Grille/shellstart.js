// Aurora-u8jx.12: how a shell with 2+ rows starts, laid out by decision. Loaded before mock.js, drawn by drawBoard('start').
// Uses mock.js board helpers at call time. Static, except that the capped region really scrolls. Nothing here touches the editor.
// Windows are drawn at their TRUE height, so the canvas left over is what the shell costs. The share is measured live.

function ssSection(s6section, s6note) {
  const E1 = LONE
  const E2 = { ...ROWS.tooMany, err: true }
  const N1 = { ...ROWS.agentTest, text: 'An agent is testing an effect on the lights. 12\u00a0s left.' }
  const SET3 = [N1, E1, E2] // the worst case the owner named: notice, Retry error, error
  const counts = (rows) => ({ e: rows.filter((r) => r.err).length, n: rows.filter((r) => r.notice).length })

  const region = (rows, extra = {}) => s6('div', `ss-region${extra.focus ? ' s6-focus' : ''}`, { role: 'region', 'aria-label': 'Errors and notices', ...extra.attrs }, ...rows.map(shellRow))
  // How the shell is drawn: open and unbounded, open and capped (scrolls), or collapsed.
  const shell = (mode, rows, extra) => {
    const c = counts(rows)
    if (mode === 'collapsed') return shellBand(collapsedBar(c.e, c.n))
    if (mode === 'capped') return shellBand(region(rows, extra), showLess())
    return shellBand(...rows.map(shellRow), showLess())
  }
  // A window at its true height. Band on top; the canvas takes what is left, and the share the band took is measured.
  const win = ({ w, h, dash = false, chipN = 2 }, band) => {
    const compact = w <= 649
    const bar = dash ? s6('div', 'ss-dashbar', el('b', {}, 'Aurora'), s6('span', 'ge-spacer'), btn('Pause'), btn('Quit')) : s6bar({ iconBack: w <= 400, right: chip(chipN, true, { compact }) })
    return s6('div', `ss-win s7-w${compact ? ' s7-compact' : ''}${dash ? ' ss-dash' : ''}`, { style: `width:${w}px;height:${h}px;--ss-vh:${h}px` },
      band, bar, s6('div', 's6-canvas ss-canvas', 'The graph canvas', s6('small', 'ss-left', '')))
  }
  const fig = (label, node) => s6('figure', 's6-panel ss-fig', s6('figcaption', '', label), node)
  const strip = (...f) => s6('div', 'ss-strip', ...f)
  const W400 = { w: 400, h: 650 }, W650 = { w: 650, h: 650 }

  const sec = s6section('s7-start', 'Aurora-u8jx.12', 'How a shell with 2+ rows starts',
    'Aurora-u8jx.5 already re-opens the shell when a row appears or a message changes, which breaks ErrorOverlay.md:186 ("two or more collapse so several errors can\'t eat the window"). Two decisions are left, and they are independent: whether the open shell is capped in height, and whether 2+ rows start open or collapsed at page load. Each section below isolates one, with the same rows on both sides: a notice (light test, with its countdown text), a Retry error and an error with no button. Windows are drawn at true height, so what is left of the canvas is what the shell costs; the number under each is measured.',

    s6('h3', 'ss-h3', 'Decision 1. Is the open shell capped in height, so it scrolls?'),
    s6('p', 's6-lead', 'Only matters where three rows do not fit. They fit at 650 px wide and up (one row 79 px, two 166, three 218), so the left pair shows that nothing changes there. The right pair is the case that differs: three rows in a 400 px wide window.'),
    strip(
      fig('650 x 650, no cap (A). Cap would not bite: identical', win(W650, shell('open', SET3))),
      fig('400 x 650, no cap (A). Three rows push the bar down', win(W400, shell('open', SET3))),
      fig('400 x 650, capped (C). Region scrolls, Show less stays pinned', win(W400, shell('capped', SET3)))),

    s6('h3', 'ss-h3', 'Decision 2. Does a page that loads with 2+ rows start open or collapsed?'),
    s6('p', 's6-lead', 'Assumes the cap above, which bounds what open costs. Open: the reason and the Retry button are on screen at once. Collapsed: the red "N errors" count says something is wrong, and one click shows why. A lone row starts open either way (Aurora-u8jx.5). Later rows always re-open the shell, whichever you pick. Dashboard-styled frame included, since the shell is shared.'),
    strip(
      fig('Open at load, 400 x 650', win(W400, shell('capped', SET3))),
      fig('Collapsed at load (B), 400 x 650', win(W400, shell('collapsed', SET3))),
      fig('Open at load, Dashboard styled, 650 x 650', win({ ...W650, dash: true }, shell('capped', SET3))),
      fig('Collapsed at load (B), Dashboard styled, 650 x 650', win({ ...W650, dash: true }, shell('collapsed', SET3))),
      fig('Collapsed only matters before the first /api/state reply too: nothing is known yet, so no band is drawn, and if rows arrive the page below moves down once', win(W650, null))),

    s6('h3', 'ss-h3', 'Decision 3. The cap value (only if Decision 1 is "capped")'),
    s6('p', 's6-lead', 'max-height: min(35vh, 220px). A third of the window, never more than 220 px. Drawn for three rows in a 400 px wide window at three window heights; the region height and the share of the window are measured.'),
    strip(
      fig('400 x 500: 35vh = 175 px', win({ w: 400, h: 500 }, shell('capped', SET3))),
      fig('400 x 650: 220 px (cap)', win(W400, shell('capped', SET3))),
      fig('400 x 900: 220 px (cap)', win({ w: 400, h: 900 }, shell('capped', SET3)))),

    s6('h3', 'ss-h3', 'The capped shell in use (shown if Decision 1 is "capped")'),
    s6('p', 's6-lead', 'Scroll hint: a fade at whichever edge has more rows beyond it (bottom at rest, both once scrolled, top only at the end) and a thin scrollbar that stays drawn. The region is a tab stop only when it overflows, so a short list adds no empty stop. Show less is outside the region and collapses the whole shell, as in Aurora-u8jx.5.'),
    strip(
      fig('Focus on the region: ring, and arrows or PageUp/Down scroll it', win(W400, shellBand(region(SET3, { focus: true, attrs: { tabindex: '0' } }), showLess()))),
      fig('Tab on into the rows: the browser scrolls the focused Retry into view', win(W400, shellBand(region(SET3, { attrs: { 'data-focus-retry': '1' } }), showLess()))),
      fig('After Show less', win(W400, shell('collapsed', SET3)))),
    s6note('Drafted here: the max-height, the fade and thin scrollbar, the region tab stop, the empty first-reply state. The Dashboard frame approximates shell.css with Aurora tokens and Grille buttons. Mixes left to the decisions above: capped + open at load is C; capped + collapsed is C+B; uncapped + open is A; uncapped + collapsed is B.'))

  const sync = (r) => {
    const over = r.scrollHeight > r.clientHeight + 1
    r.classList.toggle('ss-over', over)
    r.classList.toggle('ss-less', over && r.scrollTop > 1)
    r.classList.toggle('ss-more', over && r.scrollTop + r.clientHeight < r.scrollHeight - 1)
    if (over) r.setAttribute('tabindex', '0'); else if (!r.classList.contains('s6-focus')) r.removeAttribute('tabindex')
  }
  setTimeout(() => {
    sec.querySelectorAll('.ss-region').forEach((r) => {
      sync(r); r.addEventListener('scroll', () => sync(r))
      if (r.dataset.focusRetry) { const b = r.querySelector('.s6-row-actions .ui-button'); if (b) { b.classList.add('s6-focus'); b.scrollIntoView({ block: 'nearest' }); sync(r) } }
    })
    sec.querySelectorAll('.ss-win').forEach((wn) => {
      const band = wn.querySelector('.s6-band'), h = wn.getBoundingClientRect().height
      const used = band ? Math.round(band.getBoundingClientRect().height) : 0
      const r = wn.querySelector('.ss-region')
      wn.querySelector('.ss-left').textContent = `shell ${used} px = ${Math.round((used / h) * 100)}% of ${Math.round(h)}${r ? `; region ${Math.round(r.clientHeight)} px${r.scrollHeight > r.clientHeight + 1 ? ', scrolls' : ', fits'}` : ''}`
    })
  }, 0)
  return sec
}
