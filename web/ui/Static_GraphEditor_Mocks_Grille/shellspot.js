// Aurora-u8jx.14: the shell without a scroll view, newest-first order, counts and a one-pulse spotlight on arrivals.
// Loaded before mock.js, drawn by drawBoard('spot'). Uses mock.js helpers (s6, shellRow, shellBand, showLess, btn, el, chip, s6bar,
// errSvg, infoSvg, chevron, plural) at call time. Nothing here touches the editor or shell code.
//
// LiveShell mirrors what a keyed React list (ErrorShell.tsx) or a keyed patch (shell.js after the .5 "skip the write when the markup
// is unchanged" fix) would do: row elements are cached by key and reused, so a pulse in flight is not restarted by the next poll.

function spotSection(s6section, s6note) {
  const BRIDGE = (ip) => `Can't reach the Hue bridge at ${ip}. The lights won't update until it's back.`
  const CAT = {
    bridge: { source: 'bridge', kind: 'error', text: BRIDGE('192.168.1.20'), action: 'Retry' },
    bridge2: { source: 'bridge', kind: 'error', text: BRIDGE('192.168.1.31'), action: 'Retry' },
    editors: { source: 'editors', kind: 'error', text: "Couldn't check your last edit: too many editors are open. Close one to continue." },
    reload: { source: 'reload', kind: 'error', text: "Couldn't apply settings: no output is paired.", action: 'Retry' },
    display: { source: 'display', kind: 'condition', text: "The screen isn't being captured. Choose a display to continue.", action: 'Choose' },
    test: { source: 'test', kind: 'notice', text: 'An agent is testing an effect on the lights.', action: 'Stop test', timed: true },
    pair: { source: 'pair', kind: 'notice', text: 'Two Hue bridges were found. Pick one to pair.', action: 'Pick' },
    tab: { source: 'tab', kind: 'notice', text: 'Another editor tab is testing an effect on the lights.', action: 'Stop test' },
  }
  const keyOf = (r) => `${r.source}|${r.text}`
  const RANK = { notice: 0, condition: 1, error: 2 } // as the code orders them today: pairings, light test, conditions, errors

  class LiveShell {
    // o: { page, w, h, variant: 'neutral'|'tinted', rm, cap: true|false, say(fn) }
    constructor(o) {
      this.o = { page: 'editor', w: 650, h: 650, variant: 'tinted', rm: false, cap: true, ...o }
      this.rows = []; this.nextId = 1; this.secs = 15
      this.cache = new Map(); this.prev = null; this.collapsed = false; this.said = 'nothing announced yet'
      this.root = s6('div', 'ss-sp-live'); this.live = el('div', { class: 'ss-sp-sr', 'aria-live': 'polite', role: 'status' })
      this.region = null; this.io = null
      this.root.append(this.live)
    }
    // ---- events ----
    load(keys) { this.rows = []; this.prev = null; keys.forEach((k) => this.addRow(k)); this.render(true); this.log('page loaded: first render, no pulse') }
    addRow(k) { const r = { ...CAT[k], id: this.nextId++ }; this.rows = this.rows.filter((x) => x.source !== r.source); this.rows.push(r) }
    arrive(k) { this.addRow(k); this.render() }
    // A row that is genuinely new: the first canned row of that kind not on screen, else a numbered one, so the button always pulses.
    freshKey(kind) {
      const pool = Object.keys(CAT).filter((k) => CAT[k].kind === kind || (kind === 'error' && CAT[k].kind === 'condition'))
      const free = pool.find((k) => !this.rows.some((r) => r.source === CAT[k].source) && !(CAT[k].source === 'bridge' && k === 'bridge2'))
      if (free) return free
      const n = (this.n = (this.n || 0) + 1), k = `x${kind}${n}`
      CAT[k] = { source: k, kind, text: kind === 'notice' ? `Another notice, number ${n}: nothing needs doing.` : `Another problem, number ${n}: something else went wrong.`, action: kind === 'notice' ? null : 'Retry' }
      return k
    }
    drop(source) { this.rows = this.rows.filter((r) => r.source !== source); this.render() }
    tick(n) { this.secs = Math.max(0, this.secs - n); this.render() }
    log(m) { if (this.o.log) this.o.log(m) }
    sorted() {
      return [...this.rows].sort((a, b) => RANK[a.kind] - RANK[b.kind] || (a.kind === 'notice' ? a.id - b.id : b.id - a.id))
    }
    text(r) { return r.timed ? `${r.text} ${this.secs} s left.` : r.text }
    // ---- render ----
    render(first = false) {
      const rows = this.sorted(), keys = new Set(rows.map(keyOf))
      const fresh = first || !this.prev ? [] : rows.filter((r) => !this.prev.has(keyOf(r)))
      if (fresh.length) this.collapsed = false
      if (!rows.length) this.collapsed = false
      for (const k of [...this.cache.keys()]) if (!keys.has(k)) this.cache.delete(k)
      for (const r of rows) {
        const k = keyOf(r); let row = this.cache.get(k)
        if (!row) {
          row = shellRow({ text: this.text(r), action: r.action, err: r.kind !== 'notice', notice: r.kind === 'notice' }); row.dataset.kind = r.kind === 'notice' ? 'notice' : 'error'
          row.addEventListener('animationend', () => { delete row.dataset.new })
          this.cache.set(k, row)
        } else if (r.timed) row.querySelector('.s6-row-text > span').textContent = this.text(r)
        if (fresh.includes(r)) { row.dataset.new = ''; delete row.dataset.seen }
      }
      this.prev = keys
      this.draw(rows, fresh)
      if (fresh.length) {
        this.said = `${fresh.map((r) => this.text(r)).join(' ')}`
        this.live.textContent = ''; setTimeout(() => { this.live.textContent = this.said }, 30)
        this.log(`arrival: ${fresh.length === 1 ? '1 row' : fresh.length + ' rows'} pulse; shell re-opened; announced "${this.said.slice(0, 60)}${this.said.length > 60 ? '…' : ''}"`)
      }
    }
    draw(rows, fresh) {
      const keep = this.region && this.region.isConnected ? this.region.scrollTop : 0; this.region = null
      const o = this.o, e = rows.filter((r) => r.kind !== 'notice').length, n = rows.length - e
      const shown = rows
      let band = null
      if (rows.length && this.collapsed) {
        const part = (kind, cnt, w, mk) => s6('span', `s7-cnt${kind === 'error' ? ' s7-cnt-err' : ''}`, mk(), ` ${plural(cnt, w)}`)
        band = shellBand(s6('button', 's6-summary ss-sp-count', { type: 'button', 'aria-expanded': 'false', 'aria-label': `Show ${[n ? plural(n, 'notice') : '', e ? plural(e, 'error') : ''].filter(Boolean).join(' and ')}`, onclick: () => { this.collapsed = false; this.log('opened by the bar: all rows'); this.render2() } }, n ? part('notice', n, 'notice', infoSvg) : null, e ? part('error', e, 'error', errSvg) : null, chevron('cc-chev')))
      } else if (rows.length) {
        this.region = s6('div', 'ss-sp-region', { role: 'region', 'aria-label': 'Errors and notices' }, ...shown.map((r) => this.cache.get(keyOf(r))))
        const less = s6('button', 's6-summary s6-summary-up s6-summary-quiet', { type: 'button', 'aria-expanded': 'true', onclick: () => { this.collapsed = true; this.log('collapsed by you'); this.render2() } }, 'Show less ', chevron('cc-chev', true))
        band = shellBand(this.region, s6('div', 'ss-sp-foot', less))
      }
      const bar = o.page === 'dashboard' ? s6('div', 'ss-dashbar', el('b', {}, 'Aurora'), s6('span', 'ge-spacer'), btn('Pause'), btn('Quit')) : s6bar({ iconBack: o.w <= 400, right: chip(2, true, { compact: o.w <= 649 }) })
      const win = s6('div', `ss-win s7-w ss-sp-win${o.w <= 649 ? ' s7-compact' : ''}${o.page === 'dashboard' ? ' ss-dash' : ''}${o.rm ? ' ss-rm' : ''} ss-ring-${o.variant}${o.cap ? '' : ' ss-nocap'}`,
        { style: `width:${o.w}px;height:${o.h}px;--ss-vh:${o.h}px` }, band, bar, s6('div', 's6-canvas ss-canvas', 'The graph canvas', s6('small', 'ss-left', '')))
      this.root.replaceChildren(this.live, win)
      this.win = win
      if (this.region) this.region.scrollTop = keep // a keyed list keeps its scroll position across a render
      this.after(fresh)
    }
    render2() { this.draw(this.sorted(), []) } // a click: redraw the same keyed rows, no diff
    after(fresh) {
      const r = this.region, left = this.win.querySelector('.ss-left'); this.overCap = false
      if (this.io) { this.io.disconnect(); this.io = null }
      if (!r) { left.textContent = ''; return }
      const apply = () => {
        this.overCap = r.scrollHeight > r.clientHeight + 1
        r.classList.toggle('ss-over', this.overCap); r.toggleAttribute('data-gate', this.overCap)
        if (this.overCap) r.tabIndex = 0
        fade()
      }
      // the scroll hint from #s7-start: a fade at whichever edge has more rows beyond it
      const fade = () => {
        r.classList.toggle('ss-less', this.overCap && r.scrollTop > 1)
        r.classList.toggle('ss-more', this.overCap && r.scrollTop + r.clientHeight < r.scrollHeight - 1)
      }
      r.addEventListener('scroll', fade)
      // after layout
      requestAnimationFrame(() => {
        apply()
        const band = this.win.querySelector('.s6-band'), h = this.win.getBoundingClientRect().height
        left.textContent = `shell ${Math.round(band.getBoundingClientRect().height)} px = ${Math.round((band.getBoundingClientRect().height / h) * 100)}% of ${Math.round(h)}${this.overCap ? `; region capped at ${Math.round(r.clientHeight)} px, scrolls` : '; no scroll, every row visible'}`
        const nr = [...r.querySelectorAll('[data-new]')], mine = fresh.map((x) => this.cache.get(keyOf(x))).filter(Boolean)
        if (!nr.length || !mine.length || !this.overCap) return // every row is on screen: pulse at once
        // over the cap: scroll the first new row into view, start each pulse only once its row is visible
        const first = mine[0], top = first.offsetTop - 8, bot = first.offsetTop + first.offsetHeight + 8
        if (top < r.scrollTop) r.scrollTo({ top: Math.max(0, top), behavior: this.o.rm ? 'auto' : 'smooth' })
        else if (bot > r.scrollTop + r.clientHeight) r.scrollTo({ top: bot - r.clientHeight, behavior: this.o.rm ? 'auto' : 'smooth' })
        nr.forEach((x) => (x.dataset.wait = ''))
        this.io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting && en.target.hasAttribute('data-wait')) { en.target.removeAttribute('data-wait'); this.log('a pulse started because its row scrolled into view') } }), { root: r, threshold: 0.99 })
        nr.forEach((x) => this.io.observe(x))
      })
    }
  }

  // ---- a labelled live window with an event log ----
  const logBox = () => { const ul = s6('ul', 'ss-sp-log'); return { ul, push: (m) => { ul.prepend(el('li', {}, m)); while (ul.children.length > 5) ul.lastChild.remove() } } }
  const evBtn = (label, fn, o = {}) => el('button', { type: 'button', class: 'ui-button', 'data-size': 'sm', ...o, onclick: fn }, label)
  const sel = (label, opts, cur, fn) => s6('label', 'ss-sel', s6('b', '', label), el('select', { onchange: (e) => fn(e.target.value) }, ...opts.map(([v, t]) => el('option', { value: v, selected: String(v) === String(cur) }, t))))
  const tgl = (label, on, fn) => s6('span', 'ss-pick', s6('b', '', label), el('button', { type: 'button', class: `ui-button${on ? ' ss-on' : ''}`, 'data-size': 'sm', 'aria-pressed': String(on), onclick: fn }, on ? 'On' : 'Off'))

  // ---- 1. the playground ----
  function playground() {
    const st = { w: 650, h: 650, page: 'editor', variant: 'tinted', rm: false, cap: true }
    const host = s6('div', 'ss-sp-play'), lg = logBox()
    let live
    const start = (keys) => { live = new LiveShell({ ...st, log: lg.push }); live.load(keys); draw() }
    const rebuild = () => { const prev = live.rows.map((r) => r.source); start(prev.length ? prev : ['test', 'bridge', 'editors']) }
    let flip = 0
    const draw = () => host.replaceChildren(
      s6('div', 'ss-ctl',
        sel('Width', [[1470, '1470'], [650, '650'], [400, '400']], st.w, (v) => { st.w = +v; rebuild() }),
        sel('Page', [['editor', 'Editor'], ['dashboard', 'Dashboard']], st.page, (v) => { st.page = v; rebuild() }),
        sel('Window height', [[650, '650'], [420, '420 (forces the cap)']], st.h, (v) => { st.h = +v; rebuild() }),
        sel('Ring colour', [['tinted', 'Tinted by the mark'], ['neutral', 'Neutral, the border']], st.variant, (v) => { st.variant = v; rebuild() }),
        tgl('Reduced motion', st.rm, () => { st.rm = !st.rm; rebuild() }),
        tgl('60vh safety cap', st.cap, () => { st.cap = !st.cap; rebuild() })),
      s6('div', 'ss-sp-evs',
        evBtn('Reload page (no pulse)', () => start(['test', 'bridge', 'editors'])), evBtn('Load 1 row', () => start(['bridge'])), evBtn('Load 6 rows', () => start(['test', 'bridge', 'editors', 'display', 'pair', 'tab'])),
        evBtn('Collapse', () => { live.collapsed = true; live.render2() }),
        evBtn('Error arrives', () => live.arrive(live.freshKey('error'))),
        evBtn('Notice arrives', () => live.arrive(live.freshKey('notice'))),
        evBtn('Error + notice at once', () => { live.addRow(live.freshKey('error')); live.addRow(live.freshKey('notice')); live.render() }),
        evBtn('Bridge message changes', () => { live.rows = live.rows.filter((r) => r.source !== 'bridge'); live.addRow(flip++ % 2 ? 'bridge' : 'bridge2'); live.render() }),
        evBtn('5 s pass (countdown)', () => live.tick(5)),
        evBtn('Clear one row', () => { const r = live.sorted().pop(); if (r) live.drop(r.source) }),
        evBtn('Clear all', () => { live.rows = []; live.render() })),
      live.root, s6('p', 'ss-sp-said', s6('b', '', 'Live region would announce (polite): '), el('span', { id: 'ss-sp-said' }, '')), lg.ul)
    const t = setInterval(() => { const s = host.querySelector('#ss-sp-said'); if (s && live) s.textContent = live.said; if (!host.isConnected) clearInterval(t) }, 300)
    start(['test', 'bridge', 'editors'])
    return host
  }

  // ---- 2. frozen frames: the same pulse stopped at a point, so ring colour and spacing can be compared on paper ----
  // A static row in a band; --ss-t is how far into the 1375 ms pulse the frame is stopped. Rows are real shellRow markup.
  const frozen = (rows, { t = 0.2, variant = 'tinted', w = 650, h = 300, page = 'editor', gap = null }) => {
    const r = s6('div', 'ss-sp-region', ...rows.map((x) => { const row = shellRow({ text: x.text, action: x.action, err: x.kind !== 'notice', notice: x.kind === 'notice' }); row.dataset.kind = x.kind === 'notice' ? 'notice' : 'error'; if (x.pulse) { row.dataset.new = ''; row.classList.add('ss-freeze') } return row }))
    if (gap) r.style.setProperty('--ss-gap', `${gap}px`)
    const bar = page === 'dashboard' ? s6('div', 'ss-dashbar', el('b', {}, 'Aurora'), s6('span', 'ge-spacer'), btn('Pause'), btn('Quit')) : s6bar({ iconBack: w <= 400, right: chip(2, true, { compact: w <= 649 }) })
    const win = s6('div', `ss-win s7-w ss-sp-win${w <= 649 ? ' s7-compact' : ''}${page === 'dashboard' ? ' ss-dash' : ''} ss-ring-${variant}`, { style: `width:${w}px;height:${h}px;--ss-vh:${h}px;--ss-t:${-Math.round(t * 1375)}ms` }, shellBand(r, s6('div', 'ss-sp-foot', s6('button', 's6-summary s6-summary-up s6-summary-quiet', { type: 'button' }, 'Show less ', chevron('cc-chev', true)))), bar, s6('div', 's6-canvas ss-canvas', 'The graph canvas'))
    return win
  }
  const fig = (label, node) => s6('figure', 's6-panel ss-fig', s6('figcaption', '', label), node)
  const strip = (...f) => s6('div', 'ss-strip', ...f)
  const E = (extra = {}) => ({ kind: 'error', text: CAT.bridge.text, action: 'Retry', ...extra })
  const E2 = (extra = {}) => ({ kind: 'error', text: CAT.editors.text, ...extra })
  const N = (extra = {}) => ({ kind: 'notice', text: `${CAT.test.text} 12 s left.`, action: 'Stop test', ...extra })

  // ---- 3. the storyboard: sequences 2, 3, 4, 5 and the new 11, replayed on a live window ----
  function story() {
    const SEQ = [
      ['2. Collapsed, a new error arrives', ['test', 'bridge'], [['You collapse the shell', (l) => { l.collapsed = true; l.render2() }], ['The too-many-editors error arrives: it joins the errors, newest first, and pulses', (l) => l.arrive('editors')]]],
      ['3. Collapsed, a new notice arrives', ['bridge', 'editors'], [['You collapse the shell', (l) => { l.collapsed = true; l.render2() }], ['An agent starts a light test: notices sit above the errors, so it takes the top row and pulses', (l) => l.arrive('test')]]],
      ['4. Collapsed, a message changes', ['bridge', 'editors'], [['You collapse the shell', (l) => { l.collapsed = true; l.render2() }], ['The bridge address changes: the row is new by key, it pulses, the shell re-opens', (l) => { l.rows = l.rows.filter((r) => r.source !== 'bridge'); l.addRow('bridge2'); l.render() }]]],
      ['5. Collapsed through a countdown', ['test', 'bridge'], [['You collapse the shell', (l) => { l.collapsed = true; l.render2() }], ['5 s pass: the countdown text changes, no pulse, stays collapsed', (l) => l.tick(5)], ['5 more s pass: same', (l) => l.tick(5)], ['The test ends: the notice clears, nothing pulses', (l) => l.drop('test')]]],
      ['11. Scrolled region, then arrivals', ['test', 'bridge', 'editors', 'display', 'pair'], [['You scroll the region to the bottom', (l) => { const r = l.region; r.scrollTop = r.scrollHeight }], ['A new error arrives: errors sit last, below the notices and conditions, so the region scrolls down to it, and the pulse starts when it is in view', (l) => l.arrive('reload')], ['You scroll to the bottom again; a new notice arrives at the bottom: the region is already there, so it pulses at once', (l) => { l.region.scrollTop = l.region.scrollHeight; l.arrive('tab') }]]],
    ]
    const host = s6('div', 'ss-sp-story'), lg = logBox(); const st = { seq: 0, step: -1, variant: 'tinted' }
    let live
    const reset = () => { const [, keys] = SEQ[st.seq]; live = new LiveShell({ page: 'editor', w: 400, h: SEQ[st.seq][0].startsWith('11') ? 420 : 650, variant: st.variant, log: lg.push }); live.load(keys); st.step = -1; draw() }
    const draw = () => { const steps = SEQ[st.seq][2]; const top = live.region ? live.region.scrollTop : 0; host.replaceChildren(
      s6('div', 'ss-ctl', sel('Sequence', SEQ.map(([n], i) => [i, n]), st.seq, (v) => { st.seq = +v; reset() }), sel('Ring colour', [['tinted', 'Tinted by the mark'], ['neutral', 'Neutral, the border']], st.variant, (v) => { st.variant = v; reset() }),
        s6('div', 'ss-nav', evBtn('Back to start', reset), el('button', { type: 'button', class: 'ui-button', 'data-variant': 'primary', 'data-size': 'sm', disabled: st.step >= steps.length - 1, onclick: () => { st.step++; steps[st.step][1](live); draw() } }, st.step < 0 ? 'Start: first step' : 'Next step'))),
      s6('p', 'ss-did', st.step < 0 ? 'Page loaded with the rows shown: first render, no pulse.' : `Step ${st.step + 1} of ${steps.length}: ${steps[st.step][0]}`), live.root, lg.ul); if (live.region) live.region.scrollTop = top
    }
    reset(); return host
  }

  // ---- the sections ----
  const sec = s6section('s7-spot', 'Aurora-u8jx.14', 'The shell without a scroll view: order, counts and a one-pulse spotlight',
    'Owner direction 2026-11-13: no 220 px scroll view as the normal look; arrivals show through layout plus one pulse, not a timed solo row or per-row unread badges. Rows are state (true until fixed), so nothing auto-dismisses. Every window below is live except the frozen frames, which stop the same pulse at a chosen point so ring colour and row spacing can be compared. Windows are drawn at true size.',

    s6('h3', 'ss-h3', 'Try it. Everything below follows the rules in the bead'),
    s6('p', 's6-lead', 'Press the events. Order is notices (pairings, light test), then conditions, then errors newest first, as the shell orders rows today, and the collapsed bar lists "N notices" then "N errors" to match. The collapsed bar is one button with both counts, and one click opens every row (a filter by kind was tried and dropped: with no scroll view it saved about one row and added a state and a "Show all"). Any arrival or changed message re-opens the shell, and the new row pulses once. A page load never pulses. The countdown never pulses. Use "Window height 420" or "Load 6 rows" to meet the safety cap; "60vh safety cap: Off" shows what uncapped does to the canvas.'),
    playground(),

    s6('h3', 'ss-h3', 'Widths and pages: the uncapped shell, a new error mid-pulse (frozen at 20%)'),
    s6('p', 's6-lead', 'Three rows in the order the shell uses (notice, then errors), the bridge error just arrived. The cap does not bite here: 60% of 650 is 390 px, and three rows at 400 wide take about 218 px. Editor and Dashboard styled, 1470, 650 and 400 wide.'),
    strip(
      ...[['editor', 1470], ['dashboard', 1470], ['editor', 650], ['dashboard', 650], ['editor', 400], ['dashboard', 400]].map(([page, w]) =>
        fig(`${page === 'editor' ? 'Editor' : 'Dashboard styled'}, ${w} x 650`, frozen([N(), E2(), E({ pulse: true })], { page, w, h: 650 })))),

    s6('h3', 'ss-h3', 'Ring colour: matches the border (neutral) or the mark (tinted). You pick'),
    s6('p', 's6-lead', 'Today every row border is the same neutral 2 px --aurora-border (shell.css:158), so "matching the border" means a neutral ring on every row. The tinted variant takes error red on error rows and stays neutral on notices. Frozen at 0%, 20% and 50% of the 1375 ms pulse; the live window above plays it for real in either colour.'),
    strip(...[['neutral', 'Neutral (the border), error row'], ['tinted', 'Tinted by the mark, error row']].flatMap(([v, l]) => [0, 0.2, 0.5].map((t) => fig(`${l}, at ${Math.round(t * 100)}%`, frozen([E({ pulse: true })], { variant: v, t, h: 190, w: 520 })))),
      ...['neutral', 'tinted'].map((v) => fig(`${v === 'neutral' ? 'Neutral' : 'Tinted'}, notice row, at 20%`, frozen([N({ pulse: true })], { variant: v, t: 0.2, h: 190, w: 520 })))),

    s6('h3', 'ss-h3', 'Spacing: two rows pulsing together'),
    s6('p', 's6-lead', 'The ring spreads 8 px; rows are 12 px apart, so two adjacent rings overlap mid-gap (8 + 8 > 12). Frozen at 0, 20% and 50%, and with the gap widened to 20 px for comparison. The ring is near transparent where it is widest.'),
    strip(...[[12, 0], [12, 0.2], [12, 0.5], [20, 0.2]].map(([g, t]) => fig(`gap ${g} px, at ${Math.round(t * 100)}%`, frozen([E({ pulse: true }), E2({ pulse: true })], { gap: g, t, w: 520, h: 330 })))),

    s6('h3', 'ss-h3', 'Over the safety cap: scroll into view, pulse starts when visible'),
    s6('p', 's6-lead', 'A 400 x 420 window with 6 rows, so 60vh = 252 px and the region scrolls (inner padding 8 px so the ring is not clipped). "Error arrives" puts the new row at the bottom of the errors and scrolls down to it; "Notice arrives" puts it at the top: with the region scrolled down it scrolls up to it. The pulse is paused until the IntersectionObserver sees the row, so scrolling by hand to an off-screen arrival starts it then. The log under the window says which fired.'),
    (() => { const lg = logBox(), l = new LiveShell({ page: 'editor', w: 400, h: 420, variant: 'tinted', log: lg.push }); l.load(['test', 'bridge', 'editors', 'display', 'pair']); let i = 0
      return s6('div', 'ss-sp-play', s6('div', 'ss-sp-evs', evBtn('Error arrives (below the notices)', () => { l.region && (l.region.scrollTop = 0); l.arrive(l.freshKey('error')) }), evBtn('Notice arrives (top)', () => { l.region && (l.region.scrollTop = 9999); l.arrive(l.freshKey('notice')) }), evBtn('Reset', () => { l.load(['test', 'bridge', 'editors', 'display', 'pair']); l.cache.clear() })), l.root, lg.ul) })(),

    s6('h3', 'ss-h3', 'Reduced motion: a static ring that holds for the pulse length'),
    s6('p', 's6-lead', 'Same as the chip (editor.css:968): no spread, the ring just stays for 1375 ms and goes. Forced here with the toggle so it can be seen without changing the OS setting; the CSS also answers prefers-reduced-motion. Press "Error arrives" and watch the ring hold.'),
    (() => { const lg = logBox(), l = new LiveShell({ page: 'editor', w: 520, h: 420, variant: 'tinted', rm: true, log: lg.push }); l.load(['bridge', 'editors']); let i = 0
      return s6('div', 'ss-sp-play', s6('div', 'ss-sp-evs', evBtn('Error arrives', () => l.arrive(l.freshKey('error'))), evBtn('Notice arrives', () => l.arrive(l.freshKey('notice')))), l.root, lg.ul) })(),

    s6('h3', 'ss-h3', 'Order, as today and as proposed'),
    el('table', { class: 'ss-story' }, el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', {}, 'Today (shell.js _renderBanner, ErrorShell.tsx ShellBanner)'), el('th', {}, 'Proposed'))),
      el('tbody', {},
        el('tr', {}, el('td', {}, 'Top'), el('td', {}, 'Pairings (Dashboard), light-test row, conditions, host errors in daemon order, editor notes'), el('td', {}, 'Notices (pairings, light test) first, as today; then conditions; then host errors, newest first (by host-wide id). Only the errors are re-ordered, and the notices fold into the collapse and count (Aurora-u8jx.5 scope)')),
        el('tr', {}, el('td', {}, 'Why'), el('td', {}, 'Notices sit outside the collapse and the count'), el('td', {}, 'Notices win the top because they are live states or wait on a click (a pairing, a running test), and the collapsed bar reads in the same order. Today a lone error and notices share the list; the change is errors newest first, and pairings and the light test joining the collapse and its count. Editor notes (refused save and the like) are errors in this mock; the code lists them last.')))),

    s6('h3', 'ss-h3', 'Storyboard sequences 2, 3, 4, 5 and the new 11, replayed with the spotlight'),
    s6('p', 's6-lead', 'Pick a sequence and press Next step. Sequences 2 to 5 keep their numbers from the A/B storyboard (#s7-sim); 11 is the one marked unbuilt there. This is the real keyed render, so the pulse, the re-open and the "no pulse on a countdown" rule are what you would get.'),
    story(),

    s6note('Cost in the code. shell.js: _renderBanner rewrites innerHTML every 3 s poll, which would restart the animation each beat, so the .5 "skip the write when the markup is unchanged" fix becomes a prerequisite, and a keyed patch (reuse a row element by source + message) is cleaner than that. It also needs a previous-key set (first render sets it silently), a data-new attribute cleared on animationend, a polite live region, and above the cap an IntersectionObserver plus a scrollTop adjustment (about 25 lines; the mock\'s after() is that code). ErrorShell.tsx: rows are already keyed, so React keeps elements and the pulse survives re-render; it needs a usePrevious key set, a data-new prop removed on animationend, the same live region, and a small effect for the over-cap case. Keyframes must live in ui/styles/shell.css (the Dashboard has no editor.css); the Problems chip can then share them. The mock is not wired to the editor.'))
  return sec
}
