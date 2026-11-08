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
  view: { x: 0, y: 0, k: 1 }, selected: null, wire: null, testing: false, problems: false, unsaved: false, zonesOpen: true, popup: null,
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
  undo: '<path d="M9 7 4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 5 5v1"/>',
  redo: '<path d="m15 7 5 5-5 5"/><path d="M20 12H9a5 5 0 0 0-5 5v1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
}
const chevron = (cls = '') => el('img', { src: '../icons/chevron-down.svg', alt: '', class: `ge-chev ${cls}` })
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
    el('input', { class: 'slider-input', type: 'range', min, max, step: p.step || 'any', value: number, tabindex: -1, 'aria-label': paramLabel(p), style: `--slider-percent:${percent}%` }))
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
  const problems = state.problems ? el('button', { type: 'button', class: 'ge-problems', 'data-act': 'problems' }, el('img', { src: '../icons/warning.svg', alt: '' }), '2 problems') : null
  const test = state.testing
    ? [el('span', { class: 'ge-countdown' }, 'On the lights, reverts in 0:24'),
       el('button', { type: 'button', class: 'btn btn-secondary', 'data-act': 'revert' }, 'Revert')]
    : [el('button', { type: 'button', class: 'btn btn-secondary', 'data-act': 'test', disabled: state.problems, title: 'Show this graph on the real lights for a while, then put them back' }, 'Test on lights')]
  fill(bar, [
    el('button', { type: 'button', class: 'ge-back', 'data-act': 'back' }, '← Aurora'),
    el('span', { class: 'ge-sep' }),
    el('button', { type: 'button', class: 'ge-title', 'data-act': 'title', 'aria-haspopup': 'dialog' }, 'Screen colors', el('img', { src: '../icons/chevron-down.svg', alt: '', class: 'ge-chev cc-chev' })),
    state.unsaved ? el('span', { class: 'ge-unsaved' }, 'Unsaved') : null,
    el('span', { class: 'ge-spacer' }),
    problems,
    el('span', { class: 'ge-status', role: 'status' }, el('span', { class: 'ge-dot' }), state.problems ? 'Preview paused' : 'Live preview'),
    el('button', { type: 'button', class: 'btn btn-secondary btn-icon', 'aria-label': 'Undo', title: 'Undo (Ctrl+Z)', 'data-act': 'toast-undo' }, icon(ICON.undo)),
    el('button', { type: 'button', class: 'btn btn-secondary btn-icon', 'aria-label': 'Redo', title: 'Redo (Ctrl+Shift+Z)', disabled: true }, icon(ICON.redo)),
    el('span', { class: 'ge-sep' }),
    test])
}

function drawIslands() {
  $('controls-btn').replaceChildren('Dashboard controls ', el('span', { class: 'ge-count' }, String(state.controls.length)))
  $('preview').replaceChildren(el('div', { class: `ge-zones${state.problems ? ' stale' : ''}` },
    el('button', { type: 'button', class: 'ge-zones-head', 'data-act': 'zones', 'aria-expanded': state.zonesOpen }, 'Zone preview', el('img', { src: `../icons/chevron-${state.zonesOpen ? 'up' : 'down'}.svg`, alt: '', class: 'ge-chev cc-chev' })),
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
      item.sub ? el('img', { src: '../icons/chevron-down.svg', alt: '', class: 'ge-chev ge-arrow cc-chev' }) : item.key ? el('kbd', {}, item.key) : null)
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

function openTitle() {
  closePopups()
  const anchor = document.querySelector('.ge-title').getBoundingClientRect()
  const effect = (label, on) => el('button', { type: 'button', class: 'ge-item', role: 'menuitemradio', 'aria-checked': String(on), onclick: closePopups }, el('span', { class: 'ge-item-main' }, el('span', { class: 'tick' }, on ? '✓' : ''), label))
  const action = (label, key, run) => el('button', { type: 'button', class: 'ge-item', onclick: () => { closePopups(); run() } }, el('span', { class: 'ge-item-main' }, el('span', { class: 'tick' }), label), key ? el('kbd', {}, key) : null)
  place(el('div', { class: 'ge-pop ge-titlepop', role: 'dialog', 'aria-label': 'Effect' },
    el('label', { class: 'field' }, el('span', { class: 'field-label' }, 'Name'), el('input', { class: 'text-input', type: 'text', placeholder: 'Name the new effect' })),
    el('p', { class: 'ge-note' }, 'A built-in stays as it is. Saving makes a copy under this name.'),
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
    row('Sample zones', 'The image input is not connected.'),
    row('Sample zones', 'Choose an output for this node.')), r.left, r.bottom + 6)
}

function drawer(title, sub, body) {
  closePopups()
  const r = $('canvas').getBoundingClientRect()
  const pop = el('aside', { class: 'ge-pop ge-drawer', 'aria-label': title, style: `top:${r.top}px;right:0;bottom:0` },
    el('div', { class: 'ge-drawer-head' }, title, el('button', { type: 'button', class: 'ge-x', 'aria-label': 'Close', onclick: closePopups }, '×')),
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
    const input = (label, value) => el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), el('input', { class: 'text-input', type: 'text', value }))
    return el('div', { class: 'cc' },
      el('button', { type: 'button', class: 'cc-head', 'aria-expanded': open, onclick: () => openControls(open ? -1 : i) },
        el('span', {}, c.label || (param ? paramLabel(param) : c.param), el('small', {}, info ? titleOf(info) : c.node)),
        el('img', { src: `../icons/chevron-${open ? 'up' : 'down'}.svg`, alt: '', class: 'ge-chev cc-chev' })),
      open ? el('div', { class: 'cc-body' },
        input('Label', c.label ?? ''), input('Section', c.section ?? ''), input('Tooltip', c.tooltip ?? ''),
        el('div', { class: 'cc-actions' },
          el('button', { type: 'button', class: 'btn btn-secondary', disabled: i === 0, onclick: () => { state.controls.splice(i - 1, 0, ...state.controls.splice(i, 1)); openControls(i - 1) } }, 'Move up'),
          el('button', { type: 'button', class: 'btn btn-secondary', disabled: i === state.controls.length - 1, onclick: () => { state.controls.splice(i + 1, 0, ...state.controls.splice(i, 1)); openControls(i + 1) } }, 'Move down'),
          el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => { state.controls.splice(i, 1); drawIslands(); openControls(-1) } }, 'Remove'))) : null)
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
      return el('label', { class: 'toggle-row', title: p.description }, el('span', { class: 'toggle-row-label' }, paramLabel(p)),
        el('span', { class: 'toggle-switch' }, el('input', { type: 'checkbox', checked: on, onchange: () => toggleControl(node.id, p.name) }), el('span', { class: 'toggle-knob' })))
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
    class: 'text-input', type: 'text', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'ae-rows', 'aria-label': 'Search nodes',
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
  }, name, el('img', { src: '../icons/chevron-down.svg', alt: '', class: 'ge-chev ge-arrow cc-chev' }))))
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
      el('img', { src: `../icons/chevron-${open ? 'up' : 'down'}.svg`, alt: '', class: 'ge-chev cc-chev' })))
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
  const button = document.querySelector('.ge-tl .btn').getBoundingClientRect()
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
      el('div', { class: 'ae-sheet-head' }, 'Add node', el('button', { type: 'button', class: 'ge-x', 'aria-label': 'Close', onclick: closePopups }, '×')),
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
  ['States', [['testing', 'Testing', () => { state.testing = true; state.unsaved = true; drawBar() }], ['problems', 'Problems', () => { state.problems = true; drawBar(); drawIslands(); drawNodes(); openProblems() }], ['refused', 'Refused wire', () => toast('Those ports do not match: an Image cannot connect to a Frame')]]],
]

function drawFrames(current) {
  $('frames').replaceChildren(...FRAMES.flatMap(([group, frames]) => [el('b', {}, group), ...frames.map(([id, label]) => el('a', { href: `#${id}`, class: id === current ? 'on' : undefined }, label))]))
}

function showFrame() {
  const id = location.hash.slice(1) || 'rest'
  closePopups()
  Object.assign(state, { testing: false, problems: false, unsaved: false, selected: null, wire: null })
  drawNodes(); drawBar(); drawIslands(); fit(); drawFrames(id)
  FRAMES.flatMap(([, frames]) => frames).find(([key]) => key === id)?.[2]()
}

const ACTS = {
  add: () => openAdd('browser'), controls: () => openControls(0), view: openView, title: openTitle, problems: openProblems,
  back: () => toast('Goes to the Dashboard. Unsaved edits stay in the browser backup.'),
  'toast-undo': () => toast('Undo'),
  test: () => { state.testing = true; drawBar() },
  revert: () => { state.testing = false; drawBar(); toast('Lights put back') },
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
