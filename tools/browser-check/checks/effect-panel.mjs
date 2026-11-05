// Drives web/ui's EffectPanel in Chromium with no Aurora stack: a static server over web/ui and a
// stub page. Covers the button row markup, keyboard model, focus moves, outside changes and layout
// at 760 and 390.
// Usage: node checks/effect-panel.mjs   (SHOTS=<dir> also saves a screenshot per width)
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from '../lib/browser.mjs'

const root = fileURLToPath(new URL('../../../web/ui/', import.meta.url))
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html' }
const PAGE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<link rel=stylesheet href=/styles/tokens.css><link rel=stylesheet href=/styles/page.css><link rel=stylesheet href=/styles/forms.css>
<link rel=stylesheet href=/styles/dropdown.css><link rel=stylesheet href=/styles/effect-panel.css>
<div id=screen-container><div id=slot></div><button id=after>after</button></div>
<script type=module>
import { EffectPanel } from '/EffectPanel.js'
const picked = [], actions = []
window.picked = picked; window.actions = actions
// A stand-in for the Dashboard: applies the action to a local list and refreshes the panel.
async function onAction(a, e, extra) {
  actions.push(a + ':' + e.id)
  if (window.failNext) { window.failNext = false; return { ok: false } }
  let list = window.EFFECTS.map((x) => ({ ...x }))
  const me = list.find((x) => x.id === e.id)
  let made = {}
  if (a === 'Hide' || a === 'Unhide') me.hidden = a === 'Hide'
  else if (a === 'Rename') me.title = extra.title
  else if (a === 'Delete') list = list.filter((x) => x.id !== e.id)
  else if (a === 'Duplicate') {
    made = { id: e.id + '-copy', title: e.title + ' (Copy)' }
    list.push({ id: made.id, builtin: false, title: made.title, order: 99 })
  } else if (a === 'Move up' || a === 'Move down') {
    const same = list.filter((x) => !x.builtin && !x.hidden).sort((p, q) => p.order - q.order)
    const other = same[same.indexOf(me) + (a === 'Move up' ? -1 : 1)]
    ;[me.order, other.order] = [other.order, me.order]
  }
  window.EFFECTS = list
  window.panel.update({ effects: list })
  return { ok: true, ...made }
}
window.panel = new EffectPanel(document.getElementById('slot'), {
  onSelect: (id) => picked.push(id), onAction, onNewEffect: (id) => { window.newFrom = id },
})
window.EFFECTS = [
  { id: 'builtin.video', builtin: true, title: 'Screen colors', description: 'Matches the screen.', order: 0 },
  { id: 'builtin.audio', builtin: true, title: 'Music pulse', order: 1 },
  { id: 'fire', builtin: false, title: 'Fire', description: 'Warm flicker.', order: 2 },
  { id: 'candle', builtin: false, title: 'Candle', order: 3 },
  { id: 'strobe', builtin: false, title: 'Strobe', hidden: true, order: 4 },
]
window.ORIGINAL = JSON.parse(JSON.stringify(window.EFFECTS))
window.panel.update({ effects: window.EFFECTS, state: { effect: 'fire', state: 'running' }, hasAudio: true, canEdit: true, canDelete: true })
</script>`

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(req.url.split('?')[0]))
  if (path === '/' || path === '\\') { res.setHeader('content-type', 'text/html'); res.end(PAGE); return }
  try {
    const body = await readFile(join(root, path))
    res.setHeader('content-type', TYPES[extname(path)] ?? 'application/octet-stream')
    res.end(body)
  } catch { res.statusCode = 404; res.end() }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}/`

const browser = await launch()
try {
  for (const width of [760, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 700 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(base)
    const key = (k) => page.keyboard.press(k)
    const focused = () => page.evaluate(() => document.activeElement?.dataset?.key ?? document.activeElement?.id ?? document.activeElement?.tagName)
    const label = () => page.textContent('.dropdown-label')
    const live = () => page.textContent('[aria-live=polite]')

    assert.equal(await label(), 'Fire', 'trigger shows what runs')
    assert.equal(await page.getAttribute('.dropdown-trigger', 'aria-haspopup'), 'dialog')
    assert.equal(await page.isVisible('.ef-panel'), false)

    // Open: focus lands on the running row, the rows have one tab stop, Hidden starts collapsed.
    await page.focus('.dropdown-trigger')
    await key('Enter')
    assert.equal(await page.isVisible('.ef-panel'), true)
    assert.equal(await focused(), 'r:fire')
    assert.equal(await page.locator('.ef-pick[tabindex="0"]').count(), 1)
    assert.equal(await page.getAttribute('[data-key="g:hidden"]', 'aria-expanded'), 'false')
    assert.equal(await page.isVisible('[data-key="r:strobe"]'), false)

    // Markup: no tree roles. Headers are buttons in headings, rows are buttons, each row has a
    // visible Actions button that VoiceOver can reach, and New effect is a button.
    assert.equal(await page.locator('[role=tree], [role=treeitem]').count(), 0, 'no tree roles')
    assert.equal(await page.locator('h3.ef-group > button.ef-head[aria-expanded][aria-controls]').count(), 3)
    assert.equal(await page.evaluate(() => {
      const head = document.querySelector('[data-key="g:custom"]'); const list = document.getElementById(head.getAttribute('aria-controls'))
      return list.getAttribute('role') + ':' + (list.getAttribute('aria-labelledby') === head.id)
    }), 'group:true', 'a header labels its list')
    assert.equal(await page.evaluate(() => document.querySelector('[data-key="r:fire"]').tagName), 'BUTTON')
    assert.equal(await page.getAttribute('[data-key="r:fire"]', 'aria-current'), 'true', 'the running row is current')
    assert.equal(await page.getAttribute('[data-key="r:candle"]', 'aria-current'), null)
    assert.equal(await page.locator('[aria-selected]').count(), 0)
    assert.equal(await page.evaluate(() => document.querySelector('[data-key="new"]').tagName), 'BUTTON')
    assert.equal(await page.locator('.ef-more[aria-hidden]').count(), 0, 'Actions is not hidden')
    assert.equal(await page.getAttribute('[data-key="m:fire"]', 'aria-label'), 'Actions for Fire')
    assert.equal(await page.getAttribute('[data-key="m:fire"]', 'aria-haspopup'), 'menu')
    assert.equal(await page.getAttribute('[data-key="m:fire"]', 'aria-expanded'), 'false')
    assert.equal(await page.isVisible('[data-key="m:fire"]'), true)

    // Arrows move focus between rows only, across groups, and nothing commits.
    await key('ArrowDown'); assert.equal(await focused(), 'r:candle')
    await key('ArrowDown'); assert.equal(await focused(), 'r:candle', 'no wrap, collapsed Hidden has no rows')
    await key('Home'); assert.equal(await focused(), 'r:builtin.video')
    await key('ArrowDown'); await key('ArrowDown'); assert.equal(await focused(), 'r:fire', 'arrows cross groups')
    await key('End'); assert.equal(await focused(), 'r:candle')
    assert.deepEqual(await page.evaluate(() => window.picked), [])

    // Headers and New effect are Tab stops in page order, the rows keep their one stop.
    await page.focus('[data-key="r:fire"]')
    await key('Tab'); assert.equal(await focused(), 'g:hidden')
    await key('Tab'); assert.equal(await focused(), 'new')
    await key('Shift+Tab'); await key('Shift+Tab'); assert.equal(await focused(), 'r:fire')
    await key('Shift+Tab'); assert.equal(await focused(), 'g:custom')
    await key('Shift+Tab'); assert.equal(await focused(), 'g:builtin')

    // Groups: Enter and Space toggle the header and focus stays on it.
    await page.focus('[data-key="g:hidden"]')
    await key('Enter'); assert.equal(await page.getAttribute('[data-key="g:hidden"]', 'aria-expanded'), 'true')
    assert.equal(await focused(), 'g:hidden')
    assert.equal(await page.isVisible('[data-key="r:strobe"]'), true)
    await key('Space'); assert.equal(await page.getAttribute('[data-key="g:hidden"]', 'aria-expanded'), 'false')
    assert.equal(await page.isVisible('[data-key="r:strobe"]'), false)
    // Collapsing the group that holds the running effect puts the check on its header.
    await page.focus('[data-key="g:custom"]')
    await key('Enter')
    assert.equal(await page.isVisible('[data-key="g:custom"] .ef-cue'), true)
    assert.equal(await page.textContent('[data-key="g:custom"] .sr-only'), ', contains the current effect')
    await key('Enter')
    assert.equal(await page.isVisible('[data-key="g:custom"] .ef-cue'), false)

    // Type-ahead and the description tooltip on keyboard focus.
    await page.focus('[data-key="r:builtin.video"]')
    await page.keyboard.type('fi'); assert.equal(await focused(), 'r:fire')
    assert.equal(await page.isVisible('.ef-tip:not([hidden])'), true, 'keyboard focus shows the description')
    assert.notEqual(await page.getAttribute('[data-key="r:fire"]', 'aria-describedby'), null)

    // Actions: Right hops to the button, Left hops back, Enter opens the menu and Esc returns to the button.
    await key('ArrowRight'); assert.equal(await focused(), 'm:fire')
    await key('ArrowLeft'); assert.equal(await focused(), 'r:fire')
    await key('ArrowRight'); await key('Enter')
    assert.equal(await page.getAttribute('[data-key="m:fire"]', 'aria-expanded'), 'true')
    await key('Escape')
    assert.equal(await focused(), 'm:fire', 'Esc returns to the control that opened the menu')
    assert.equal(await page.getAttribute('[data-key="m:fire"]', 'aria-expanded'), 'false')
    assert.equal(await page.locator('.ef-menu').count(), 0)
    await key('ArrowLeft')

    // Row menu: items follow the row, Esc returns focus, the panel stays open.
    await key('ArrowRight'); await key('Enter')
    assert.equal(await page.isVisible('.ef-menu'), true)
    assert.deepEqual(await page.locator('.ef-menu [role=menuitem]').allTextContents(),
      ['Edit graph', 'Rename', 'Duplicate', 'Move down', 'Delete'], 'running row: no Hide, first row: no Move up')
    await key('ArrowDown'); await key('Enter')
    assert.equal(await page.isVisible('.ef-rename'), true, 'Rename edits in place')
    assert.equal(await page.evaluate(() => document.activeElement.className), 'ef-rename')
    await key('Escape')
    assert.equal(await page.locator('.ef-rename').count(), 0, 'Esc cancels')
    assert.deepEqual(await page.evaluate(() => window.actions), [], 'cancel sends nothing')
    assert.equal(await focused(), 'r:fire', 'focus back on the row')
    assert.equal(await page.isVisible('.ef-panel'), true, 'Esc in the field leaves the panel open')
    await key('Shift+F10')
    assert.equal(await page.isVisible('.ef-menu'), true)
    await key('Escape')
    assert.equal(await page.locator('.ef-menu').count(), 0)
    assert.equal(await focused(), 'r:fire')
    assert.equal(await page.isVisible('.ef-panel'), true, 'Esc in a menu leaves the panel open')

    // Commit: Enter picks, closes and returns focus to the trigger. The label waits for the pipeline.
    await key('ArrowUp'); await key('ArrowUp'); await key('ArrowUp')
    await key('Enter')
    assert.deepEqual(await page.evaluate(() => window.picked), ['builtin.video'])
    assert.equal(await page.isVisible('.ef-panel'), false)
    assert.equal((await focused()).includes('trigger'), true)
    assert.equal(await label(), 'Fire', 'the pick is not what runs')

    // Esc closes and Tab out closes without pulling focus back.
    await key('Enter'); await key('Escape')
    assert.equal(await page.isVisible('.ef-panel'), false)
    await key('Enter'); await key('Tab'); await key('Tab'); await key('Tab')
    assert.equal(await page.isVisible('.ef-panel'), false, 'Tab past New effect closes')
    await page.focus('.dropdown-trigger')
    await key('Enter')
    await page.mouse.click(width - 2, 690)
    assert.equal(await page.isVisible('.ef-panel'), false, 'outside click closes')

    // Outside changes patch in place: the open panel keeps its element, focus and scroll.
    await page.focus('.dropdown-trigger'); await key('Enter')
    await page.focus('[data-key="r:candle"]')
    await page.evaluate(() => { window.mark = document.querySelector('[data-key="r:candle"]') })
    await page.evaluate(() => window.panel.update({
      effects: window.EFFECTS.map((e) => (e.id === 'candle' ? { ...e, title: 'Candle 2' } : e)).concat([{ id: 'zeta', builtin: false, title: 'Zeta', order: 9 }]),
      state: { effect: 'candle', state: 'running' },
    }))
    assert.equal(await page.isVisible('.ef-panel'), true, 'never closes')
    assert.equal(await focused(), 'r:candle', 'focus stays on the id')
    assert.equal(await page.evaluate(() => window.mark === document.querySelector('[data-key="r:candle"]')), true, 'same element')
    assert.equal(await page.textContent('[data-key="r:candle"] .ef-opt-name'), 'Candle 2')
    assert.equal(await label(), 'Candle 2', 'trigger follows the running effect')
    assert.equal(await page.getAttribute('[data-key="r:candle"]', 'aria-current'), 'true')
    assert.equal(await page.getAttribute('[data-key="r:fire"]', 'aria-current'), null)
    assert.equal(await live(), '', 'check moves without an announcement')

    // A removed focused row hands focus on (next, then previous, then group) and says so.
    await page.evaluate(() => window.panel.update({ effects: window.EFFECTS.filter((e) => e.id !== 'candle').concat([{ id: 'zeta', builtin: false, title: 'Zeta', order: 9 }]) }))
    assert.equal(await focused(), 'r:zeta', 'next row')
    assert.equal(await live(), 'Candle 2 was removed')
    await page.evaluate(() => window.panel.update({ effects: window.EFFECTS.filter((e) => !['candle', 'zeta', 'fire'].includes(e.id)) }))
    assert.equal(await page.isVisible('[data-key="g:custom"]'), false, 'empty group leaves')
    await key('Escape')

    // Switch states: pending is aria-disabled (keeps focus) and busy with the line, a failure reads No effect running.
    await page.focus('.dropdown-trigger')
    await page.evaluate(() => window.panel.update({ effects: window.EFFECTS, state: { effect: 'fire' }, busy: true, pendingTitle: 'Candle' }))
    assert.equal(await page.getAttribute('.dropdown-trigger', 'aria-disabled'), 'true')
    assert.equal(await focused(), 'effects-0-trigger', 'trigger keeps focus while pending')
    await key('Enter'); await key('ArrowDown')
    assert.equal(await page.isVisible('.ef-panel'), false, 'pending trigger cannot open the panel')
    assert.equal(await page.getAttribute('.dropdown-trigger', 'aria-busy'), 'true')
    assert.equal(await page.textContent('.ef-status'), 'Switching to Candle…')
    assert.equal(await label(), 'Fire', 'keeps the running name while pending')
    await page.evaluate(() => {
      window.panel.update({ state: { effect: null, state: 'failed' }, busy: false })
      window.panel.announceSwitch({ title: 'Candle', outcome: 'failed', reason: 'no audio input is set up' })
    })
    assert.equal(await label(), 'No effect running')
    assert.equal(await focused(), 'effects-0-trigger', 'trigger keeps focus after the switch settles')
    assert.equal(await live(), "Couldn't start Candle: no audio input is set up")
    await page.evaluate(() => window.panel.update({ state: { effect: 'fire', state: 'paused' } }))
    assert.equal(await label(), 'Fire', 'paused keeps the name')
    await page.evaluate(() => window.panel.update({ state: { effect: 'fire', test: { active: true } } }))
    assert.equal(await label(), 'Light test')
    await page.evaluate(() => window.panel.update({ rejected: 'Candle no longer exists.' }))
    assert.equal(await page.textContent('.ef-status'), 'Candle no longer exists.')
    // Audio-less build: no Music pulse.
    await page.evaluate(() => window.panel.update({ hasAudio: false, rejected: null }))
    await page.focus('.dropdown-trigger'); await key('Enter')
    assert.equal(await page.locator('[data-key="r:builtin.audio"]').count(), 0)

    // Row actions (kep2.9). Start from the original list with the panel open on the running row.
    await page.evaluate(() => {
      window.panel.close({ refocus: false })
      window.EFFECTS = JSON.parse(JSON.stringify(window.ORIGINAL))
      window.panel.update({ effects: window.EFFECTS, state: { effect: 'fire', state: 'running' }, hasAudio: true, rejected: null, fallbackTitle: 'Music pulse' })
      window.actions.length = 0
    })
    // Keyboard route to a row's menu: Right to its Actions button, then Enter.
    const actions = async () => { await key('ArrowRight'); await key('Enter') }
    const choose = (text) => page.locator('.ef-menu [role=menuitem]', { hasText: new RegExp(`^${text}$`) }).click()
    const names = (group) => page.locator(`.ef-section:has([data-key="g:${group}"]) .ef-opt-name`).allTextContents()
    await page.focus('.dropdown-trigger'); await key('Enter')
    await key('ArrowDown')
    assert.equal(await focused(), 'r:candle')
    await actions()
    assert.deepEqual(await page.locator('.ef-menu [role=menuitem]').allTextContents(),
      ['Edit graph', 'Rename', 'Duplicate', 'Move up', 'Hide', 'Delete'], 'last custom row: no Move down')
    await choose('Move up')
    await page.waitForFunction(() => document.querySelector('[aria-live=polite]').textContent.includes('moved up'))
    assert.equal(await live(), 'Candle moved up, 1 of 2.')
    assert.deepEqual(await names('custom'), ['Candle', 'Fire'])
    assert.equal(await focused(), 'r:candle', 'Move keeps focus on the row')

    await actions(); await choose('Hide')
    await page.waitForFunction(() => document.querySelector('[aria-live=polite]').textContent === 'Candle hidden.')
    assert.equal(await focused(), 'r:fire', 'Hide moves focus to the next row')
    assert.equal(await page.locator('[data-key="g:hidden"]').count(), 1)

    await page.focus('[data-key="g:hidden"]'); await key('Enter')
    await page.focus('[data-key="r:strobe"]'); await actions(); await choose('Unhide')
    await page.waitForFunction(() => document.querySelector('[aria-live=polite]').textContent === 'Strobe unhidden.')
    assert.equal(await focused(), 'r:candle', 'Unhide moves focus within Hidden (previous row)')

    await page.focus('[data-key="r:fire"]'); await actions(); await choose('Duplicate')
    await page.waitForFunction(() => document.querySelector('[aria-live=polite]').textContent.startsWith('Duplicated'))
    assert.equal(await live(), 'Duplicated as Fire (Copy).')
    assert.equal(await focused(), 'r:fire-copy', 'focus follows the copy')
    assert.equal(await page.isVisible('.ef-panel'), true, 'panel stays open')

    // Rename: a clash keeps the field open with the message, then a free name saves.
    await actions(); await choose('Rename')
    assert.equal(await page.inputValue('.ef-rename'), 'Fire (Copy)')
    await page.fill('.ef-rename', ' candle '); await key('Enter')
    assert.equal(await page.textContent('.ef-rename-error'), 'Another effect is named Candle.')
    assert.equal(await page.getAttribute('.ef-rename', 'aria-invalid'), 'true')
    assert.deepEqual((await page.evaluate(() => window.actions)).filter((a) => a.startsWith('Rename')), [], 'a clash sends nothing')
    await page.fill('.ef-rename', 'Blaze'); await key('Enter')
    await page.waitForFunction(() => document.querySelector('[aria-live=polite]').textContent === 'Renamed to Blaze.')
    assert.equal(await page.locator('.ef-rename').count(), 0)
    assert.equal(await focused(), 'r:fire-copy')

    // Delete confirm: focus on Cancel, Esc returns to the row, a fresh quick press does nothing.
    await actions(); await choose('Delete')
    assert.equal(await page.getAttribute('.ef-confirm', 'role'), 'alertdialog')
    assert.equal(await page.textContent('.ef-confirm-title'), 'Delete Blaze?')
    assert.equal(await page.textContent('.ef-confirm-body'), "This can't be undone.")
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Cancel')
    await key('Escape')
    assert.equal(await page.locator('.ef-confirm').count(), 0)
    assert.equal(await focused(), 'm:fire-copy', 'Esc returns to the Actions button that opened it')
    await key('Enter'); await choose('Delete')
    await page.click('.ef-confirm-yes')
    assert.equal(await page.locator('.ef-confirm').count(), 1, 'a press right after the confirm opens cannot delete')
    await page.waitForTimeout(450)
    await page.click('.ef-confirm-yes')
    await page.waitForFunction(() => document.querySelector('[aria-live=polite]').textContent === 'Blaze deleted.')
    assert.equal((await focused()).startsWith('r:'), true)
    assert.notEqual(await focused(), 'r:fire-copy')

    // The running effect's confirm names the fallback, and confirming closes the panel to the trigger.
    await page.focus('[data-key="r:fire"]'); await actions(); await choose('Delete')
    assert.equal(await page.textContent('.ef-confirm-body'), "This can't be undone. It's running now, so Music pulse starts instead.")
    await key('Tab'); await key('Enter')
    assert.equal(await page.isVisible('.ef-panel'), false)
    assert.equal((await focused()).includes('trigger'), true)
    assert.equal((await page.evaluate(() => window.actions)).at(-1), 'Delete:fire')

    // A failed action announces and leaves the row.
    await key('Enter')
    await page.evaluate(() => { window.failNext = true })
    await page.focus('[data-key="r:strobe"]'); await actions(); await choose('Hide')
    await page.waitForFunction(() => document.querySelector('[aria-live=polite]').textContent === "Couldn't hide Strobe.")
    assert.equal(await page.locator('.ef-section:has([data-key="g:custom"]) [data-key="r:strobe"]').count(), 1)

    // New effect: Start from lists the built-ins, Esc returns, a pick closes the panel.
    await page.focus('[data-key="new"]'); await key('Enter')
    assert.deepEqual(await page.locator('.ef-menu-start [role=menuitem]').allTextContents(), ['Empty', 'Screen colors', 'Music pulse'])
    await key('Escape')
    assert.equal(await focused(), 'new')
    await key('Enter'); await key('ArrowDown'); await key('Enter')
    assert.equal(await page.evaluate(() => window.newFrom), 'builtin.video')
    assert.equal(await page.isVisible('.ef-panel'), false)
    await page.evaluate(() => { window.newFrom = null; window.panel.update({ hasAudio: false }) })
    await page.focus('.dropdown-trigger'); await key('Enter')
    await page.focus('[data-key="new"]'); await key('Enter')
    assert.deepEqual(await page.locator('.ef-menu-start [role=menuitem]').allTextContents(), ['Empty', 'Screen colors'], 'no Music pulse without audio')
    await key('Enter')
    assert.equal(await page.evaluate(() => window.newFrom), 'empty')
    await page.focus('.dropdown-trigger'); await key('Enter')

    // Layout: the panel stays inside the viewport and the page does not scroll sideways.
    const box = await page.locator('.ef-panel').boundingBox()
    assert.ok(box.x >= 0 && box.x + box.width <= width, `${width}px: panel inside the viewport`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll')
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/panel-${width}.png` })
    assert.deepEqual(errors, [], 'no page errors')
    await page.close()
  }
  console.log('effect-panel: ok')
} finally {
  await browser.close()
  server.close()
}
