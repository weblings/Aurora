// Stage 7.0g (Aurora-u8jx.6): the Preview island with a layout menu. Loads before mock.js and uses its helpers
// (el, btn, chevron, vsicon, VS, menu, shellRow, shellBand, ...) at call time only.
// pv is the scenario: lights reachable or not, a saved zone map or not, the user's pick, a running test.
const PV_NAME = { lights: 'Lights', room: 'Sim: your room', basic: 'Sim: basic room' }
const PV_COLORS = ['#d4714f', '#c85f6d', '#8e5fb0', '#4d6bc9', '#3f9a8a', '#38c9a8', '#e5ad3c', '#d4714f', '#c85f6d', '#8e5fb0']
// Every layout is plain 14 px cells, 8 per row, as ZonesIsland.tsx draws the live zones: no screen mapping, so a sim reads
// like the lights it stands in for. Lights: 10 (the live count). Your room: 8 (web/demo/zonemap.js). Basic room: 4 (ROOM_ZONE_MAP).
const PV_COUNT = { lights: 10, room: 8, basic: 4 }
const PV_CELLS = Object.fromEntries(Object.entries(PV_COUNT).map(([k, n]) => [k, PV_COLORS.slice(0, n).map((c, i) => ({ x: i % 8, y: Math.floor(i / 8), w: 1, h: 1, c }))]))
const PV_ROWS = { lights: 2, room: 1, basic: 1 }
// Grille's chevron as a direct child of its trigger, so [aria-expanded=true] > .ui-icon[data-chevron] flips it (a wrapper span would turn the rule off).
const pvChev = () => { const t = document.createElement('template'); t.innerHTML = `<svg class="ui-icon" data-size="sm" data-chevron viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">${VS.chevDown}</svg>`; return t.content.firstChild }

function pvInit(init = {}) {
  opts.split = true
  const pv = { lights: true, saved: true, pick: null, testing: false, outputs: 1, say: '', cap: '', menuOpen: false, ...init }
  state.pv = pv
  state.testing = pv.testing
  return pv
}

function pvShown(pv = state.pv) {
  if (pv.testing) return 'lights'
  return pv.pick ?? (pv.lights ? 'lights' : pv.saved ? 'room' : 'basic')
}

// An automatic change is announced through the Announcer; a pick the user made is not.
function pvEvent(kind) {
  const pv = state.pv, before = pvShown()
  if (kind === 'down') pv.lights = false
  if (kind === 'up') pv.lights = true
  if (kind === 'test-start') pv.testing = true
  if (kind === 'test-end') pv.testing = false
  state.testing = pv.testing
  const after = pvShown()
  const lead = { down: "Can't reach your lights.", up: 'Lights are back.', 'test-start': 'Testing on Hue.', 'test-end': 'Test ended.' }[kind]
  pv.say = before === after ? '' : `${lead} Preview shows ${PV_NAME[after]}.`
  pvRedraw()
}

function pvPick(layout) {
  const pv = state.pv
  pv.pick = layout === 'lights' ? null : layout
  pv.say = ''
  pvRedraw()
}

// The layout control is a menu button like the zoom and Test caret menus: the same menu() with a tick on the checked row.
// With one output the menu is flat. A second output adds one section per output to this same menu, so the header never grows a second control.
function pvLayoutMenu() {
  const pv = state.pv, shown = pvShown()
  closePopups()
  const trigger = document.querySelector('.pv-layout')
  trigger.setAttribute('aria-expanded', 'true')
  const r = trigger.getBoundingClientRect()
  const rows = ['lights', 'room', 'basic'].filter((k) => k !== 'room' || pv.saved).map((k) => ({ label: PV_NAME[k], checked: shown === k, disabled: k === 'lights' && !pv.lights, run: () => pvPick(k) }))
  const items = pv.outputs > 1 ? [{ head: 'Hue' }, ...rows, '-', { head: 'XR headset (example)' }, { label: 'Default view', checked: false }] : rows
  menu(items, r.left, r.bottom + 4)
}

function pvIsland() {
  const pv = state.pv, shown = pvShown(), open = state.zonesOpen
  // The whole title row is the toggle, as the other dropdowns are one button. Collapsed it is the same button at its own width.
  const toggle = (cls) => btn(['Preview', pvChev()], { class: `ui-button ${cls}`, 'data-act': 'zones', 'aria-expanded': String(open), 'aria-label': open ? 'Hide preview' : 'Show preview' })
  if (!open) return toggle('')
  const cells = PV_CELLS[shown]
  const label = PV_NAME[shown]
  const shownLabel = pv.outputs > 1 ? `Hue: ${label}` : label
  return el('div', { class: 'pv-card', role: 'group', 'aria-label': 'Preview' },
    toggle('pv-toggle'),
    // While a test runs the menu is locked; the reason is a tooltip on the wrapper, since a disabled button gets no hover.
    el('span', { class: 'pv-lock', title: pv.testing ? 'Showing the lights while a test runs' : undefined },
      btn([el('span', {}, shownLabel), pvChev()], { class: 'ui-button pv-layout', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-act': 'pv-layout', disabled: pv.testing, 'aria-label': `Preview layout, ${label}` })),
    el('div', { class: 'ge-zmap pv-map', style: `--rows:${PV_ROWS[shown]};--step:16px`, role: 'img', 'aria-label': `${PV_NAME[shown]}, ${cells.length} zones` },
      cells.map((r) => el('i', { style: `--x:${r.x};--y:${r.y};--w:1;--h:1;background:${r.c}` }))))
}

// The shell above the bar: core's own output_link text (OutputLinkMonitor.hpp kUnreachableMessage), no button. A test the user
// started gets no row: the Test button's Stop state already says so, and shell rows are for what the user did not cause (Stage 6).
function pvShell() {
  document.querySelector('.pv-shell')?.remove()
  if (state.pv.lights) return
  const band = shellBand(shellRow({ text: "Aurora can't reach your lights. Check that the Hue bridge is powered on and on your network.", err: true }))
  band.classList.add('pv-shell')
  $('bar').before(band)
}

function pvRedraw() {
  const pv = state.pv
  drawBar()
  drawIslands()
  pvShell()
  // Mock annotation only, kept out of the editor area under the frame strip: nothing here is drawn by the real editor.
  // The announcement is the Announcer's visually hidden live region (Announcer.tsx), screen readers only.
  const note = document.querySelector('.pv-note') ?? $('frames').after(el('div', { class: 'pv-note' })) ?? document.querySelector('.pv-note')
  const isl = document.querySelector('#preview > *')
  const lines = [pv.cap && ['Mock note', pv.cap], pv.say && ['Screen readers only, nothing drawn', `"${pv.say}"`],
    pv.measure && isl && ['Measured', `island ${Math.round(isl.getBoundingClientRect().width)} px wide in a ${Math.round($('canvas').getBoundingClientRect().width)} px canvas`]].filter(Boolean)
  note.replaceChildren(...lines.map(([k, v]) => el('p', {}, el('b', {}, `${k}: `), v)))
  note.hidden = !lines.length
}

// Frames: pvFrame(n) draws frame n of the design field's list. Scenario toggles in the strip change pv live.
function pvFrame(n) {
  const base = { cap: '' }
  const frames = {
    1: [{ cap: 'Lights reachable, default. Test is the split button, as built (SplitTestButton.tsx).' }],
    2: [{ cap: 'Layout menu open. Sim: your room is the saved zone map.' }, () => pvLayoutMenu()],
    3: [{ pick: 'basic', cap: 'Sim: basic room picked: 4 cells (the demo\'s ROOM_ZONE_MAP). Test button unchanged.' }],
    4: [{ pick: 'basic', testing: true, cap: 'Test running from frame 3: layout reads "Lights", menu locked with a hover tooltip ("Showing the lights while a test runs"), real cells. No shell row: the user started it and the button already reads Stop.', say: 'Testing on Hue. Preview shows Lights.' }],
    5: [{ pick: 'basic', cap: 'Test ended: the island is back on the layout the user picked.', say: 'Test ended. Preview shows Sim: basic room.' }],
    6: [{ lights: false, cap: 'No lights reachable. The shell already shows core\'s output_link row (not new), Test is disabled with its reason as the tooltip, island on Sim: your room, Lights greyed.', say: "Can't reach your lights. Preview shows Sim: your room." }],
    7: [{ lights: false, saved: false, cap: 'No lights and no saved map (fresh install): Sim: basic room. Sim: your room is left out of the menu (owner, 2026-11-15).', say: "Can't reach your lights. Preview shows Sim: basic room." }],
    8: [{ testing: true, cap: 'Island collapsed during a test: the Stop button is all that says a test runs, as with the island open.' }, () => { state.zonesOpen = false; drawIslands() }],
    9: [{ pick: 'basic', measure: true, cap: 'Longest name at this window width. Open the 400 and 360 px popups from the strip to measure there.' }],
    10: [{ outputs: 2, cap: 'Two outputs (for later): the layout menu gains one section per output, with the trigger reading "Hue: Lights". No second dropdown, the header is unchanged.' }, () => pvLayoutMenu()],
  }
  const [init, after] = frames[n]
  pvInit({ ...base, ...init })
  state.zonesOpen = true
  pvRedraw()
  after?.()
}

// Live scenario toggles (frame strip, group Preview).
function pvToggle(key) {
  const pv = state.pv ?? (pvFrame(1), state.pv)
  if (key === 'lights') return pvEvent(pv.lights ? 'down' : 'up')
  if (key === 'saved') { pv.saved = !pv.saved; pv.say = ''; pvRedraw() }
}
