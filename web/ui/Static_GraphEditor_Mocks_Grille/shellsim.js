// Aurora-u8jx.12: the shell start rules as a storyboard. Pick a sequence; each step is ONE frame showing A (every row set opens at
// load) and B (2+ rows start collapsed at load) after that step, with what each did and whether they differ. The table under the
// frame is the whole sequence at a glance and doubles as a jump list. Frames are computed by replaying the sequence from a clean
// page through the Aurora-u8jx.5 rules: stored snapshot when collapsed, re-open on a new row or a changed message, countdown text
// ignored, reset when the rows clear. Loaded before mock.js, drawn by drawBoard('sim'). Nothing here touches the editor.

function simBoard(s6section, s6note) {
  const BRIDGE = (ip) => `Can't reach the Hue bridge at ${ip}. The lights won't update until it's back.`
  const ROW = {
    bridge: { key: 'bridge', err: true, base: BRIDGE('192.168.1.20'), action: 'Retry' },
    editors: { key: 'editors', err: true, base: "Couldn't check your last edit: too many editors are open. Close one to continue." },
    test: { key: 'test', notice: true, base: 'An agent is testing an effect on the lights.', action: 'Stop test', timed: true },
  }
  const ORDER = ['test', 'bridge', 'editors'] // notices above errors, as the rows stack today
  const NAME = { bridge: 'the bridge error', editors: 'the too-many-editors error', test: 'the light-test notice' }
  const cfg = { persist: false }
  let world, A, B, store

  class Shell {
    constructor(v, why) { this.v = v; this.msgs = []; this.load(why) }
    say(m) { this.msgs.push(m) }
    save() { if (cfg.persist) store[this.v] = { collapsed: this.collapsed, snap: this.snap } }
    load(why) {
      const rows = rowsNow(); this.rows = rows
      const saved = cfg.persist ? store[this.v] : null
      if (saved && rows.length) { this.collapsed = saved.collapsed; this.snap = saved.snap; this.say(`${why}: kept ${saved.collapsed ? 'collapsed' : 'open'} from before`); this.reconcile(rows) }
      else {
        this.collapsed = this.v === 'B' && rows.length >= 2
        this.snap = this.collapsed ? snapOf(rows) : null
        this.say(rows.length === 0 ? `${why}: nothing to show` : this.collapsed ? `${why}: ${rows.length} rows, starts collapsed` : `${why}: ${rows.length === 1 ? '1 row' : rows.length + ' rows'}, starts open`)
      }
      this.save()
    }
    reconcile(rows) {
      if (!rows.length) { if (this.collapsed || this.snap) this.say('rows cleared: state reset'); this.collapsed = false; this.snap = null; return }
      if (!this.collapsed) return
      const fresh = rows.find((r) => !(r.key in this.snap)), changed = rows.find((r) => r.key in this.snap && this.snap[r.key] !== r.base)
      if (fresh) { this.collapsed = false; this.say(`re-opened: ${NAME[fresh.key]} is new`) }
      else if (changed) { this.collapsed = false; this.say(`re-opened: the message of ${NAME[changed.key]} changed`) }
      else this.snap = snapOf(rows)
    }
    update() {
      const before = JSON.stringify(snapOf(this.rows)), rows = rowsNow(); this.rows = rows
      const was = this.collapsed, hadRows = Object.keys(JSON.parse(before)).length > 0; this.reconcile(rows)
      if (!hadRows && rows.length) this.say('a row appears: starts open')
      else if (!was && !this.collapsed && JSON.stringify(snapOf(rows)) !== before) this.say('already open, the rows update')
      if (this.collapsed && was && before !== JSON.stringify(snapOf(rows))) this.say('stays collapsed, the count updates')
      this.save()
    }
    collapse() { if (!this.rows.length) return; if (this.collapsed) { this.say('already collapsed'); return } this.collapsed = true; this.snap = snapOf(this.rows); this.say('collapsed by you'); this.save() }
  }
  const rowsNow = () => ORDER.filter((k) => world.rows[k]).map((k) => world.rows[k])
  const snapOf = (rows) => Object.fromEntries(rows.map((r) => [r.key, r.base]))
  const both = (f) => { f(A); f(B) }
  const act = {
    load: (keys, page, why) => { world.rows = {}; keys.forEach((k) => (world.rows[k] = { ...ROW[k] })); world.secs = 15; world.page = page; A = new Shell('A', why); B = new Shell('B', why) },
    reload: () => { A = new Shell('A', 'reloaded'); B = new Shell('B', 'reloaded') },
    go: (page) => { world.page = page; A = new Shell('A', `opened the ${page}`); B = new Shell('B', `opened the ${page}`) },
    add: (k) => { world.rows[k] = { ...ROW[k] }; both((s) => s.update()) },
    clear: (k) => { delete world.rows[k]; both((s) => s.update()) },
    clearAll: () => { world.rows = {}; both((s) => s.update()) },
    change: () => { world.rows.bridge = { ...ROW.bridge, base: BRIDGE('192.168.1.31') }; both((s) => s.update()) },
    wait: (n) => { world.secs = Math.max(0, world.secs - n); both((s) => s.update()) },
    collapse: () => both((s) => s.collapse()),
  }
  const L = (keys, page = 'editor', label) => [label ?? `Page loads (${page}) with ${keys.map((k) => NAME[k]).join(', ')}`, () => act.load(keys, page, 'page load')]
  const COLLAPSE = ['You collapse the shell', () => act.collapse()]
  const SEQ = [
    ['1. Cold load, 1, 2, then 3 rows', [L(['bridge']), L(['test', 'bridge']), L(['test', 'bridge', 'editors'])]],
    ['2. Collapsed, a new error arrives', [L(['test', 'bridge']), COLLAPSE, ['The too-many-editors error arrives', () => act.add('editors')]]],
    ['3. Collapsed, a new notice arrives', [L(['bridge', 'editors']), COLLAPSE, ['An agent starts a light test (a notice)', () => act.add('test')]]],
    ['4. Collapsed, a message changes', [L(['bridge', 'editors']), COLLAPSE, ['The bridge address in its message changes', () => act.change()]]],
    ['5. Collapsed through a countdown', [L(['test', 'bridge']), COLLAPSE, ['5 s pass (the countdown text changes)', () => act.wait(5)], ['5 more s pass', () => act.wait(5)], ['The test ends, its notice clears', () => act.clear('test')]]],
    ['6. Collapsed, rows clear one by one', [L(['test', 'bridge', 'editors']), COLLAPSE, ['The notice clears', () => act.clear('test')], ['The too-many-editors error clears', () => act.clear('editors')], ['The last error clears', () => act.clear('bridge')], ['The bridge error comes back', () => act.add('bridge')]]],
    ['7. Flapping error', [L(['bridge', 'editors']), COLLAPSE, ['Everything clears', () => act.clearAll()], ['The bridge error returns', () => act.add('bridge')], ['The editors error returns', () => act.add('editors')]]],
    ['8. Collapsed, Dashboard then editor', [L(['test', 'bridge', 'editors'], 'dashboard'), COLLAPSE, ['You open the editor', () => act.go('editor')], ['You go back to the Dashboard', () => act.go('dashboard')]]],
    ['9. Collapsed, reload', [L(['test', 'bridge', 'editors']), COLLAPSE, ['You reload the page', () => act.reload()]]],
  ]

  // Replay a sequence from a clean page, recording what each shell looks like after each step and what it did during the step.
  const snap = (s) => ({ rows: s.rows.map((r) => ({ ...r, text: r.timed ? `${r.base} ${world.secs} s left.` : r.base })), collapsed: s.collapsed, v: s.v })
  function replay(i) {
    world = { rows: {}, secs: 15, page: 'editor' }; store = {}; A = B = null
    return SEQ[i][1].map(([label, run]) => {
      const a0 = A ? A.msgs.length : 0, b0 = B ? B.msgs.length : 0, keep = [A, B]
      run()
      // a new page makes new shells, whose messages start at zero
      const a = A === keep[0] ? A.msgs.slice(a0) : A.msgs.slice(), b = B === keep[1] ? B.msgs.slice(b0) : B.msgs.slice()
      return { label, page: world.page, a: { ...snap(A), msgs: a }, b: { ...snap(B), msgs: b } }
    })
  }

  const counts = (rows) => ({ e: rows.filter((r) => r.err).length, n: rows.filter((r) => r.notice).length })
  const stateText = (x) => (x.rows.length ? `${x.collapsed ? 'collapsed' : 'open'}, ${x.rows.length} row${x.rows.length === 1 ? '' : 's'}` : 'no rows')
  const bandFor = (x) => {
    if (!x.rows.length) return null
    if (x.collapsed) { const c = counts(x.rows); return shellBand(collapsedBar(c.e, c.n)) }
    return shellBand(s6('div', 'ss-region', { role: 'region', 'aria-label': 'Errors and notices' }, ...x.rows.map(shellRow)), showLess())
  }
  const column = (title, x, page) => {
    const bar = page === 'dashboard' ? s6('div', 'ss-dashbar', el('b', {}, 'Aurora'), s6('span', 'ge-spacer'), btn('Pause'), btn('Quit')) : s6bar({ right: chip(2, true, { compact: true }) })
    return s6('figure', 's6-panel ss-fig', s6('figcaption', '', title, s6('small', 'ss-state', ` · ${stateText(x)}`)),
      s6('div', `ss-win ss-sim-win s7-w s7-compact${page === 'dashboard' ? ' ss-dash' : ''}`, { style: '--ss-vh:650px' }, bandFor(x), bar, s6('div', 's6-canvas ss-canvas', 'The graph canvas')),
      s6('p', 'ss-did', x.msgs.length ? x.msgs.join('; ') : 'no change'))
  }

  const state = { seq: 0, step: 0 }
  let frames = replay(0)
  const root = s6('div', 'ss-sim')
  const same = (f) => stateText(f.a) === stateText(f.b)
  const go = (n) => { state.step = Math.max(0, Math.min(frames.length - 1, n)); draw() }
  function draw() {
    const f = frames[state.step]
    const cell = (x) => `${stateText(x)}${' · ' + (x.msgs.length ? x.msgs[x.msgs.length - 1] : 'no change')}`
    root.replaceChildren(
      s6('div', 'ss-ctl',
        s6('label', 'ss-sel', s6('b', '', 'Sequence'), el('select', { onchange: (e) => { state.seq = +e.target.value; state.step = 0; frames = replay(state.seq); draw() } }, ...SEQ.map(([n], i) => el('option', { value: i, selected: i === state.seq }, n)))),
        s6('span', 'ss-pick', s6('b', '', 'Collapse survives navigation'), el('button', { type: 'button', class: `ui-button${cfg.persist ? ' ss-on' : ''}`, 'data-size': 'sm', 'aria-pressed': String(cfg.persist), onclick: () => { cfg.persist = !cfg.persist; frames = replay(state.seq); draw() } }, cfg.persist ? 'Yes, per tab' : 'No'))),
      s6('div', 'ss-stage-head',
        s6('div', '', s6('small', 'ss-stepno', `Step ${state.step + 1} of ${frames.length}`), s6('h3', 'ss-event', f.label)),
        s6('div', 'ss-nav', el('button', { type: 'button', class: 'ui-button', 'data-size': 'sm', disabled: state.step === 0, onclick: () => go(state.step - 1) }, 'Back'),
          el('button', { type: 'button', class: 'ui-button', 'data-variant': 'primary', 'data-size': 'sm', disabled: state.step === frames.length - 1, onclick: () => go(state.step + 1) }, 'Next')),
        s6('span', `ss-verdict ${same(f) ? 'ss-same' : 'ss-differ'}`, same(f) ? 'A and B look the same' : 'A and B differ here')),
      s6('div', 'ss-strip ss-sim-strip', column('A: every row set opens at load', f.a, f.page), column('B: 2+ rows start collapsed at load', f.b, f.page)),
      s6('table', 'ss-story', el('thead', {}, el('tr', {}, el('th', {}, 'Step'), el('th', {}, 'A'), el('th', {}, 'B'))),
        el('tbody', {}, ...frames.map((x, i) => el('tr', { class: `${i === state.step ? 'ss-cur' : ''}${same(x) ? '' : ' ss-diff'}`, onclick: () => go(i) }, el('td', {}, `${i + 1}. ${x.label}`), el('td', {}, cell(x.a)), el('td', {}, cell(x.b)))))))
    root.querySelectorAll('.ss-region').forEach((r) => { const over = r.scrollHeight > r.clientHeight + 1; r.classList.toggle('ss-over', over); r.classList.toggle('ss-more', over) })
  }
  root.tabIndex = 0
  root.addEventListener('keydown', (e) => { if (e.target.tagName === 'SELECT') return; if (e.key === 'ArrowRight') go(state.step + 1); if (e.key === 'ArrowLeft') go(state.step - 1) })
  const sec = s6section('s7-sim', 'Aurora-u8jx.12', 'Shell sequences, A against B',
    'Pick a sequence, then step with Next and Back (or the arrow keys). Each frame is the page after that step: A on the left, B on the right, with what each shell did under it. The badge says whether they look the same, and the table lists every step so you can see where they split and jump to any row. Both follow the Aurora-u8jx.5 rules after load: collapsed stays collapsed until a row is new or a message changes, the countdown text is ignored, clearing all rows resets.',
    root, s6note('A page load decides the start state: A opens every row set, B collapses 2+. "Collapse survives navigation" keeps each shell\'s collapse state across Reload and Dashboard / editor, so only a changed row set re-opens it. The 15 s countdown moves only in the "5 s pass" steps. Not simulated: the real heartbeat and the 5-minute pairing timing.'))
  draw()
  return sec
}
