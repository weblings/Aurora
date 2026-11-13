// Graph editor mock (Aurora-bova): plain JS over the real catalog, so a pick is easy to try.
const { nodes: CATALOG, graph: GRAPH } = window.AURORA_MOCK
const byType = new Map()

const VIDEO = '#38c9a8', AUDIO = '#c58cf0', LIGHT = '#e5ad3c', NUMBER = '#9a9a9a'
const PORTS = {
  Image: [VIDEO, 'circle'], AudioBuffer: [AUDIO, 'circle'], AudioFeatures: [AUDIO, 'circle'], Frame: [LIGHT, 'circle'],
  Color: [LIGHT, 'circle'], Float: [NUMBER, 'circle'], Angle: [NUMBER, 'circle'], Trigger: [NUMBER, 'circle'],
}
// Every socket is a circle (Aurora-d0hv); the wire carries the difference: bulk types are thicker, Trigger is dashed.
const BULK = new Set(['Image', 'AudioBuffer', 'Frame'])
const wireClass = (type) => (BULK.has(type) ? 'bulk' : type === 'Trigger' ? 'trigger' : '')

// Mock-only converters (Aurora-jsjj). The catalog comes from server-samples/nodes.json, which does not have them yet;
// drop these when gen.py is next run after jsjj lands.
const scaleParam = (description) => ({ allowsUnset: false, default: 360, description, kind: 'float', label: 'Scale', max: 1000000, min: -1000000, name: 'scale', step: 0.01, unit: '' })
CATALOG.push(
  { type: 'angle.fromFloat', title: 'Float to Angle', cost: 'cheap', purpose: 'Turn a Float into an Angle: value times scale, wrapped at 360.', useWhen: 'Feed a Float (an LFO, a band level) into an Angle input such as a hue.',
    inputs: [{ name: 'value', type: 'Float', required: true, description: 'The Float to convert.' }], outputs: [{ name: 'angle', type: 'Angle', description: 'The Angle.' }], params: [scaleParam('Degrees per 1.0 of input.')] },
  { type: 'angle.toFloat', title: 'Angle to Float', cost: 'cheap', purpose: 'Turn an Angle into a Float: degrees divided by scale.', useWhen: 'Use a hue or other Angle as a plain number, e.g. in math nodes.',
    inputs: [{ name: 'angle', type: 'Angle', required: true, description: 'The Angle to convert.' }], outputs: [{ name: 'value', type: 'Float', description: 'The Float.' }], params: [scaleParam('Degrees per 1.0 of output.')] },
)

// Ordered like a signal: where it starts, what shapes it, where it lands.
const CATEGORIES = [
  ['Sources', ['video.capture', 'audio.capture', 'lfo', 'noise', 'color.constant', 'angle.constant', 'palette.randomAnchor']],
  ['Audio', ['audio.features', 'audio.bands', 'audio.drift', 'audio.bounce']],
  ['Image', ['image.rescale', 'image.dropAlpha', 'image.mix', 'image.gradient', 'image.bar', 'image.noise', 'image.hueRamp']],
  ['Color', ['color.fromHSV', 'color.toHSV', 'color.brightness', 'color.mix', 'color.hueShift', 'color.complement', 'color.fromGradient', 'palette.pick']],
  ['Numbers', ['math.scale', 'math.divide', 'math.clamp', 'math.mapRange', 'math.lerp', 'math.add', 'math.multiply', 'math.max', 'math.invert', 'angle.add', 'angle.fromFloat', 'angle.toFloat']],
  ['Motion', ['smooth.exp', 'smooth.angle', 'rollingAverage', 'integrate', 'stepOnTrigger']],
  ['Lights', ['zones.sample', 'frame.smooth', 'frame.smoothTime', 'frame.gain', 'frame.floor', 'frame.mix', 'frame.brightnessScale', 'frame.saturation', 'frame.hueShift', 'frame.tint', 'frame.broadcast', 'output.send']],
]
for (const n of CATALOG) byType.set(n.type, n)
const categoryOf = new Map(CATEGORIES.flatMap(([name, types]) => types.map((t) => [t, name])))
for (const n of CATALOG) if (!categoryOf.has(n.type)) console.error(`no category for ${n.type}`)

const state = {
  nodes: [], edges: GRAPH.edges.map(([from, to]) => ({ from, to })), controls: GRAPH.controls.map((c) => ({ ...c })),
  view: { x: 0, y: 0, k: 1 }, selected: null, wire: null, testing: false, problems: false, unsaved: false, zonesOpen: true, zonesLarge: false, popup: null, minimap: false,
  // States the first mock skipped (Aurora-daaa.6).
  banner: null, status: null, other: false, changed: false, nameError: false, wholeGraph: false,
}

const $ = (id) => document.getElementById(id)
// Problem count: the Stage 6 Open path sets it per effect; other frames use 2, or 3 with the Whole graph row.
const probN = () => state.problemCount ?? (state.wholeGraph ? 3 : 2)
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

// Icons are Grille's (dist/icons/<name>.svg in @weblings/grille, v0.1.0-dev.9; attribution in THIRD_PARTY_NOTICES.md). Path data is
// copied inline since a static page cannot load them. VS keys map to Grille files: expand fullscreen-arrow, collapse
// fullscreen-arrow-exit, play, stop, search, chevDown/chevUp chevron-down/-up, back arrow-left, add, close x-mark (32 grid).
// ZEST keys (24 grid): undo, minus, redo, warning. index.html's Add node button inlines add.svg too.
const vsicon = (paths, grid = 32, cls = '') => el('span', { html: `<svg class="ge-icon ge-vs ${cls}" viewBox="0 0 ${grid} ${grid}" aria-hidden="true">${paths}</svg>`, style: 'display:contents' })
const VS = {
  expand: '<path d="M17.3183 12.4856L21.2231 8.58073C21.3071 8.49674 21.2476 8.35312 21.1288 8.35312H18.0189C17.6507 8.35312 17.3522 8.05464 17.3522 7.68645V5.95312C17.3522 5.58493 17.6507 5.28645 18.0189 5.28645H26.0189C26.387 5.28645 26.6862 5.58493 26.6862 5.95312V13.9531C26.6862 14.3213 26.3877 14.6198 26.0196 14.6198H24.2862C23.918 14.6198 23.6196 14.3213 23.6196 13.9531V10.8431C23.6196 10.7243 23.4759 10.6648 23.3919 10.7488L19.4867 14.6541C19.2264 14.9144 18.8043 14.9144 18.5439 14.6541L17.3183 13.4284C17.0579 13.1681 17.0579 12.7459 17.3183 12.4856Z"/><path d="M6.1153 26.7135H14.1153C14.4835 26.7135 14.782 26.4151 14.782 26.0469V24.3135C14.782 23.9453 14.4835 23.6469 14.1153 23.6469H11.0053C10.8865 23.6469 10.827 23.5033 10.911 23.4193L14.8159 19.5144C15.0763 19.254 15.0763 18.8319 14.8159 18.5716L13.5903 17.3459C13.3299 17.0856 12.9078 17.0856 12.6474 17.3459L8.74222 21.2512C8.65822 21.3351 8.5146 21.2757 8.5146 21.1569L8.51461 18.0469C8.51461 17.6787 8.21613 17.3802 7.84794 17.3802H6.11461C5.74642 17.3802 5.44794 17.6787 5.44794 18.0469V26.0469C5.44794 26.4151 5.74711 26.7135 6.1153 26.7135Z"/>',
  collapse: '<path d="M19.913 6.45826V9.56817C19.913 9.68695 20.0566 9.74644 20.1406 9.66245L24.0458 5.75727C24.3061 5.49692 24.7283 5.49692 24.9886 5.75727L26.2143 6.98293C26.4746 7.24328 26.4746 7.66539 26.2143 7.92573L22.3093 11.8306C22.2253 11.9146 22.2848 12.0583 22.4036 12.0583H25.5137C25.8819 12.0583 26.1804 12.3567 26.1804 12.7249V14.4583C26.1804 14.8265 25.8819 15.1249 25.5137 15.1249L19.2468 15.1249C19.2466 15.1249 19.2469 15.1249 19.2468 15.1249H17.5137C17.1455 15.1249 16.8463 14.8265 16.8463 14.4583V6.45826C16.8463 6.09007 17.1448 5.7916 17.513 5.7916H19.2463C19.6145 5.7916 19.913 6.09007 19.913 6.45826Z"/><path d="M9.73054 19.9416C9.84933 19.9416 9.90882 20.0852 9.82482 20.1692L5.91991 24.0741C5.65956 24.3345 5.65956 24.7566 5.91991 25.0169L7.14556 26.2426C7.40591 26.5029 7.82802 26.5029 8.08837 26.2426L11.9935 22.3374C12.0775 22.2534 12.2212 22.3129 12.2212 22.4317V25.5416C12.2212 25.9098 12.5196 26.2083 12.8878 26.2083H14.6212C14.9893 26.2083 15.2878 25.9098 15.2878 25.5416L15.2878 17.5416C15.2878 17.1734 14.9893 16.8749 14.6212 16.8749H6.62046C6.25227 16.8749 5.9538 17.1734 5.9538 17.5416V19.2749C5.9538 19.6431 6.25227 19.9416 6.62046 19.9416H9.73054Z"/>',
  play: '<path d="M10.6667 6.6548C10.6667 6.10764 11.2894 5.79346 11.7295 6.11862L24.377 15.4634C24.7377 15.7298 24.7377 16.2692 24.3771 16.5357L11.7295 25.8813C11.2895 26.2065 10.6667 25.8923 10.6667 25.3451L10.6667 6.6548Z"/>',
  stop: '<path d="M8.66667 8C8.29848 8 8 8.29848 8 8.66667V23.3333C8 23.7015 8.29848 24 8.66667 24H23.3333C23.7015 24 24 23.7015 24 23.3333V8.66667C24 8.29848 23.7015 8 23.3333 8H8.66667Z"/>',
  search: '<path d="M20.1724 22.3417C20.1263 22.2956 20.0536 22.2897 20.0001 22.327C18.4883 23.3815 16.6497 24 14.6666 24C9.51199 24 5.33331 19.8213 5.33331 14.6667C5.33331 9.51202 9.51199 5.33334 14.6666 5.33334C19.8213 5.33334 24 9.51202 24 14.6667C24 16.6502 23.3813 18.4891 22.3263 20.0011C22.289 20.0546 22.2949 20.1273 22.341 20.1734L26.195 24.0274C26.4554 24.2878 26.4554 24.7099 26.195 24.9702L24.9694 26.1959C24.709 26.4562 24.2869 26.4562 24.0266 26.1959L20.1724 22.3417ZM20.9336 14.6667C20.9336 18.1278 18.1278 20.9336 14.6666 20.9336C11.2055 20.9336 8.39972 18.1278 8.39972 14.6667C8.39972 11.2055 11.2055 8.39975 14.6666 8.39975C18.1278 8.39975 20.9336 11.2055 20.9336 14.6667Z" fill-rule="evenodd"/>',
  chevDown: '<path d="M15.905 17.4809C15.9571 17.533 16.0415 17.533 16.0936 17.4809L22.4111 11.1635C22.6714 10.9031 23.0935 10.9031 23.3539 11.1635L24.9567 12.7662C25.217 13.0266 25.217 13.4487 24.9567 13.709L18.1028 20.5629C18.0937 20.5732 18.0842 20.5833 18.0744 20.5931L16.4716 22.1959C16.2113 22.4562 15.7892 22.4562 15.5288 22.1959L7.04353 13.7106C6.78318 13.4503 6.78318 13.0281 7.04353 12.7678L8.6463 11.165C8.90665 10.9047 9.32876 10.9047 9.58911 11.165L15.905 17.4809Z"/>',
  chevUp: '<path d="M15.905 14.8206C15.9571 14.7685 16.0415 14.7685 16.0936 14.8206L22.4111 21.1381C22.6714 21.3984 23.0935 21.3984 23.3539 21.1381L24.9567 19.5353C25.217 19.2749 25.217 18.8528 24.9567 18.5925L18.1028 11.7386C18.0937 11.7283 18.0842 11.7182 18.0744 11.7084L16.4716 10.1056C16.2113 9.84528 15.7892 9.84528 15.5288 10.1056L7.04353 18.5909C6.78318 18.8513 6.78318 19.2734 7.04353 19.5337L8.6463 21.1365C8.90665 21.3968 9.32876 21.3968 9.58911 21.1365L15.905 14.8206Z"/>',
  back: '<path d="M13.0908 14.3334C12.972 14.3334 12.9125 14.1898 12.9965 14.1058L17.7021 9.40022C17.9625 9.13987 17.9625 8.71776 17.7021 8.45741L16.2879 7.04319C16.0275 6.78284 15.6054 6.78284 15.3451 7.04319L6.8598 15.5285C6.59945 15.7888 6.59945 16.2109 6.8598 16.4713L8.27401 17.8855L8.27536 17.8868L15.3453 24.9568C15.6057 25.2172 16.0278 25.2172 16.2881 24.9568L17.7024 23.5426C17.9627 23.2822 17.9627 22.8601 17.7024 22.5998L12.9969 17.8944C12.9129 17.8104 12.9724 17.6668 13.0912 17.6668L26 17.6668C26.3682 17.6668 26.6667 17.3683 26.6667 17.0001V15.0001C26.6667 14.6319 26.3682 14.3334 26 14.3334L13.0908 14.3334Z"/>',
  add: '<path d="M17.1336 24.6659C17.5018 24.6659 17.8003 24.3675 17.8003 23.9993V17.9324C17.8003 17.8588 17.86 17.7991 17.9336 17.7991H23.9999C24.3681 17.7991 24.6666 17.5006 24.6666 17.1324V14.8657C24.6666 14.4976 24.3681 14.1991 23.9999 14.1991L17.9336 14.1991C17.86 14.1991 17.8003 14.1394 17.8003 14.0657V7.99928C17.8003 7.63109 17.5018 7.33261 17.1336 7.33261H14.867C14.4988 7.33261 14.2003 7.63109 14.2003 7.99928V14.0657C14.2003 14.1394 14.1406 14.1991 14.067 14.1991L7.99992 14.1991C7.63173 14.1991 7.33325 14.4976 7.33325 14.8658V17.1324C7.33325 17.5006 7.63173 17.7991 7.99992 17.7991L14.067 17.7991C14.1406 17.7991 14.2003 17.8588 14.2003 17.9324V23.9993C14.2003 24.3675 14.4988 24.6659 14.867 24.6659H17.1336Z"/>',
  close: '<path d="M10.2017 23.401C10.462 23.6613 10.8841 23.6613 11.1445 23.401L15.9057 18.6398C15.9577 18.5877 16.0422 18.5877 16.0942 18.6398L20.8555 23.401C21.1158 23.6613 21.5379 23.6613 21.7983 23.401L23.401 21.7982C23.6614 21.5378 23.6614 21.1157 23.401 20.8554L18.6398 16.0942C18.5878 16.0421 18.5878 15.9577 18.6398 15.9056L23.401 11.1444C23.6613 10.8841 23.6613 10.462 23.401 10.2016L21.7982 8.59886C21.5379 8.33851 21.1158 8.33851 20.8554 8.59886L16.0942 13.36C16.0422 13.4121 15.9577 13.4121 15.9057 13.36L11.1445 8.59887C10.8842 8.33852 10.4621 8.33852 10.2017 8.59887L8.59894 10.2016C8.33859 10.462 8.33859 10.8841 8.59894 11.1445L13.3601 15.9056C13.4122 15.9577 13.4122 16.0421 13.3601 16.0942L8.59889 20.8554C8.33854 21.1157 8.33854 21.5378 8.59889 21.7982L10.2017 23.401Z"/>',
}
const ZEST = {
  undo: '<path d="M10.707 4.293a1 1 0 0 1 0 1.414L8.414 8H13.5a5.5 5.5 0 1 1 0 11H11a1 1 0 1 1 0-2h2.5a3.5 3.5 0 1 0 0-7H8.414l2.293 2.293a1 1 0 0 1-1.414 1.414l-4-4a1 1 0 0 1 0-1.414l4-4a1 1 0 0 1 1.414 0z" fill-rule="evenodd"/>',
  minus: '<path d="M4 12a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1z" fill-rule="evenodd"/>',
  redo: '<path d="M13.293 4.293a1 1 0 0 1 1.414 0l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414-1.414L15.586 10H10.5a3.5 3.5 0 1 0 0 7H13a1 1 0 1 1 0 2h-2.5a5.5 5.5 0 1 1 0-11h5.086l-2.293-2.293a1 1 0 0 1 0-1.414z" fill-rule="evenodd"/>',
  warning: '<path d="M13.752 2.111c-.76-1.381-2.745-1.381-3.504 0L.938 19.036C.207 20.37 1.17 22 2.692 22H21.31c1.521 0 2.485-1.63 1.752-2.964L13.752 2.111zM12 3.075L21.31 20H2.69l9.31-16.925zM12 8a1 1 0 0 1 1 1v5a1 1 0 0 1-2 0V9a1 1 0 0 1 1-1zm1.25 9.75a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0z" fill-rule="evenodd"/>',
}
const chevron = (cls = '', up = false) => el('span', { class: `ge-chev ${cls}`, 'aria-hidden': 'true', html: `<svg viewBox="0 0 32 32" class="ge-icon ge-vs">${up ? VS.chevUp : VS.chevDown}</svg>` })
// Grille's warning icon (24 grid, currentColor).
const warnIcon = () => el('span', { class: 'ge-warn', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" class="ge-icon ge-vs">${ZEST.warning}</svg>` })
// Grille button as plain markup: its hover styles key off react-aria data attributes, so mock.css adds :hover fallbacks.
function btn(label, { variant, size = 'sm', icon: isIcon, ...attrs } = {}) {
  return el('button', { type: 'button', class: 'ui-button', 'data-variant': variant, 'data-size': size === 'md' ? undefined : size, 'data-icon': isIcon, ...attrs }, label)
}
const opts = { backBoxed: true, testPrimary: false, split: false, zonesPlain: false, refused: 'tip', newDots: true }
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
    const rows = (current ?? []).map((s, i, all) => el('div', { class: 'gn-stop' },
      el('i', { class: 'gn-swatch', style: `background:${s.color}` }), el('span', {}, s.color), el('b', {}, s.pos.toFixed(2)),
      btn(vsicon(ZEST.minus, 24), { icon: true, 'aria-label': `Remove stop ${i + 1}`, title: all.length <= 2 ? 'A gradient needs at least 2 stops' : 'Remove stop', disabled: all.length <= 2 })))
    return el('div', { class: 'gn-param' }, el('div', { class: 'gn-param-row' }, paramLabel(p)), el('div', { class: 'gn-gradient', style: `background:linear-gradient(to right,${stops})` }),
      rows, btn([vsicon(VS.add), 'Add stop'], { variant: 'secondary', class: 'gn-addstop' }))
  }
  const min = p.min ?? 0, max = p.max ?? 1, number = current === null || current === undefined || current < min ? min : current
  const percent = max > min ? ((number - min) / (max - min)) * 100 : 0
  return el('div', { class: 'gn-param' },
    el('div', { class: 'gn-param-row' }, paramLabel(p), el('b', {}, `${+Number(number).toFixed(2)}${p.unit ? ` ${p.unit}` : ''}`)),
    el('div', { class: 'ge-slider', role: 'slider', 'aria-label': paramLabel(p), 'aria-valuemin': String(min), 'aria-valuemax': String(max), 'aria-valuenow': String(number), style: `--slider-frac:${percent / 100}` }, el('i', {})))
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
      class: `gn${n.id === state.selected ? ' sel' : ''}${bad ? ' bad' : ''}${n.fresh ? ' fresh' : ''}`, 'data-node': n.id, style: `left:${n.x}px;top:${n.y}px`,
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
    const cls = [wireClass(a.type), state.wire === i ? 'sel' : ''].filter(Boolean).join(' ')
    return `<path d="${d}" stroke="${color}"${cls ? ` class="${cls}"` : ''}/><path d="${d}" class="hit" data-wire="${i}"/>`
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
  drawMinimap()
}

// Minimap (Aurora-daaa.36): bottom-left, directly above the zoom button, so the View menu opens above both.
function drawMinimap() {
  const map = $('minimap')
  map.hidden = !state.minimap
  if (!state.minimap) return
  const boxes = state.nodes.map((n) => { const b = document.querySelector(`[data-node="${CSS.escape(n.id)}"]`); return { x: n.x, y: n.y, w: b?.offsetWidth ?? 200, h: b?.offsetHeight ?? 80 } })
  const { x, y, k } = state.view, r = $('canvas').getBoundingClientRect()
  const view = { x: -x / k, y: -y / k, w: r.width / k, h: r.height / k }
  const all = [...boxes, view]
  const left = Math.min(...all.map((b) => b.x)), top = Math.min(...all.map((b) => b.y))
  const w = Math.max(...all.map((b) => b.x + b.w)) - left, h = Math.max(...all.map((b) => b.y + b.h)) - top
  const rect = (b, cls) => `<rect class="${cls}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6"/>`
  map.innerHTML = `<svg viewBox="${left - 20} ${top - 20} ${w + 40} ${h + 40}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${boxes.map((b) => rect(b, 'mm-node')).join('')}${rect(view, 'mm-view')}</svg>`
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
  const count = probN()
  const problems = state.problems ? btn([warnIcon(), `${count} ${count === 1 ? 'problem' : 'problems'}`], { class: 'ui-button ge-problems', 'data-act': 'problems', 'aria-haspopup': 'dialog' }) : null
  const blocked = state.problems || Boolean(state.banner?.blocking)
  const testPart = opts.split ? splitTest(blocked) : state.testing
    ? [el('span', { class: 'ge-countdown' }, 'On the lights, reverts in 0:24'), btn('Revert', { 'data-act': 'revert' })]
    : [btn(state.other ? 'Take over the lights' : 'Test on lights', { variant: opts.testPrimary ? 'primary' : undefined, class: `ui-button${opts.testPrimary ? ' ge-primary' : ''}`, 'data-act': 'test', disabled: blocked, title: 'Show this graph on the real lights for a while, then put them back' })]
  const ghost = opts.backBoxed ? '' : ' ge-ghost'
  fill(bar, [
    btn([vsicon(VS.back, 32, 'ge-vs-back'), 'Dashboard'], { class: `ui-button${ghost}`, 'data-act': 'back' }),
    el('span', { class: 'ge-sep' }),
    // Stage 6 frames: the unsaved mark is the Open ▸ dot, next to the name inside the title button, instead of the word.
    btn([state.s6 ? state.title : 'Screen colors', state.s6 && state.unsaved ? [el('i', { class: 's6-dot', 'aria-hidden': 'true' }), el('span', { class: 'ui-visually-hidden' }, ', unsaved changes')] : null, chevron('cc-chev')], { class: `ui-button ge-title${ghost}`, 'data-act': 'title', 'aria-haspopup': 'dialog' }),
    state.unsaved && !state.s6 ? el('span', { class: 'ge-unsaved' }, 'Unsaved') : null,
    el('span', { class: 'ge-spacer' }),
    state.changed ? el('span', { class: 'ge-unsaved' }, 'Edited since the test') : null,
    problems,
    opts.split ? null : el('span', { class: `ge-status${state.status?.strong ? ' strong' : ''}`, role: 'status' },
      el('span', { class: 'ge-dot' }), state.status?.text ?? (state.problems ? 'Preview paused' : 'Live preview'),
      state.status?.action ? btn(state.status.action.label, { 'data-act': state.status.action.act }) : null),
    btn(vsicon(ZEST.undo, 24), { icon: true, 'aria-label': 'Undo', title: 'Undo (Ctrl+Z)', 'data-act': 'toast-undo' }),
    btn(vsicon(ZEST.redo, 24), { icon: true, 'aria-label': 'Redo', title: 'Redo (Ctrl+Shift+Z)', disabled: true }),
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
    return el('span', { class: 'ge-split' }, btn([vsicon(VS.stop), el('span', { class: 'ge-countdown-in' }, label)], { variant: v, class: cls, 'data-act': 'revert', title: 'Stop and put the lights back' }),
      btn(chevron('cc-chev'), { variant: v, class: `${cls} ge-split-caret`, icon: true, 'aria-label': 'Test mode', 'aria-haspopup': 'menu', 'data-act': 'test-menu' }))
  }
  const label = state.other ? 'Take over' : 'Test'
  return el('span', { class: 'ge-split', title: reason }, btn([vsicon(VS.play), label], { variant: v, class: cls, 'data-act': 'test', disabled: blocked, title: reason ?? (test.mode === 'once' ? 'Show this graph on the real lights for 15 seconds' : 'Show this graph on the real lights until you stop') }),
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

// Zones as plain cells, 8 per row: one output is canonical, so one block. No screen mapping, so overlapping
// regions (every zone starts full-screen) hide nothing.
const ZONES = ['#d4714f', '#c85f6d', '#8e5fb0', '#4d6bc9', '#3f9a8a', '#38c9a8', '#e5ad3c', '#d4714f', '#c85f6d', '#8e5fb0']
const COLS = 8

function zoneRects() {
  return { rects: ZONES.map((color, i) => ({ x: i % COLS, y: Math.floor(i / COLS), w: 1, h: 1, color })), rows: Math.ceil(ZONES.length / COLS) }
}

function zonesIsland() {
  const { rects, rows } = zoneRects()
  const body = state.zonesOpen ? el('div', { class: 'ge-zmap', style: `--rows:${rows}` }, rects.map((r) => el('i', { style: `--x:${r.x};--y:${r.y};--w:${r.w};--h:${r.h};background:${r.color}` }))) : null
  return el('div', { class: `ge-zones ge-zones-v${state.zonesOpen ? ' open' : ''}${state.zonesLarge && !opts.zonesPlain ? ' large' : ''}${state.problems ? ' stale' : ''}` },
    el('div', { class: 'ge-zbar' },
      el('button', { type: 'button', class: 'ge-zones-head', 'data-act': 'zones', 'aria-expanded': state.zonesOpen, 'aria-label': state.zonesOpen ? 'Hide zones' : 'Show zones' }, 'Zones', chevron('cc-chev', state.zonesOpen)),
      state.zonesOpen && !opts.zonesPlain ? el('button', { type: 'button', class: 'ge-zsize', 'data-act': 'zsize', 'aria-label': state.zonesLarge ? 'Smaller zone map' : 'Larger zone map', title: state.zonesLarge ? 'Smaller' : 'Larger' }, vsicon(state.zonesLarge ? VS.collapse : VS.expand)) : null),
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
  $('canvas').classList.remove('drawer-open', 'drawer-full')
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
      el('span', { class: 'ge-item-main' }, item.checked === undefined ? null : el('span', { class: 'tick' }, item.checked ? '✓' : ''), item.trunc ? el('span', { class: 's6-trunc' }, item.label) : item.label,
        // Stage 6 (Aurora-u68h.4): an effect with a kept copy. The dot is the only visible mark; the reason is screen-reader text.
        item.dot ? [el('i', { class: 's6-dot', 'aria-hidden': 'true' }), el('span', { class: 'ui-visually-hidden' }, ', unsaved changes')] : null),
      item.sub ? chevron('ge-arrow cc-chev') : item.key ? el('kbd', {}, item.key) : null)
    if (item.trunc) truncTip(row)
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
  const r = $('view-btn').getBoundingClientRect(), top = $('view-btn').closest('.ge-island').getBoundingClientRect().top
  const zoom = (factor) => { state.view.k = Math.min(2, Math.max(0.2, state.view.k * factor)); applyView() }
  const pop = menu([
    { label: 'Fit view', key: 'F', run: fit },
    { label: 'Zoom in', key: 'Ctrl++', run: () => zoom(1.2) },
    { label: 'Zoom out', key: 'Ctrl+-', run: () => zoom(1 / 1.2) },
    '-',
    { label: 'Minimap', checked: state.minimap, run: () => { state.minimap = !state.minimap; drawMinimap() } },
  ], r.left, top)
  pop.style.top = `${top - pop.offsetHeight - 6}px`
}

function openProblems() {
  closePopups()
  const r = document.querySelector('.ge-problems').getBoundingClientRect()
  const row = (title, text) => el('button', { type: 'button', class: 'ge-prob', onclick: () => { closePopups(); state.selected = 'zones_hue'; drawNodes() } }, el('b', {}, title), text)
  const rows = [row('Sample zones', 'The image input is not connected.'), row('Sample zones', 'Choose an output for this node.')]
  place(el('div', { class: 'ge-pop ge-probpop', role: 'dialog', 'aria-label': 'Problems' },
    state.wholeGraph ? el('div', { class: 'ge-prob whole' }, el('b', {}, 'Whole graph'), 'Nothing sends to the lights yet. Add an Output node and connect a Frame to it.', el('span', { class: 'ge-prob-act' }, btn('Add node…', { 'data-act': 'add' }))) : null,
    rows.slice(0, state.problemCount ?? rows.length)), r.left, r.bottom + 6)
}

// A write refused for problems (owner, 2026-11-12): one ping, on the problems chip only, with the popover left closed. The
// message comes first, a beat, then the ping, so the ping reads as the answer to it. Default: the message is a callout on
// the chip's left (the toast was too far from the chip). Focus moves to the chip so Enter opens the list. The Decisions
// switch cycles tooltip / toast / ping only.
const PING_BEAT_MS = 1450
const REFUSED_TIP_MS = 4200
// Input modality, as React Aria's useFocusVisible tracks it: the ring shows on a moved focus only after keyboard use.
let keyboardMode = false
document.addEventListener('keydown', (e) => { if (!e.metaKey && !e.ctrlKey && !e.altKey) keyboardMode = true }, true)
document.addEventListener('pointerdown', () => { keyboardMode = false }, true)
let pingTimer
function blockedWrite() {
  const n = probN()
  const chip = document.querySelector('.ge-problems')
  chip?.focus()
  if (chip && !keyboardMode) {
    chip.classList.add('s6-quiet')
    chip.addEventListener('blur', () => chip.classList.remove('s6-quiet'), { once: true })
  }
  clearTimeout(pingTimer)
  const ping = () => {
    if (!chip) return
    chip.classList.remove('s6-ping')
    // Two pulses that end as the callout closes.
    chip.style.setProperty('--s6-pulse', `${(REFUSED_TIP_MS - PING_BEAT_MS) / 2}ms`)
    void chip.offsetWidth
    chip.classList.add('s6-ping')
    chip.addEventListener('animationend', () => chip.classList.remove('s6-ping'), { once: true })
  }
  const text = `Couldn't save. Fix ${n} ${n === 1 ? 'problem' : 'problems'} first.`
  if (opts.refused === 'none') { ping(); return }
  if (opts.refused === 'toast') toast(text)
  else refusedTip(chip, text)
  pingTimer = setTimeout(ping, PING_BEAT_MS)
}

// The message as a callout on the chip's left, tooltip-sized, with the problem node's warning border. It closes by itself
// with the toast's timing, or with any click or Escape (closePopups). role=status so a screen reader hears it.
let tipTimer
function refusedTip(chip, text) {
  layer.querySelector('.s6-refused')?.remove()
  if (!chip) return
  const r = chip.getBoundingClientRect()
  const tip = el('div', { class: 'ui-tooltip s6-refused', role: 'status' }, text)
  layer.append(tip)
  tip.style.left = `${r.left - 10 - tip.offsetWidth}px`
  tip.style.top = `${r.top + r.height / 2 - tip.offsetHeight / 2}px`
  clearTimeout(tipTimer)
  tipTimer = setTimeout(() => tip.remove(), REFUSED_TIP_MS)
}

// Stage 6 Open path: the effects Open lists, with each one's kept copy and its problems. The current effect is left out of
// Open, as openGroups does. Opening an effect restores its kept copy silently (6b): the title dot and the chip are the
// only signs, with no toast and no ping. Leaving an effect with unsaved edits turns them into its kept copy.
const freshEffects = () => [
  { id: 'slow', title: 'Slow rainbow', group: 'Not saved yet', kept: true, problems: 0 },
  { id: 'new', title: 'New effect', group: 'Not saved yet', kept: true, problems: 2 },
  { id: 'sunset', title: 'Sunset', group: 'Custom', kept: true, problems: 0 },
  { id: 'corner', title: 'Candle corner', group: 'Custom', kept: false, problems: 0 },
  { id: 'lamp', title: 'Warm desk lamp', group: 'Custom', kept: true, problems: 1 },
  { id: 'long', title: 'Reading corner, warm white after sunset', group: 'Custom', kept: false, problems: 0 },
  { id: 'screen', title: 'Screen colors', group: 'Built-in', kept: false, problems: 0 },
  { id: 'music', title: 'Music pulse', group: 'Built-in', kept: false, problems: 0 },
  { id: 'candle', title: 'Candle', group: 'Built-in', kept: false, problems: 0 },
]
let effects6 = freshEffects()

function openEffect(id) {
  const cur = effects6.find((e) => e.id === state.effectId)
  if (cur) Object.assign(cur, { kept: state.unsaved, problems: state.problems ? probN() : 0 })
  const next = effects6.find((e) => e.id === id)
  Object.assign(state, { effectId: id, title: next.title, unsaved: next.kept, problems: next.problems > 0, problemCount: next.problems || null, selected: null })
  drawBar(); drawNodes(); drawIslands()
}

// Grille-cou's tooltipOnlyWhenTruncated, drawn: a row whose title is cut off shows the whole title on hover (after a
// delay) or on keyboard focus, beside the row. A title that fits shows nothing.
function truncTip(row) {
  let timer, tip
  const show = () => {
    const label = row.querySelector('.s6-trunc')
    if (!label || label.scrollWidth <= label.clientWidth || tip) return
    const r = row.getBoundingClientRect()
    tip = el('div', { class: 'ui-tooltip s6-tip', role: 'tooltip' }, label.textContent)
    layer.append(tip)
    tip.style.left = `${r.right + 8}px`
    tip.style.top = `${r.top + r.height / 2 - tip.offsetHeight / 2}px`
  }
  const hide = () => { clearTimeout(timer); tip?.remove(); tip = null }
  row.addEventListener('mouseenter', () => { clearTimeout(timer); timer = setTimeout(show, 500) })
  row.addEventListener('mouseleave', hide)
  row.addEventListener('focus', () => { if (keyboardMode) show() })
  row.addEventListener('blur', hide)
}

// Stage 6 proposal (owner, 2026-11-12): the title menu as the editor has it (TitleMenu.tsx after Aurora-iryq), with Save and
// apply always enabled. With problems it refuses with the chip callout and ping (blockedWrite) instead of being a disabled
// row with a reason under it: React Aria's Menu skips disabled items on arrow keys, so that reason never reaches a keyboard user.
function openTitleS6({ focus = null, openSub = false } = {}) {
  closePopups()
  const anchor = document.querySelector('.ge-title').getBoundingClientRect()
  const name = state.title
  const openList = () => {
    const out = []
    for (const group of ['Not saved yet', 'Custom', 'Built-in']) {
      const items = effects6.filter((e) => e.group === group && e.id !== state.effectId)
      if (!items.length) continue
      out.push({ head: group }, ...items.map((e) => ({ label: e.title, trunc: true, dot: e.kept && (opts.newDots || group !== 'Not saved yet'), run: () => openEffect(e.id) })))
    }
    return out
  }
  const starts = () => [{ head: 'Start from' }, ...['Empty', 'Screen colors', 'Music pulse', 'Candle'].map((label) => ({ label, run: () => toast(`New effect from ${label}`) }))]
  const saved = (text) => { state.unsaved = false; const cur = effects6.find((e) => e.id === state.effectId); if (cur) cur.kept = false; drawBar(); toast(text) }
  const pop = menu([
    { label: 'Save', key: 'Ctrl+S', run: () => {
      if (state.problems) { toast(`Changes kept in this browser. Fix ${probN()} problems to save them to ${name}.`); return }
      saved(`Saved as ${name}`)
    } },
    { label: 'Save as new', run: () => { if (state.problems) blockedWrite(); else saved(`Saved as ${name} copy`) } },
    { label: 'Save and apply', run: () => { if (state.problems) blockedWrite(); else saved(`Saved and live as ${name}`) } },
    { label: 'Rename', run: () => toast('Opens the Rename dialog') },
    '-',
    { label: 'New', sub: starts },
    { label: 'Open', sub: openList },
  ], anchor.left, anchor.bottom + 6)
  pop.classList.add('s6-titlemenu')
  const rows = [...pop.querySelectorAll('.ge-item')]
  const start = rows.find((r) => r.textContent.startsWith(focus ?? (openSub ? 'Open' : 'Save'))) ?? rows[0]
  start.focus()
  if (openSub) { start.dispatchEvent(new MouseEvent('mouseenter')); layer.querySelector('.ge-menu[data-sub] .ge-item')?.focus() }
}

function drawer(title, sub, body) {
  closePopups()
  const r = $('canvas').getBoundingClientRect()
  const pop = el('aside', { class: 'ge-pop ge-drawer', 'aria-label': title, style: `--drawer-top:${r.top}px` },
    el('div', { class: 'ge-drawer-head' }, title,
      btn([vsicon(VS.expand), vsicon(VS.collapse)], { icon: true, class: 'ui-button ge-drawer-toggle', 'aria-label': 'Full height', title: 'Full height', 'aria-pressed': 'false', onclick: (e) => {
        const full = pop.toggleAttribute('data-expanded')
        $('canvas').classList.toggle('drawer-full', full)
        e.currentTarget.setAttribute('aria-label', full ? 'Half height' : 'Full height')
        e.currentTarget.title = full ? 'Half height' : 'Full height'
        e.currentTarget.setAttribute('aria-pressed', String(full))
      } }),
      btn(vsicon(VS.close), { icon: true, 'aria-label': 'Close', onclick: closePopups })),
    sub ? el('p', { class: 'ge-drawer-sub' }, sub) : null,
    el('div', { class: 'ge-drawer-body ae-scroll' }, body))
  layer.append(pop)
  $('canvas').classList.add('drawer-open')
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
  return el('label', { class: 'ae-search' }, vsicon(VS.search), input)
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
      el('div', { class: 'ae-sheet-head' }, 'Add node', btn(vsicon(VS.close), { icon: true, 'aria-label': 'Close', onclick: closePopups })),
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
// Aurora-0veq: a Float wire dropped on an Angle input gets a Float to Angle node, wired both sides, clear of both nodes.
// Undo would treat the drop as one step: the wire and the node it brought go together, the Float wire is back as it was.
// Gradient stop rows: the Zest minus removes a stop (web/ui/icons/minus.svg), off at the 2-stop minimum.
function gradientStops() {
  state.nodes = [
    { id: 'wobble', type: 'lfo', params: {}, x: 0, y: 40 },
    { id: 'ramp', type: 'color.fromGradient', params: { gradient: [{ color: '#1b3cff', pos: 0 }, { color: '#ff3cac', pos: 0.5 }, { color: '#ffd23f', pos: 1 }] }, x: 280, y: 40 },
  ]
  state.edges = [{ from: 'wobble.value', to: 'ramp.t' }]
  state.selected = 'ramp'
  drawNodes(); fit()
}
function autoInsert() {
  state.nodes = [
    { id: 'wobble', type: 'lfo', params: {}, x: 0, y: 40 },
    { id: 'to_angle', type: 'angle.fromFloat', params: {}, x: 280, y: 40, fresh: true },
    { id: 'hue_color', type: 'color.fromHSV', params: {}, x: 560, y: 40 },
  ]
  state.edges = [{ from: 'wobble.value', to: 'to_angle.value' }, { from: 'to_angle.angle', to: 'hue_color.hue' }]
  state.selected = 'to_angle'
  state.unsaved = true
  drawNodes(); drawBar(); fit()
  toast('Dropped a Float on an Angle input: Float to Angle inserted. Undo removes both the node and its wire in one step.')
}

// --- Stage 6 board (Aurora-u68h.1) ------------------------------------------------------------------------------
// A static board, not the editor: where each message lives once the banner under the bar is retired. Each section
// names the bead that builds it. Wording marked "drafted" is new in this frame, for the owner to confirm.
const W = (paths) => el('span', { class: 's6-warn', 'aria-hidden': 'true', html: `<svg viewBox="0 0 24 24" class="ge-icon ge-vs">${paths}</svg>` })
const warnSvg = () => W(ZEST.warning)
// el() with a class and an optional attrs object first among the kids.
const s6 = (tag, cls, ...kids) => {
  const attrs = kids[0] && kids[0].constructor === Object ? kids.shift() : {}
  return el(tag, { ...attrs, class: cls }, ...kids)
}
const s6section = (id, bead, title, lead, ...body) => s6('section', 's6-sec', el('h2', { id }, title, el('code', {}, bead)), s6('p', 's6-lead', lead), ...body)
const s6panel = (label, ...body) => s6('figure', 's6-panel', s6('figcaption', '', label), ...body)
const s6note = (text) => s6('p', 's6-note', text)

// A bar like the editor's, with the right group varying. Title and Undo/Redo as in drawBar.
function s6bar({ title = 'Screen colors', unsaved = false, right }) {
  return s6('div', 's6-bar ge-bar',
    btn([vsicon(VS.back, 32, 'ge-vs-back'), 'Dashboard'], { class: 'ui-button' }), s6('span', 'ge-sep'),
    btn([title, chevron('cc-chev')], { class: 'ui-button ge-title' }), unsaved ? s6('span', 'ge-unsaved', 'Unsaved') : null,
    s6('span', 'ge-spacer'),
    btn(vsicon(ZEST.undo, 24), { icon: true, 'aria-label': 'Undo' }), btn(vsicon(ZEST.redo, 24), { icon: true, 'aria-label': 'Redo', disabled: true }),
    s6('span', 'ge-sep'), right ?? null)
}

// The Test split button as SplitTestButton.tsx labels it (the label is always the next move), with the 6c options:
// `outline` is option A (the problem node's dashed border), `label` is option B (what happened / what's next).
function s6test({ label = 'Test (15s)', outline = false, hot = false } = {}) {
  const cls = `ui-button ge-split-part${hot ? ' s6-hot' : ''}`
  return s6('span', `ge-split s6-testwrap${outline ? ' s6-outlined' : ''}`,
    btn([vsicon(VS.play), label], { class: cls }),
    btn(chevron('cc-chev'), { class: `${cls} ge-split-caret`, icon: true, 'aria-label': 'Test mode', 'aria-haspopup': 'menu' }))
}

// ---- 6a: shell rows -------------------------------------------------------------------------------------------
// Row markup and look are web/ui/shell.js _renderBannerRow and shell.css, on Grille tokens: a 2px bordered panel, glyph
// (currentColor, as .warn-glyph) + text, a secondary Retry unless the row says otherwise, a dismiss X while the old setup runs.
const ROWS = {
  reload: { text: "Couldn't apply settings: no output is paired.", action: 'Retry', dismiss: true },
  draft: { text: "Draft not sent. The preview isn't showing your last edit." },
}
const shellRow = ({ text, action, dismiss }) => s6('div', 's6-row',
  s6('div', 's6-row-content', s6('p', 's6-row-text', warnSvg(), ' ', text), action ? s6('div', 's6-row-actions', btn(action, { variant: 'secondary' })) : null),
  dismiss ? s6('button', 's6-row-x', { type: 'button', 'aria-label': 'Dismiss' }, '×') : null)
// #shell-banner-slot: the first thing on the page, full width, above the bar; the rows' column is 640px, centred.
const shellBand = (...kids) => s6('div', 's6-band', s6('div', 's6-band-inner', ...kids))
const summary = (n, open) => s6('button', `s6-summary${open ? ' s6-summary-up' : ''}`, { type: 'button' }, open ? 'Show less ' : [warnSvg(), ` ${n} problems `], chevron('cc-chev', open))

function shellSection() {
  const page = (band, tail = 'The graph canvas') => [band, s6bar({ right: s6test() }), s6('div', 's6-canvas', tail)]
  const takeover = s6('div', 's6-stage',
    s6bar({ right: s6test() }), s6('div', 's6-canvas s6-canvas-tall', 'The graph canvas'),
    s6('div', 's6-takeover', s6('div', 's6-takeover-scrim'), s6('div', 's6-takeover-panel', s6('h2', '', 'Aurora has stopped'))))
  return s6section('s6-shell', 'Aurora-s1t7.9 (6a)', 'Error shell, as on the Dashboard',
    "The editor reuses the Dashboard's shell exactly: the same slot, rows and copy. The slot is the first thing on the page, above the bar, full width and sticky, with the rows in a 640 px column.",
    s6('div', 's6-grid',
      s6panel('One row: reload failed (shell.js wording; replaces the editor\'s own "Reload: ...")', ...page(shellBand(shellRow(ROWS.reload)))),
      s6panel('One row: Draft not sent (editor-supplied, same markup; draft copy)', ...page(shellBand(shellRow(ROWS.draft)))),
      s6panel('Two rows, collapsed (shell.js default)', ...page(shellBand(summary(2, false)))),
      s6panel('Same, expanded with Show less', ...page(shellBand(shellRow(ROWS.reload), shellRow(ROWS.draft), summary(2, true)))),
      s6panel('Aurora unreachable: the Dashboard takeover over the editor (heading only, no button; replaces the old Cannot reach and Lost contact rows)', takeover)),
    s6note('Same component, slot and rows as the Dashboard. Host-state rows show on both pages and dismiss clears both (POST /api/state/dismiss). Draft not sent is editor-only and clears when a later send succeeds. Draft copy: "Draft not sent. The preview isn\'t showing your last edit." Everything else is shell.js wording unchanged.'))
}

// ---- 6c: Test button outcome, options A, B and A + B ---------------------------------------------------------
// The reason is the tooltip and the caret menu's first line in every option. Wording is describeTest (graph/lightTest.ts).
function testCase({ title, reason, label, outline }) {
  const tip = s6('div', 'ui-tooltip s6-static', reason)
  const pop = s6('div', 'ui-popover s6-static s6-testmenu',
    s6('div', 'ui-menu', s6('div', 's6-menu-note', reason), s6('div', 'ui-menu-separator'),
      s6('div', 'ui-menu-item', s6('span', 'ui-menu-check', '✓'), 'Once (15 s)'), s6('div', 'ui-menu-item', s6('span', 'ui-menu-check'), 'Live (until stopped)')))
  return s6panel(title,
    s6bar({ right: s6test({ label, outline }) }),
    s6('div', 's6-testrow',
      s6('div', 's6-testcol', s6('small', '', 'At rest'), s6test()),
      s6('div', 's6-testcol', s6('small', '', 'Tooltip (hover or focus)'), s6test({ label, outline }), tip),
      s6('div', 's6-testcol', s6('small', '', 'Caret menu open'), s6test({ label, outline }), pop)))
}

const TAKEN = 'Test ended: an agent took the lights'
const STOPPED = 'Test stopped from the Dashboard. The lights are back'

function testOption(name, lead, taken, ended) {
  return s6('div', 's6-option',
    s6('h3', 's6-option-name', name), s6('p', 's6-lead', lead),
    s6('div', 's6-grid',
      testCase({ title: 'Another session took the lights', reason: TAKEN, ...taken }),
      testCase({ title: 'Test just ended: stopped from the Dashboard', reason: STOPPED, ...ended })))
}

function testSection() {
  return s6section('s6-test', 'Aurora-u68h.3 (6c)', 'Test button: a test outcome the user did not cause',
    'Three options for the owner to pick from. No banner, no toast, no amber, no corner glyph. In each, the reason is the button\'s tooltip and the first line of the caret menu; the full editor bar and the button at rest are shown for comparison.',
    testOption('A. Outline', 'The Test split button gets the same dashed outline a problem node has (monochrome). The label does not change. Clears on the next test, Save or edit.',
      { outline: true }, { outline: true }),
    testOption('B. Label', 'The label says what happened or what is next. While another session holds the lights it reads Take over (the existing state); when a test just ended it reads Test ended (draft) until the next action. No outline.',
      { label: 'Take over' }, { label: 'Test ended' }),
    testOption('A + B', 'Take over while another session holds the lights; the dashed outline (A) for a test that just ended, with the label back at Test (15s).',
      { label: 'Take over' }, { outline: true }),
    s6note('Wording is describeTest (graph/lightTest.ts) unchanged; it says "another editor tab or window" when a tab took the lights. Drafted: the dashed outline, and the Test ended label. The outline is .gn.bad\'s first rule (1px dashed, text colour), as web/graph-editor editor.css .aurora-node-problem.'))
}

// ---- 6b: changed-saved-effect prompt ---------------------------------------------------------------------------
function promptModal({ title, body, label }) {
  return s6panel(label, s6('div', 'ui-modal-overlay s6-overlay', s6('div', 'ui-modal', { role: 'alertdialog', 'aria-label': title },
    s6('div', 'ui-dialog', s6('h3', 's6-modal-title', title), body ? s6('p', 's6-modal-body', body) : null,
      s6('div', 's6-modal-actions', btn('Load saved', { size: 'md' }), btn('Keep my edits', { size: 'md', variant: 'primary', class: 'ui-button s6-focus' }))))))
}

function promptSection() {
  return s6section('s6-prompt', 'Aurora-u68h.2 (6b)', 'Prompt when the saved effect changed',
    'Shown as a Grille Modal when the effect opens, only when the saved effect changed since the kept copy was made (an MCP apply, a Save in another tab). Nothing loads until the user picks. Keep my edits has default focus and Escape; Load saved discards the kept copy with an Undo toast (6g).',
    s6('div', 's6-grid',
      promptModal({ label: 'A: Chosen by the owner, title and one line', title: 'Sunset has a newer saved version', body: 'Your unsaved edits are out of date.' }),
      promptModal({ label: 'B: Not chosen, title only', title: 'Newer version saved' })),
    s6note('The ring on Keep my edits is the default focus. The owner picked A; B (not chosen) drops the effect name and the explanation. Button alignment is still an open owner question and is not changed here.'))
}

function drawBoard(which) {
  const sections = { shell: shellSection, test: testSection, prompt: promptSection }
  const keys = which === 'all' ? Object.keys(sections) : [which]
  $('board').replaceChildren(
    s6('header', 's6-head', s6('h1', '', 'Stage 6: where each editor message lives'), s6('p', '', 'Frame for Aurora-u68h.1. The banner under the bar is gone in every state below. The title menu and Open path are the live frames #s6-menu, #s6-openpath and #s6-apply. The problems chip and the toast are unchanged and not drawn. Static: nothing here is wired.')),
    ...keys.map((k) => sections[k]()))
}

const FRAMES = [
  ['Layout', [['rest', 'At rest', () => {}], ['title', 'Title menu', openTitle], ['view', 'View menu', openView], ['minimap', 'Minimap on', () => { state.minimap = true; drawMinimap(); openView() }], ['gradient', 'Gradient stops', gradientStops]]],
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
  ['Stage 6', [['s6', 'All three', () => drawBoard('all')], ['s6-shell', 'Shell rows', () => drawBoard('shell')], ['s6-test', 'Test button options', () => drawBoard('test')], ['s6-prompt', 'Newer saved version', () => drawBoard('prompt')],
    ['s6-apply', 'Save and apply, problems', () => { Object.assign(state, { s6: true, problems: true, unsaved: true }); drawBar(); drawIslands(); drawNodes(); openTitleS6({ focus: 'Save and apply' }) }],
    ['s6-menu', 'Title menu, no problems', () => { Object.assign(state, { s6: true, unsaved: true }); drawBar(); openTitleS6() }],
    ['s6-openpath', 'Open path', () => { Object.assign(state, { s6: true, unsaved: true }); drawBar(); openTitleS6({ openSub: true }) }]]],
  ['States', [['testing', 'Testing', () => { state.unsaved = true; startTest('once', 12, false) }], ['testing-live', 'Testing live', () => { state.unsaved = true; startTest('live') }], ['problems', 'Problems', () => { state.problems = true; drawBar(); drawIslands(); drawNodes(); openProblems() }], ['refused', 'Refused wire', () => toast('Those ports do not match: an Image cannot connect to a Frame')], ['refused-float', 'Refused: Float to Angle', () => toast('A Float cannot connect to an Angle. Add a Float to Angle node between them.')], ['autoinsert', 'Auto-insert converter', autoInsert]]],
]

function drawFrames(current) {
  const toggle = (label, on, key) => el('a', { href: '#', role: 'switch', 'aria-checked': String(on), class: on ? 'on' : undefined, onclick: (e) => { e.preventDefault(); e.stopPropagation(); opts[key] = !opts[key]; showFrame() } }, label)
  $('frames').replaceChildren(...FRAMES.flatMap(([group, frames]) => [el('b', {}, group), ...frames.map(([id, label]) => el('a', { href: `#${id}`, class: id === current ? 'on' : undefined }, label))]),
    el('b', {}, 'Decisions'),
    toggle('Back link and title boxed', opts.backBoxed, 'backBoxed'),
    toggle('Test on lights primary', opts.testPrimary, 'testPrimary'),
    toggle('Test split button + Zones island', opts.split, 'split'),
    toggle('Zones island: no resize', opts.zonesPlain, 'zonesPlain'),
    el('a', { href: '#', role: 'button', class: 'on', onclick: (e) => { e.preventDefault(); e.stopPropagation(); const modes = ['tip', 'toast', 'none']; opts.refused = modes[(modes.indexOf(opts.refused) + 1) % modes.length]; showFrame() } },
      `Refused save: ${{ tip: 'tooltip, then ping', toast: 'toast, then ping', none: 'ping only' }[opts.refused]}`),
    toggle('Dots in Not saved yet', opts.newDots, 'newDots'),
    el('b', {}, 'Narrow (new window)'),
    ...[['Dock 400x800', 400, 800], ['Side 700x900', 700, 900], ['Side 1000x600', 1000, 600]].map(([label, w, h]) => el('a', { href: '#controls', onclick: (e) => { e.preventDefault(); open(`${location.pathname}${location.search}#controls`, '_blank', `popup,width=${w},height=${h}`) } }, label)))
}

function showFrame() {
  const id = location.hash.slice(1) || 'rest'
  closePopups()
  stopTimer()
  $('toast').hidden = true
  Object.assign(test, { mode: 'once', left: 12 })
  Object.assign(state, { minimap: false, zonesLarge: false, testing: false, problems: false, unsaved: false, selected: null, wire: null, banner: null, status: null, other: false, changed: false, wholeGraph: false, s6: false, title: 'Screen colors', effectId: 'screen', problemCount: null })
  effects6 = freshEffects()
  layoutGraph(); state.edges = GRAPH.edges.map(([from, to]) => ({ from, to }))
  drawNodes(); drawBar(); drawBanner(); drawIslands(); fit(); drawFrames(id)
  const board = ['s6', 's6-shell', 's6-test', 's6-prompt'].includes(id)
  document.body.classList.toggle('board-on', board)
  $('board').hidden = !board
  FRAMES.flatMap(([, frames]) => frames).find(([key]) => key === id)?.[2]()
}

const ACTS = {
  add: () => openAdd('browser'), controls: () => openControls(0), view: openView, title: () => (state.s6 ? openTitleS6() : openTitle()), problems: () => openProblems(),
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
  // Arrow keys move through a menu's enabled rows, as React Aria's Menu does (it skips disabled ones).
  const inMenu = e.target.closest?.('.ge-menu')
  if (inMenu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault()
    const rows = [...inMenu.querySelectorAll('.ge-item:not(:disabled)')]
    const at = rows.indexOf(e.target)
    rows[(at + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length]?.focus()
    return
  }
  if (inMenu && e.key === 'ArrowRight' && e.target.querySelector('.ge-arrow')) {
    e.preventDefault()
    e.target.dispatchEvent(new MouseEvent('mouseenter'))
    layer.querySelector('.ge-menu[data-sub] .ge-item')?.focus()
    return
  }
  if (inMenu && e.key === 'ArrowLeft' && inMenu.hasAttribute('data-sub')) {
    e.preventDefault()
    const parent = layer.querySelector('.ge-menu:not([data-sub]) .ge-item.open')
    inMenu.remove(); parent?.classList.remove('open'); parent?.focus()
    return
  }
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
