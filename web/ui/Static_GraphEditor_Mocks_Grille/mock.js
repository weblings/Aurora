// Graph editor mock (Aurora-bova): plain JS over the real catalog, so a pick is easy to try.
const { nodes: CATALOG, graph: GRAPH } = window.AURORA_MOCK
const byType = new Map(CATALOG.map((n) => [n.type, n]))

const VIDEO = '#38c9a8', AUDIO = '#c58cf0', LIGHT = '#e5ad3c', NUMBER = '#9a9a9a'
const PORTS = {
  Image: [VIDEO, 'square'], AudioBuffer: [AUDIO, 'square'], AudioFeatures: [AUDIO, 'circle'], Frame: [LIGHT, 'square'],
  Color: [LIGHT, 'circle'], Float: [NUMBER, 'circle'], Angle: [NUMBER, 'diamond'], Trigger: [NUMBER, 'triangle'],
}

// Ordered like a signal: where it starts, what shapes it, where it lands.
const CATEGORIES = [
  ['Sources', ['video.capture', 'audio.capture', 'lfo', 'noise', 'color.constant', 'angle.constant', 'palette.randomAnchor']],
  ['Audio', ['audio.features', 'audio.bands', 'audio.drift', 'audio.bounce']],
  ['Image', ['image.rescale', 'image.dropAlpha', 'image.mix', 'image.gradient', 'image.bar', 'image.noise', 'image.hueRamp']],
  ['Color', ['color.fromHSV', 'color.toHSV', 'color.brightness', 'color.mix', 'color.hueShift', 'color.complement', 'color.fromGradient', 'palette.pick']],
  ['Numbers', ['math.scale', 'math.divide', 'math.clamp', 'math.mapRange', 'math.lerp', 'math.add', 'math.multiply', 'math.max', 'math.invert', 'angle.add']],
  ['Motion', ['smooth.exp', 'smooth.angle', 'rollingAverage', 'integrate', 'stepOnTrigger']],
  ['Lights', ['zones.sample', 'frame.smooth', 'frame.smoothTime', 'frame.gain', 'frame.floor', 'frame.mix', 'frame.brightnessScale', 'frame.saturation', 'frame.hueShift', 'frame.tint', 'frame.broadcast', 'output.send']],
]
const categoryOf = new Map(CATEGORIES.flatMap(([name, types]) => types.map((t) => [t, name])))
for (const n of CATALOG) if (!categoryOf.has(n.type)) console.error(`no category for ${n.type}`)

const state = {
  nodes: [], edges: GRAPH.edges.map(([from, to]) => ({ from, to })), controls: GRAPH.controls.map((c) => ({ ...c })),
  view: { x: 0, y: 0, k: 1 }, selected: null, wire: null, testing: false, problems: false, unsaved: false, zonesOpen: true, zonesLarge: false, popup: null,
  // States the first mock skipped (Aurora-daaa.6).
  banner: null, status: null, other: false, changed: false, nameError: false, wholeGraph: false,
}

const $ = (id) => document.getElementById(id)
const layer = $('layer')

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class') node.className = v
    else if (k === 'html') node.innerHTML = v
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
    else node.setAttribute(k, v === true ? '' : v)
  }
  fill(node, kids, true)
  return node
}

function fill(node, kids, keep = false) {
  const flat = kids.flat(Infinity).filter((kid) => kid !== null && kid !== undefined && kid !== false)
  if (keep) node.append(...flat)
  else node.replaceChildren(...flat)
}

const icon = (path) => el('span', { html: `<svg class="ge-icon" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`, style: 'display:contents' })
const ICON = {
  play: '<path d="M7 5v14l11-7z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  expand: '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
  collapse: '<path d="M9 4v5H4"/><path d="M15 4v5h5"/><path d="M9 20v-5H4"/><path d="M15 20v-5h5"/>',
  undo: '<path d="M9 7 4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 5 5v1"/>',
  redo: '<path d="m15 7 5 5-5 5"/><path d="M20 12H9a5 5 0 0 0-5 5v1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
}
const chevron = (cls = '', up = false) => el('span', { class: `ge-chev ${cls}`, 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" class="ge-icon"><path d="${up ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}"/></svg>` })
const warnIcon = () => el('span', { class: 'ge-warn', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" class="ge-icon"><path d="M12 3 2.5 20h19z"/><path d="M12 10v4"/><path d="M12 17.2v.1"/></svg>' })
// Grille button as plain markup: its hover styles key off react-aria data attributes, so mock.css adds :hover fallbacks.
function btn(label, { variant, size = 'sm', icon: isIcon, ...attrs } = {}) {
  return el('button', { type: 'button', class: 'ui-button', 'data-variant': variant, 'data-size': size === 'md' ? undefined : size, 'data-icon': isIcon, ...attrs }, label)
}
const opts = { backBoxed: true, testPrimary: false, split: false }
// Variant (Aurora-daaa.32): testMode is what the Test button runs next; testLeft counts a Once test down.
const test = { mode: 'once', left: 12, timer: null }
const stopTimer = () => { clearInterval(test.timer); test.timer = null }
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const socket = (type) => {
  const [color, shape] = PORTS[type] ?? PORTS.Float
  return el('span', { class: `sk ${shape}`, style: `--c:${color}`, title: type })
}
const titleOf = (info) => info.title || info.type
// The catalog leaves some labels blank, so the raw param name gets a readable form.
const paramLabel = (p) => p.label || (p.name[0].toUpperCase() + p.name.slice(1)).replace(/([a-z])([A-Z])/g, '$1 $2')

// --- Nodes -------------------------------------------------------------------

function paramView(p, value) {
  const current = value ?? p.default
  if (p.kind === 'enum') return el('div', { class: 'gn-param' }, el('div', { class: 'gn-param-row' }, paramLabel(p)), el('div', { class: 'gn-enum' }, String(current || 'Choose'), chevron('cc-chev')))
  if (p.kind === 'bool') return el('div', { class: 'gn-param' }, el('div', { class: 'gn-param-row' }, paramLabel(p), el('b', {}, current ? 'On' : 'Off')))
  if (p.kind === 'gradient') {
    const stops = (current ?? []).map((s) => `${s.color} ${s.pos * 100}%`).join(',')
    return el('div', { class: 'gn-param' }, el('div', { class: 'gn-param-row' }, paramLabel(p)), el('div', { class: 'gn-gradient', style: `background:linear-gradient(to right,${stops})` }))
  }
  const min = p.min ?? 0, max = p.max ?? 1, number = current === null || current === undefined || current < min ? min : current
  const percent = max > min ? ((number - min) / (max - min)) * 100 : 0
  return el('div', { class: 'gn-param' },
    el('div', { class: 'gn-param-row' }, paramLabel(p), el('b', {}, `${+Number(number).toFixed(2)}${p.unit ? ` ${p.unit}` : ''}`)),
    el('input', { class: 'ge-slider', type: 'range', min, max, step: p.step || 'any', value: number, tabindex: -1, 'aria-label': paramLabel(p), style: `--slider-percent:${percent}%` }))
}

function nodeBody(info, params = {}, limit = Infinity) {
  const ports = el('div', { class: 'gn-ports' },
    el('div', {}, info.inputs.map((p) => el('div', { class: 'gn-port in', 'data-port': p.name, title: p.description }, socket(p.type), p.name))),
    el('div', {}, info.outputs.map((p) => el('div', { class: 'gn-port out', 'data-port': p.name, title: p.description }, p.name, socket(p.type)))))
  const hidden = info.params.length - limit
  return [ports, info.params.slice(0, limit).map((p) => paramView(p, params[p.name])), hidden > 0 ? el('p', { class: 'gn-more-params' }, `${hidden} more params`) : null]
}

function drawNodes() {
  const host = $('nodes')
  host.replaceChildren(...state.nodes.map((n) => {
    const info = byType.get(n.type)
    const bad = state.problems && n.id === 'zones_hue'
    return el('div', {
      class: `gn${n.id === state.selected ? ' sel' : ''}${bad ? ' bad' : ''}`, 'data-node': n.id, style: `left:${n.x}px;top:${n.y}px`,
      title: info.purpose,
    },
      el('div', { class: 'gn-head' }, titleOf(info),
        n.id === state.selected ? el('button', { type: 'button', class: 'gn-more', 'aria-label': `${titleOf(info)} actions`, onclick: (e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); nodeMenu(n, r.left, r.bottom + 4) } }, '⋯') : null),
      nodeBody(info, n.params))
  }))
  drawWires()
}

function portPoint(ref) {
  const dot = ref.lastIndexOf('.'), id = ref.slice(0, dot), name = ref.slice(dot + 1)
  const node = state.nodes.find((n) => n.id === id)
  const box = document.querySelector(`[data-node="${CSS.escape(id)}"]`)
  const port = box?.querySelector(`[data-port="${CSS.escape(name)}"]`)
  if (!node || !port) return null
  return { x: node.x + (port.classList.contains('out') ? box.offsetWidth : 0), y: node.y + port.offsetTop + port.offsetHeight / 2, type: portType(node, name) }
}
function portType(node, name) {
  const info = byType.get(node.type)
  return [...info.outputs, ...info.inputs].find((p) => p.name === name)?.type
}

function drawWires() {
  const paths = state.edges.flatMap((edge, i) => {
    const a = portPoint(edge.from), b = portPoint(edge.to)
    if (!a || !b) return []
    const bend = Math.max(40, Math.abs(b.x - a.x) / 2)
    const d = `M${a.x} ${a.y}C${a.x + bend} ${a.y} ${b.x - bend} ${b.y} ${b.x} ${b.y}`
    const color = (PORTS[a.type] ?? PORTS.Float)[0]
    return `<path d="${d}" stroke="${color}"${state.wire === i ? ' class="sel"' : ''}/><path d="${d}" class="hit" data-wire="${i}"/>`
  })
  $('wires').innerHTML = paths.join('')
}

function layoutGraph() {
  const depth = new Map(GRAPH.nodes.map((n) => [n.id, 0]))
  for (let pass = 0; pass < GRAPH.nodes.length; pass++) {
    for (const [from, to] of GRAPH.edges) {
      const a = from.split('.')[0], b = to.split('.')[0]
      depth.set(b, Math.max(depth.get(b), depth.get(a) + 1))
    }
  }
  const used = new Map()
  state.nodes = GRAPH.nodes.map((n) => {
    const d = depth.get(n.id), row = used.get(d) ?? 0
    used.set(d, row + 1)
    return { ...n, params: n.params ?? {}, x: d * 256, y: row * 240 }
  })
}

function applyView() {
  const { x, y, k } = state.view
  $('world').style.transform = `translate(${x}px,${y}px) scale(${k})`
  $('canvas').style.backgroundPosition = `${x}px ${y}px`
  $('canvas').style.backgroundSize = `${24 * k}px ${24 * k}px`
  $('view-btn').replaceChildren(`${Math.round(k * 100)}%`, chevron('cc-chev'))
}

function fit() {
  const boxes = [...document.querySelectorAll('#nodes .gn')]
  if (!boxes.length) return
  const left = Math.min(...state.nodes.map((n) => n.x)), top = Math.min(...state.nodes.map((n) => n.y))
  const right = Math.max(...boxes.map((b) => b.offsetLeft + b.offsetWidth)), bottom = Math.max(...boxes.map((b) => b.offsetTop + b.offsetHeight))
  const r = $('canvas').getBoundingClientRect(), margin = 40
  const k = Math.min(1, (r.width - margin * 2) / (right - left), (r.height - margin * 2) / (bottom - top))
  state.view = { k, x: (r.width - (right - left) * k) / 2 - left * k, y: (r.height - (bottom - top) * k) / 2 - top * k }
  applyView()
}

const toFlow = (sx, sy) => {
  const r = $('canvas').getBoundingClientRect(), { x, y, k } = state.view
  return { x: (sx - r.left - x) / k, y: (sy - r.top - y) / k }
}

// --- Chrome ------------------------------------------------------------------

function drawBar() {
  const bar = $('bar')
  const count = state.wholeGraph ? 3 : 2
  const problems = state.problems ? btn([warnIcon(), `${count} problems`], { class: 'ui-button ge-problems', 'data-act': 'problems', 'aria-haspopup': 'dialog' }) : null
  const blocked = state.problems || Boolean(state.banner?.blocking)
  const testPart = opts.split ? splitTest(blocked) : state.testing
    ? [el('span', { class: 'ge-countdown' }, 'On the lights, reverts in 0:24'), btn('Revert', { 'data-act': 'revert' })]
    : [btn(state.other ? 'Take over the lights' : 'Test on lights', { variant: opts.testPrimary ? 'primary' : undefined, class: `ui-button${opts.testPrimary ? ' ge-primary' : ''}`, 'data-act': 'test', disabled: blocked, title: 'Show this graph on the real lights for a while, then put them back' })]
  const ghost = opts.backBoxed ? '' : ' ge-ghost'
  fill(bar, [
    btn('← Dashboard', { class: `ui-button${ghost}`, 'data-act': 'back' }),
    el('span', { class: 'ge-sep' }),
    btn(['Screen colors', chevron('cc-chev')], { class: `ui-button ge-title${ghost}`, 'data-act': 'title', 'aria-haspopup': 'dialog' }),
    state.unsaved ? el('span', { class: 'ge-unsaved' }, 'Unsaved') : null,
    el('span', { class: 'ge-spacer' }),
    state.changed ? el('span', { class: 'ge-unsaved' }, 'Edited since the test') : null,
    problems,
    opts.split ? null : el('span', { class: `ge-status${state.status?.strong ? ' strong' : ''}`, role: 'status' },
      el('span', { class: 'ge-dot' }), state.status?.text ?? (state.problems ? 'Preview paused' : 'Live preview'),
      state.status?.action ? btn(state.status.action.label, { 'data-act': state.status.action.act }) : null),
    btn(icon(ICON.undo), { icon: true, 'aria-label': 'Undo', title: 'Undo (Ctrl+Z)', 'data-act': 'toast-undo' }),
    btn(icon(ICON.redo), { icon: true, 'aria-label': 'Redo', title: 'Redo (Ctrl+Shift+Z)', disabled: true }),
    el('span', { class: 'ge-sep' }),
    testPart])
}

// Split button [▷ Test ⌄]: the label is the state, Stop is the revert, no status text.
function splitTest(blocked) {
  const primary = opts.testPrimary
  const cls = `ui-button ge-split-part${primary ? ' ge-primary' : ''}`
  const v = primary ? 'primary' : undefined
  const reason = state.problems ? 'Fix the problems first' : state.banner?.blocking ? 'Cannot reach Aurora' : undefined
  if (state.status?.action) return btn(state.status.action.label, { variant: v, class: `ui-button${primary ? ' ge-primary' : ''}`, 'data-act': state.status.action.act, title: 'Another session took over the preview' })
  if (state.testing) {
    const label = test.mode === 'once' ? `Stop ${clock(test.left)}` : 'Stop'
    return el('span', { class: 'ge-split' }, btn([icon(ICON.stop), el('span', { class: 'ge-countdown-in' }, label)], { variant: v, class: cls, 'data-act': 'revert', title: 'Stop and put the lights back' }),
      btn(chevron('cc-chev'), { variant: v, class: `${cls} ge-split-caret`, icon: true, 'aria-label': 'Test mode', 'aria-haspopup': 'menu', 'data-act': 'test-menu' }))
  }
  const label = state.other ? 'Take over' : 'Test'
  return el('span', { class: 'ge-split', title: reason }, btn([icon(ICON.play), label], { variant: v, class: cls, 'data-act': 'test', disabled: blocked, title: reason ?? (test.mode === 'once' ? 'Show this graph on the real lights for 15 seconds' : 'Show this graph on the real lights until you stop') }),
    btn(chevron('cc-chev'), { variant: v, class: `${cls} ge-split-caret`, icon: true, 'aria-label': 'Test mode', 'aria-haspopup': 'menu', 'data-act': 'test-menu', disabled: blocked }))
}

function testMenu() {
  closePopups()
  const r = document.querySelector('.ge-split').getBoundingClientRect()
  const pick = (mode) => () => startTest(mode)
  menu([
    { label: 'Once (15 s)', checked: test.mode === 'once', run: pick('once') },
    { label: 'Live (until stopped)', checked: test.mode === 'live', run: pick('live') },
  ], r.right - 200, r.bottom + 6)
}

function startTest(mode, left = 15, tick = true) {
  stopTimer()
  Object.assign(test, { mode, left })
  state.testing = true
  if (mode === 'once' && tick) test.timer = setInterval(() => { if (--test.left <= 0) { stopTimer(); state.testing = false; toast('Lights put back') } drawBar() }, 1000)
  drawBar()
}

// One persistent line under the bar, for what must be answered or cannot be missed.
function drawBanner() {
  document.querySelector('.ge-banner')?.remove()
  const b = state.banner
  if (!b) return
  $('bar').after(el('div', { class: 'ge-banner', role: 'alert' },
    el('span', {}, b.text, b.detail ? el('small', {}, b.detail) : null),
    b.actions.map(([label, act, primary]) => btn(label, { variant: primary ? 'primary' : undefined, class: `ui-button${primary ? ' ge-primary' : ''}`, 'data-act': act }))))
}

// Mock region list in the shape of the editor's ZoneRegions: normalised screen boxes for the active output.
const OUTPUTS = [
  { name: 'Desk strip', active: true, zones: [
    ['#d4714f', 0, 0, 0.2, 1], ['#c85f6d', 0.2, 0, 0.8, 0.25], ['#8e5fb0', 0.8, 0, 1, 1], ['#4d6bc9', 0.2, 0.75, 0.5, 1], ['#3f9a8a', 0.5, 0.75, 0.8, 1], ['#e5ad3c', null]] },
  { name: 'Shelf', zones: ['#4d6bc9', '#5b7fd6', '#8e5fb0', '#c85f6d', '#d4714f'].map((c) => [c, null]) },
  { name: 'Bar', zones: ['#3f9a8a', '#38c9a8', '#4d6bc9', '#8e5fb0', '#c85f6d', '#d4714f', '#e5ad3c', '#d4714f', '#c85f6d', '#8e5fb0', '#4d6bc9'].map((c) => [c, null]) },
]
const COLS = 8, SCREEN_ROWS = 4.5

// Same layout as the editor's layoutThumbnail: placed zones at their regions, then one block of cells per output.
function zoneRects() {
  const placed = [], blocks = []
  for (const out of OUTPUTS) {
    const loose = []
    for (const [color, x0, y0, x1, y1] of out.zones) {
      if (out.active && x0 !== null && x0 !== undefined) placed.push({ x: x0 * COLS, y: y0 * SCREEN_ROWS, w: (x1 - x0) * COLS, h: (y1 - y0) * SCREEN_ROWS, color })
      else loose.push(color)
    }
    if (loose.length) blocks.push(loose)
  }
  const panelRows = placed.length ? SCREEN_ROWS : 0
  let row = 0
  const cells = []
  for (const loose of blocks) {
    loose.forEach((color, i) => cells.push({ x: i % COLS, y: row + Math.floor(i / COLS) + (panelRows ? panelRows + 0.25 : 0), w: 1, h: 1, color }))
    row += Math.max(1, Math.ceil(loose.length / COLS))
  }
  return { rects: [...placed, ...cells], rows: row + (panelRows ? panelRows + (row ? 0.25 : 0) : 0) }
}

function zonesIsland() {
  const { rects, rows } = zoneRects()
  const body = state.zonesOpen ? el('div', { class: 'ge-zmap', style: `--rows:${rows}` },
    rects.map((r) => el('i', { style: `--x:${r.x};--y:${r.y};--w:${r.w};--h:${r.h};background:${r.color}` })),
    el('button', { type: 'button', class: 'ge-zsize', 'data-act': 'zsize', 'aria-label': state.zonesLarge ? 'Smaller zone map' : 'Larger zone map', title: state.zonesLarge ? 'Smaller' : 'Larger' }, icon(state.zonesLarge ? ICON.collapse : ICON.expand))) : null
  return el('div', { class: `ge-zones ge-zones-v${state.zonesLarge ? ' large' : ''}${state.problems ? ' stale' : ''}` },
    el('button', { type: 'button', class: 'ge-zones-head', 'data-act': 'zones', 'aria-expanded': state.zonesOpen, 'aria-label': state.zonesOpen ? 'Hide zones' : 'Show zones' }, 'Zones', chevron('cc-chev', state.zonesOpen)),
    body)
}

function drawIslands() {
  $('controls-btn').replaceChildren('Dashboard controls ', el('span', { class: 'ge-count' }, String(state.controls.length)))
  if (opts.split) { $('preview').replaceChildren(zonesIsland()); return }
  $('preview').replaceChildren(el('div', { class: `ge-zones${state.problems ? ' stale' : ''}` },
    el('button', { type: 'button', class: 'ge-zones-head', 'data-act': 'zones', 'aria-expanded': state.zonesOpen }, 'Zone preview', chevron('cc-chev', state.zonesOpen ? 'up' : 'down' === 'up')),
    state.zonesOpen ? el('div', { class: 'ge-zones-grid' }, el('i'), el('i'), el('i'), el('i')) : null))
}

let toastTimer
function toast(text) {
  const t = $('toast')
  t.textContent = text
  t.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { t.hidden = true }, 3200)
}

// --- Popups ------------------------------------------------------------------

function closePopups() {
  state.popup = null
  layer.replaceChildren()
}

function place(pop, x, y) {
  layer.append(pop)
  const r = pop.getBoundingClientRect()
  pop.style.left = `${Math.max(8, Math.min(x, innerWidth - r.width - 8))}px`
  pop.style.top = `${Math.max(8, Math.min(y, innerHeight - r.height - 8))}px`
  return pop
}

function menu(items, x, y, { sub = false } = {}) {
  const pop = el('div', { class: 'ge-pop ge-menu', role: 'menu', 'data-sub': sub })
  let flyout = null
  for (const item of items) {
    if (item === '-') { pop.append(el('div', { class: 'ge-rule' })); continue }
    if (item.head) { pop.append(el('div', { class: 'ge-menu-head' }, item.head)); continue }
    const row = el('button', {
      type: 'button', class: 'ge-item', role: item.checked === undefined ? 'menuitem' : 'menuitemcheckbox', disabled: item.disabled, 'aria-checked': item.checked === undefined ? undefined : String(item.checked),
      onclick: () => { if (item.sub) return; closePopups(); item.run?.() },
      onmouseenter: (e) => {
        flyout?.remove(); flyout = null
        pop.querySelectorAll('.open').forEach((o) => o.classList.remove('open'))
        if (!item.sub) return
        e.currentTarget.classList.add('open')
        const r = e.currentTarget.getBoundingClientRect()
        flyout = menu(item.sub(), r.right + 2, r.top - 5, { sub: true })
      },
    },
      el('span', { class: 'ge-item-main' }, item.checked === undefined ? null : el('span', { class: 'tick' }, item.checked ? '✓' : ''), item.label),
      item.sub ? chevron('ge-arrow cc-chev') : item.key ? el('kbd', {}, item.key) : null)
    pop.append(row)
  }
  return place(pop, x, y)
}

function canvasMenu(sx, sy) {
  closePopups()
  menu([
    { label: 'Add node…', key: 'A', run: () => openAdd('browser', sx, sy) },
    '-',
    { label: 'Undo', key: 'Ctrl+Z', run: () => toast('Undo') },
    { label: 'Redo', key: 'Ctrl+Shift+Z', disabled: true },
    '-',
    { label: 'Fit view', key: 'F', run: fit },
  ], sx, sy)
}

function showSub(node) {
  const info = byType.get(node.type)
  if (!info.params.length) return [{ label: 'This node has no params', disabled: true }]
  return info.params.map((p) => ({
    label: paramLabel(p),
    checked: state.controls.some((c) => c.node === node.id && c.param === p.name),
    run: () => toggleControl(node.id, p.name),
  }))
}

function toggleControl(nodeId, param) {
  const at = state.controls.findIndex((c) => c.node === nodeId && c.param === param)
  if (at >= 0) state.controls.splice(at, 1)
  else state.controls.push({ node: nodeId, param })
  state.unsaved = true
  drawBar(); drawIslands()
}

function nodeMenu(node, sx, sy, { openSub = false } = {}) {
  closePopups()
  state.selected = node.id
  state.wire = null
  drawNodes()
  const pop = menu([
    { label: 'Details', run: () => openDetails(node) },
    { label: 'Show on the Dashboard', sub: () => showSub(node) },
    '-',
    { label: 'Delete', key: 'Del', run: () => deleteNode(node) },
  ], sx, sy)
  if (openSub) pop.querySelectorAll('.ge-item')[1].dispatchEvent(new MouseEvent('mouseenter'))
}

function deleteNode(node) {
  state.nodes = state.nodes.filter((n) => n !== node)
  state.edges = state.edges.filter((e) => !e.from.startsWith(`${node.id}.`) && !e.to.startsWith(`${node.id}.`))
  state.controls = state.controls.filter((c) => c.node !== node.id)
  state.selected = null
  state.unsaved = true
  drawNodes(); drawBar(); drawIslands()
}

function wireMenu(index, sx, sy) {
  closePopups()
  state.wire = index
  state.selected = null
  drawNodes()
  menu([{ label: 'Delete connection', key: 'Del', run: () => { state.edges.splice(index, 1); state.wire = null; state.unsaved = true; drawWires(); drawBar() } }], sx, sy)
}

function openTitle({ nameError = false, changed = false } = {}) {
  closePopups()
  const anchor = document.querySelector('.ge-title').getBoundingClientRect()
  const effect = (label, on) => el('button', { type: 'button', class: 'ge-item', role: 'menuitemradio', 'aria-checked': String(on), onclick: closePopups }, el('span', { class: 'ge-item-main' }, el('span', { class: 'tick' }, on ? '✓' : ''), label))
  const action = (label, key, run) => el('button', { type: 'button', class: 'ge-item', onclick: () => { closePopups(); run() } }, el('span', { class: 'ge-item-main' }, el('span', { class: 'tick' }), label), key ? el('kbd', {}, key) : null)
  place(el('div', { class: 'ge-pop ge-titlepop', role: 'dialog', 'aria-label': 'Effect' },
    el('label', { class: 'ge-field' }, el('span', { class: 'ge-field-label' }, 'Name'), el('input', { class: 'ui-text-input', type: 'text', placeholder: 'Name the new effect', 'aria-invalid': nameError, 'aria-describedby': 'name-note' })),
    el('p', { class: `ge-note${nameError ? ' ge-note-need' : ''}`, id: 'name-note' }, nameError ? 'Name the new effect first. A built-in stays as it is, and Save makes a copy under this name.' : 'A built-in stays as it is. Saving makes a copy under this name.'),
    changed ? el('p', { class: 'ge-note ge-note-need' }, 'This graph changed since the test started. Save and apply puts the edited graph live, and ends the test.') : null,
    el('div', { class: 'ge-rule' }),
    action('Save', 'Ctrl+S', () => { state.unsaved = false; drawBar(); toast('Saved as Screen colors copy') }),
    action('Save as new', null, () => { state.unsaved = false; drawBar(); toast('Saved as Screen colors copy') }),
    action('Save and apply', null, () => { state.unsaved = false; state.testing = false; drawBar(); toast('Saved and live') }),
    el('div', { class: 'ge-rule' }),
    el('div', { class: 'ge-menu-head' }, 'Open another effect'),
    effect('Screen colors', true), effect('Music pulse', false), effect('Candle', false),
    el('div', { class: 'ge-rule' }),
    el('button', { type: 'button', class: 'ge-item', onclick: closePopups }, el('span', { class: 'ge-item-main' }, el('span', { class: 'tick' }), 'New empty effect'))),
    anchor.left, anchor.bottom + 6)
  if (nameError) layer.querySelector('input').focus()
}

function openView() {
  closePopups()
  const r = $('view-btn').getBoundingClientRect()
  const zoom = (factor) => { state.view.k = Math.min(2, Math.max(0.2, state.view.k * factor)); applyView() }
  const pop = menu([
    { label: 'Fit view', key: 'F', run: fit },
    { label: 'Zoom in', key: 'Ctrl++', run: () => zoom(1.2) },
    { label: 'Zoom out', key: 'Ctrl+-', run: () => zoom(1 / 1.2) },
    '-',
    { label: 'Minimap', checked: false, run: () => toast('The minimap stays off in this mock') },
  ], r.right - 216, r.top)
  pop.style.top = `${r.top - pop.offsetHeight - 6}px`
}

function openProblems() {
  closePopups()
  const r = document.querySelector('.ge-problems').getBoundingClientRect()
  const row = (title, text) => el('button', { type: 'button', class: 'ge-prob', onclick: () => { closePopups(); state.selected = 'zones_hue'; drawNodes() } }, el('b', {}, title), text)
  place(el('div', { class: 'ge-pop ge-probpop', role: 'dialog', 'aria-label': 'Problems' },
    state.wholeGraph ? el('div', { class: 'ge-prob whole' }, el('b', {}, 'Whole graph'), 'Nothing sends to the lights yet. Add an Output node and connect a Frame to it.', el('span', { class: 'ge-prob-act' }, btn('Add node…', { 'data-act': 'add' }))) : null,
    row('Sample zones', 'The image input is not connected.'),
    row('Sample zones', 'Choose an output for this node.')), r.left, r.bottom + 6)
}

function drawer(title, sub, body) {
  closePopups()
  const r = $('canvas').getBoundingClientRect()
  const pop = el('aside', { class: 'ge-pop ge-drawer', 'aria-label': title, style: `top:${r.top}px;right:0;bottom:0` },
    el('div', { class: 'ge-drawer-head' }, title, btn('×', { icon: true, 'aria-label': 'Close', onclick: closePopups })),
    sub ? el('p', { class: 'ge-drawer-sub' }, sub) : null,
    el('div', { class: 'ge-drawer-body ae-scroll' }, body))
  layer.append(pop)
}

function openControls(expanded = 0) {
  const row = (c, i) => {
    const node = state.nodes.find((n) => n.id === c.node)
    const info = node && byType.get(node.type)
    const param = info?.params.find((p) => p.name === c.param)
    const open = i === expanded
    const input = (label, value) => el('label', { class: 'ge-field' }, el('span', { class: 'ge-field-label' }, label), el('input', { class: 'ui-text-input', type: 'text', value }))
    return el('div', { class: 'cc' },
      el('button', { type: 'button', class: 'cc-head', 'aria-expanded': open, onclick: () => openControls(open ? -1 : i) },
        el('span', {}, c.label || (param ? paramLabel(param) : c.param), el('small', {}, info ? titleOf(info) : c.node)),
        chevron('cc-chev', open ? 'up' : 'down' === 'up')),
      open ? el('div', { class: 'cc-body' },
        input('Label', c.label ?? ''), input('Section', c.section ?? ''), input('Tooltip', c.tooltip ?? ''),
        el('div', { class: 'cc-actions' },
          btn('Move up', { disabled: i === 0, onclick: () => { state.controls.splice(i - 1, 0, ...state.controls.splice(i, 1)); openControls(i - 1) } }),
          btn('Move down', { disabled: i === state.controls.length - 1, onclick: () => { state.controls.splice(i + 1, 0, ...state.controls.splice(i, 1)); openControls(i + 1) } }),
          btn('Remove', { onclick: () => { state.controls.splice(i, 1); drawIslands(); openControls(-1) } }))) : null)
  }
  drawer('Dashboard controls', 'What Tuning shows for this effect, in this order.', state.controls.map(row))
}

function openDetails(node) {
  const info = byType.get(node.type)
  const port = (p, dir) => el('div', { class: 'dt-port' }, socket(p.type), el('span', {}, el('b', {}, p.name), ` ${dir}, ${p.type}${p.description ? `. ${p.description}` : ''}`))
  drawer(titleOf(info), null, [
    el('p', { class: 'dt-p' }, info.purpose),
    info.useWhen ? el('p', { class: 'dt-p' }, info.useWhen) : null,
    info.inputs.length + info.outputs.length ? el('h4', { class: 'dt-h' }, 'Ports') : null,
    info.inputs.map((p) => port(p, 'in')), info.outputs.map((p) => port(p, 'out')),
    info.params.length ? el('h4', { class: 'dt-h' }, 'Show on the Dashboard') : null,
    el('div', { class: 'dt-toggles' }, info.params.map((p) => {
      const on = state.controls.some((c) => c.node === node.id && c.param === p.name)
      return el('label', { class: 'ge-toggle', title: p.description }, el('span', { class: 'ge-toggle-label' }, paramLabel(p)),
        el('input', { type: 'checkbox', checked: on, onchange: () => toggleControl(node.id, p.name) }))
    })),
  ])
}

// --- Add node ----------------------------------------------------------------

const add = { variant: 'browser', query: '', category: 'All', active: 0, at: null, results: [], open: new Set(['Sources']) }

function score(info, q) {
  const title = titleOf(info).toLowerCase()
  if (title.startsWith(q)) return 4
  if (title.split(/\s+/).some((w) => w.startsWith(q))) return 3
  if (title.includes(q)) return 2.5
  if (categoryOf.get(info.type).toLowerCase().startsWith(q)) return 2
  if (`${info.type} ${info.purpose} ${info.useWhen}`.toLowerCase().includes(q)) return 1
  return 0
}

function search() {
  const q = add.query.trim().toLowerCase()
  const inOrder = CATEGORIES.flatMap(([, types]) => types.map((t) => byType.get(t)))
  if (!q) return inOrder
  return inOrder.map((info) => [info, score(info, q)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).map(([info]) => info)
}

function nameWithMatch(info) {
  const title = titleOf(info), q = add.query.trim()
  const at = q ? title.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (at < 0) return [title]
  return [title.slice(0, at), el('mark', {}, title.slice(at, at + q.length)), title.slice(at + q.length)]
}

function signature(info) {
  return el('span', { class: 'ae-sig', 'aria-hidden': 'true' },
    info.inputs.map((p) => socket(p.type)), el('span', { class: 'ln' }), info.outputs.map((p) => socket(p.type)))
}

function row(info, index, { where = false, draggable = false } = {}) {
  return el('div', {
    class: `ae-row${index === add.active ? ' active' : ''}`, role: 'option', 'aria-selected': String(index === add.active), id: `ae-${index}`, 'data-index': index, draggable,
    onmousemove: () => { if (add.active !== index) { add.active = index; paintActive() } },
    onclick: () => addNode(info),
  },
    el('span', { class: 'ae-name' }, nameWithMatch(info), where ? el('span', { class: 'ae-where' }, ` · ${categoryOf.get(info.type)}`) : null),
    signature(info))
}

function searchBox() {
  const input = el('input', {
    class: 'ui-text-input', type: 'text', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'ae-rows', 'aria-label': 'Search nodes',
    placeholder: 'Search nodes', autocomplete: 'off', value: add.query,
    oninput: (e) => { add.query = e.target.value; add.active = 0; if (add.query.trim()) add.category = 'All'; paintAdd() },
    onkeydown: addKeys,
  })
  return el('label', { class: 'ae-search' }, icon(ICON.search), input)
}

function addKeys(e) {
  const max = add.results.length - 1
  if (e.key === 'ArrowDown') add.active = Math.min(max, add.active + 1)
  else if (e.key === 'ArrowUp') add.active = Math.max(0, add.active - 1)
  else if (e.key === 'Enter') { if (add.results[add.active]) addNode(add.results[add.active]); e.preventDefault(); return }
  else if (add.variant === 'browser' && !add.query && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    const names = ['All', ...CATEGORIES.map(([n]) => n)]
    const next = names.indexOf(add.category) + (e.key === 'ArrowRight' ? 1 : -1)
    add.category = names[(next + names.length) % names.length]
    add.active = 0
    paintAdd()
  } else return
  e.preventDefault()
  paintActive()
}

function paintActive() {
  document.querySelectorAll('.ae-row').forEach((r) => {
    const on = Number(r.dataset.index) === add.active
    r.classList.toggle('active', on)
    r.setAttribute('aria-selected', String(on))
    if (on) r.scrollIntoView({ block: 'nearest' })
  })
  document.querySelector('.ae-search input')?.setAttribute('aria-activedescendant', `ae-${add.active}`)
  paintInfo()
}

function paintInfo() {
  const info = add.results[add.active]
  const detail = document.querySelector('.ae-detail')
  if (detail) {
    detail.replaceChildren(...(info ? [
      el('div', { class: 'gn card' }, el('div', { class: 'gn-head' }, titleOf(info)), nodeBody(info, {}, 3)),
      el('p', {}, info.purpose),
      el('div', {}, el('h4', {}, 'Use it'), el('p', {}, info.useWhen)),
    ] : []))
  }
  const line = document.querySelector('.ae-sheet-note, .ae-fly p')
  if (line) line.textContent = info?.purpose ?? ''
}

function paintBrowser(pop) {
  const all = search()
  const count = (name) => all.filter((i) => name === 'All' || categoryOf.get(i.type) === name).length
  pop.querySelector('.ae-rail').replaceChildren(...['All', ...CATEGORIES.map(([n]) => n)].map((name) =>
    el('button', { type: 'button', class: `ae-cat${add.category === name ? ' on' : ''}`, disabled: count(name) === 0, onclick: () => { add.category = name; add.active = 0; paintAdd(); pop.querySelector('input').focus() } }, name, el('small', {}, String(count(name))))))
  add.results = all.filter((i) => add.category === 'All' || categoryOf.get(i.type) === add.category)
  const list = pop.querySelector('.ae-list')
  const q = add.query.trim()
  if (!add.results.length) { list.replaceChildren(el('p', { class: 'ae-none' }, `No node matches "${q}".`)); paintInfo(); return }
  const rows = []
  let last = null, related = false
  add.results.forEach((info, i) => {
    const cat = categoryOf.get(info.type)
    if (!q && add.category === 'All' && cat !== last) rows.push(el('div', { class: 'ae-group' }, cat))
    last = cat
    if (q && !related && score(info, q.toLowerCase()) <= 1) { related = true; rows.push(el('div', { class: 'ae-group' }, 'Mentioned in the description')) }
    rows.push(row(info, i, { where: Boolean(q) }))
  })
  list.replaceChildren(...rows)
  list.scrollTop = 0
  paintActive()
}

function paintCascade(pop) {
  const rows = pop.querySelector('.ae-rows')
  document.querySelector('.ae-fly')?.remove()
  if (add.query.trim()) {
    add.results = search()
    rows.replaceChildren(...add.results.map((info, i) => row(info, i, { where: true })))
    if (!add.results.length) rows.replaceChildren(el('p', { class: 'ae-none' }, 'No matching node.'))
    paintActive()
    return
  }
  add.results = []
  rows.replaceChildren(...CATEGORIES.map(([name, types]) => el('button', {
    type: 'button', class: `ae-cat${add.category === name ? ' on' : ''}`, onmouseenter: () => { if (add.category !== name) { add.category = name; add.active = 0; paintCascade(pop) } },
  }, name, chevron('ge-arrow cc-chev'))))
  const open = CATEGORIES.find(([n]) => n === add.category)
  if (!open) return
  add.results = open[1].map((t) => byType.get(t))
  const anchor = [...rows.children][CATEGORIES.indexOf(open)].getBoundingClientRect()
  const r = pop.getBoundingClientRect()
  place(el('div', { class: 'ge-pop ae-fly' }, el('div', { class: 'ae-rows ae-scroll', role: 'listbox' }, add.results.map((info, i) => row(info, i))), el('p')), r.right + 2, anchor.top - 8)
  paintActive()
}

function paintSheet(pop) {
  const rows = pop.querySelector('.ae-rows')
  const found = search(), q = add.query.trim()
  add.results = []
  const out = []
  for (const [name] of CATEGORIES) {
    const members = found.filter((i) => categoryOf.get(i.type) === name)
    if (!members.length) continue
    const open = q || add.open.has(name)
    out.push(el('button', { type: 'button', class: 'ae-acc', 'aria-expanded': Boolean(open), onclick: () => { add.open.has(name) ? add.open.delete(name) : add.open.add(name); paintAdd() } },
      el('span', { class: 'ae-acc-title' }, name, el('small', {}, String(members.length))),
      chevron('cc-chev', open ? 'up' : 'down' === 'up')))
    if (open) for (const info of members) { out.push(row(info, add.results.length, { draggable: true })); add.results.push(info) }
  }
  rows.replaceChildren(...out)
  paintActive()
}

function paintAdd() {
  const pop = document.querySelector('[data-add]')
  if (!pop) return
  ;({ browser: paintBrowser, cascade: paintCascade, sheet: paintSheet })[add.variant](pop)
}

function openAdd(variant, sx, sy, { query = '', category } = {}) {
  closePopups()
  Object.assign(add, { variant, query, category: category ?? (variant === 'cascade' ? 'Lights' : 'All'), active: 0, at: sx === undefined ? null : toFlow(sx, sy) })
  state.popup = 'add'
  const button = document.querySelector('.ge-tl .ui-button').getBoundingClientRect()
  const x = sx ?? button.left, y = sy ?? button.bottom + 8
  let pop
  if (variant === 'browser') {
    pop = place(el('div', { class: 'ge-pop ae-browser', role: 'dialog', 'aria-label': 'Add node', 'data-add': true },
      el('div', { class: 'ae-top' }, searchBox()),
      el('div', { class: 'ae-body' },
        el('div', { class: 'ae-rail ae-scroll' }),
        el('div', { class: 'ae-list ae-scroll', role: 'listbox', id: 'ae-rows' }),
        el('div', { class: 'ae-detail ae-scroll' })),
      el('div', { class: 'ae-foot' }, el('span', {}, el('kbd', {}, '↑ ↓'), ' choose'), el('span', {}, el('kbd', {}, '← →'), ' group'), el('span', {}, el('kbd', {}, 'Enter'), ' add'), el('span', {}, el('kbd', {}, 'Esc'), ' close'))), x, y)
  } else if (variant === 'cascade') {
    pop = place(el('div', { class: 'ge-pop ae-cascade', role: 'dialog', 'aria-label': 'Add node', 'data-add': true }, searchBox(), el('div', { class: 'ae-rows ae-scroll', id: 'ae-rows' })), x, y)
  } else {
    const top = $('canvas').getBoundingClientRect().top
    pop = el('aside', { class: 'ge-pop ae-sheet', 'aria-label': 'Add node', 'data-add': true, style: `left:0;top:${top}px;bottom:0` },
      el('div', { class: 'ae-sheet-head' }, 'Add node', btn('×', { icon: true, 'aria-label': 'Close', onclick: closePopups })),
      searchBox(), el('div', { class: 'ae-rows ae-scroll', id: 'ae-rows', role: 'listbox' }), el('div', { class: 'ae-sheet-note' }))
    layer.append(pop)
  }
  paintAdd()
  pop.querySelector('input').focus()
}

function addNode(info) {
  const at = add.at ?? toFlow(innerWidth / 2, innerHeight / 2)
  const id = `${info.type.split('.').pop()}_${state.nodes.length + 1}`
  state.nodes.push({ id, type: info.type, params: {}, x: at.x, y: at.y })
  state.selected = id
  state.unsaved = true
  if (add.variant === 'sheet') add.at = { x: at.x + 32, y: at.y + 32 }
  else closePopups()
  drawNodes(); drawBar()
  toast(`Added ${titleOf(info)}`)
}

// --- Frames and events -------------------------------------------------------

const point = (id) => {
  const r = document.querySelector(`[data-node="${id}"]`).getBoundingClientRect()
  return [r.left + r.width / 2, r.top + 20]
}
const FRAMES = [
  ['Layout', [['rest', 'At rest', () => {}], ['title', 'Title menu', openTitle], ['view', 'View menu', openView]]],
  ['Add node', [
    ['browser', 'A: Browser', () => openAdd('browser')],
    ['browser-search', 'A: Search', () => openAdd('browser', undefined, undefined, { query: 'hue' })],
    ['browser-lights', 'A: Group', () => openAdd('browser', undefined, undefined, { category: 'Lights' })],
    ['cascade', 'B: Cascade', () => openAdd('cascade')],
    ['sheet', 'C: Side sheet', () => openAdd('sheet')],
  ]],
  ['Right-click', [
    ['ctx-canvas', 'Canvas', () => canvasMenu(620, 240)],
    ['ctx-node', 'Node', () => { const [x, y] = point('ease_hue'); nodeMenu(state.nodes.find((n) => n.id === 'ease_hue'), x, y, { openSub: true }) }],
    ['ctx-wire', 'Wire', () => wireMenu(3, 720, 400)],
  ]],
  ['Panels', [['controls', 'Dashboard controls', () => openControls(0)], ['details', 'Details', () => { const n = state.nodes.find((x) => x.id === 'ease_hue'); state.selected = n.id; drawNodes(); openDetails(n) }]]],
  ['Gaps', [
    ['restore', 'Restore or Discard', () => { state.unsaved = false; state.banner = { text: 'Unsaved changes from an earlier visit.', detail: 'Kept in this browser, 2 hours ago. Nothing is backed up until you choose.', actions: [['Restore', 'toast-restore', true], ['Discard', 'toast-discard']] }; drawBar(); drawBanner() }],
    ['takeover', 'Take over', () => { state.other = true; state.status = { text: 'Lights in use: another session is testing', strong: true }; drawBar() }],
    ['changed', 'Edited during test', () => { state.testing = true; state.unsaved = true; state.changed = true; drawBar(); openTitle({ changed: true }) }],
    ['reconnect', 'Reconnect', () => { state.status = { text: 'Preview taken over', strong: true, action: { act: 'reconnect', label: 'Reconnect' } }; drawBar() }],
    ['name', 'Name a built-in', () => { state.unsaved = true; drawBar(); openTitle({ nameError: true }) }],
    ['offline', 'Cannot reach Aurora', () => { state.status = { text: 'Aurora unreachable', strong: true }; state.banner = { blocking: true, text: 'Cannot reach Aurora.', detail: 'Retrying every few seconds. Edits stay in this browser.', actions: [['Retry now', 'retry']] }; drawBar(); drawBanner() }],
    ['wholegraph', 'Graph-wide problem', () => { state.problems = true; state.wholeGraph = true; drawBar(); drawIslands(); openProblems() }],
  ]],
  ['States', [['testing', 'Testing', () => { state.unsaved = true; startTest('once', 12, false) }], ['testing-live', 'Testing live', () => { state.unsaved = true; startTest('live') }], ['problems', 'Problems', () => { state.problems = true; drawBar(); drawIslands(); drawNodes(); openProblems() }], ['refused', 'Refused wire', () => toast('Those ports do not match: an Image cannot connect to a Frame')]]],
]

function drawFrames(current) {
  const toggle = (label, on, key) => el('a', { href: '#', role: 'switch', 'aria-checked': String(on), class: on ? 'on' : undefined, onclick: (e) => { e.preventDefault(); e.stopPropagation(); opts[key] = !opts[key]; showFrame() } }, label)
  $('frames').replaceChildren(...FRAMES.flatMap(([group, frames]) => [el('b', {}, group), ...frames.map(([id, label]) => el('a', { href: `#${id}`, class: id === current ? 'on' : undefined }, label))]),
    el('b', {}, 'Decisions'),
    toggle('Back link and title boxed', opts.backBoxed, 'backBoxed'),
    toggle('Test on lights primary', opts.testPrimary, 'testPrimary'),
    toggle('Test split button + Zones island', opts.split, 'split'))
}

function showFrame() {
  const id = location.hash.slice(1) || 'rest'
  closePopups()
  stopTimer()
  Object.assign(test, { mode: 'once', left: 12 })
  Object.assign(state, { zonesLarge: false, testing: false, problems: false, unsaved: false, selected: null, wire: null, banner: null, status: null, other: false, changed: false, wholeGraph: false })
  drawNodes(); drawBar(); drawBanner(); drawIslands(); fit(); drawFrames(id)
  FRAMES.flatMap(([, frames]) => frames).find(([key]) => key === id)?.[2]()
}

const ACTS = {
  add: () => openAdd('browser'), controls: () => openControls(0), view: openView, title: openTitle, problems: openProblems,
  back: () => toast('Goes to the Dashboard. Unsaved edits stay in the browser backup.'),
  'toast-undo': () => toast('Undo'),
  test: () => { if (opts.split) startTest(test.mode); else { state.testing = true; drawBar() } },
  'test-menu': testMenu,
  revert: () => { stopTimer(); state.testing = false; drawBar(); toast('Lights put back') },
  'toast-restore': () => { state.banner = null; state.unsaved = true; drawBar(); drawBanner(); toast('Restored your earlier changes') },
  'toast-discard': () => { state.banner = null; drawBar(); drawBanner(); toast('Discarded the earlier copy') },
  reconnect: () => { state.status = null; state.other = false; drawBar(); toast('Preview reconnected') },
  retry: () => toast('Still cannot reach Aurora'),
  zsize: () => { state.zonesLarge = !state.zonesLarge; drawIslands() },
  zones: () => { state.zonesOpen = !state.zonesOpen; drawIslands() },
}

document.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')
  if (act) { e.stopPropagation(); ACTS[act.dataset.act]?.(); return }
  if (!e.target.closest('.ge-pop')) closePopups()
  const node = e.target.closest('[data-node]')
  if (e.target.closest('#canvas') && !e.target.closest('.ge-island')) {
    state.selected = node?.dataset.node ?? null
    state.wire = null
    drawNodes()
  }
})

document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('#canvas') || e.target.closest('.ge-island')) return
  e.preventDefault()
  const wire = e.target.closest('[data-wire]')
  const box = e.target.closest('[data-node]')
  if (wire) wireMenu(Number(wire.dataset.wire), e.clientX, e.clientY)
  else if (box) nodeMenu(state.nodes.find((n) => n.id === box.dataset.node), e.clientX, e.clientY)
  else canvasMenu(e.clientX, e.clientY)
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closePopups(); return }
  if (e.target.matches('input')) return
  if (e.key.toLowerCase() === 'a') { e.preventDefault(); openAdd('browser') }
  if (e.key.toLowerCase() === 'f') fit()
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const node = state.nodes.find((n) => n.id === state.selected)
    if (node) deleteNode(node)
  }
})

const canvas = $('canvas')
canvas.addEventListener('wheel', (e) => {
  e.preventDefault()
  const r = canvas.getBoundingClientRect(), { x, y, k } = state.view
  const next = Math.min(2, Math.max(0.2, k * Math.exp(-e.deltaY / 500)))
  const px = e.clientX - r.left, py = e.clientY - r.top
  state.view = { k: next, x: px - ((px - x) / k) * next, y: py - ((py - y) / k) * next }
  applyView()
}, { passive: false })

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('.ge-island, [data-node]')) return
  const from = { x: e.clientX, y: e.clientY, vx: state.view.x, vy: state.view.y }
  const move = (m) => { state.view.x = from.vx + m.clientX - from.x; state.view.y = from.vy + m.clientY - from.y; applyView() }
  addEventListener('pointermove', move)
  addEventListener('pointerup', () => removeEventListener('pointermove', move), { once: true })
})

addEventListener('hashchange', showFrame)
addEventListener('resize', fit)
layoutGraph()
showFrame()
