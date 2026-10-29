// Aurora-pvxx.9 (E6): the Sequence E gate. One pass through the editor against
// the fake-Hue stack: open builtin.video, break a connection (badge), fix it
// (preview returns), test on lights, have a second session take the test,
// Save as new, reload and reopen (layout kept), undo and redo, pause.
// Runs on the dummy input, so it needs no screen or Hue hardware.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'

const created = []

await withEditorStack(async ({ editorUrl, aurora }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))

  const api = (method, path, body, headers = {}) =>
    page.evaluate(
      async ([method, path, body, headers]) => {
        const res = await fetch(path, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        return { status: res.status, json: await res.json().catch(() => ({})) }
      },
      [method, path, body, headers],
    )
  const button = (name) => page.getByRole('button', { name, exact: true })
  const status = () => page.locator('.editor-status').innerText()
  const waitStatus = (re, timeout = 10_000) =>
    page.waitForFunction((src) => new RegExp(src).test(document.querySelector('.editor-status')?.textContent ?? ''), re.source, { timeout })
  const step = (label) => console.log(`ok  ${label}`)
  const nodeBox = async (id) => {
    const box = await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox()
    assert.ok(box, `node ${id} not on screen`)
    return box
  }
  const gainValue = () => page.locator('.aurora-node', { hasText: 'Gain' }).first().locator('input[type=number]').first().inputValue()

  await page.goto(`${editorUrl}?effect=builtin.video`)
  await page.waitForSelector('.aurora-node')
  const original = (await api('GET', '/api/config')).json.activeEffectId
  try {
    await waitStatus(/Live/)
    step('built-in opens with a live preview')

    // Break the last connection: ease -> gain's frame input.
    const mid = await page.locator('.react-flow__edge[data-id*="ease_hue.frame"][data-id*="gain_hue.frame"] path.react-flow__edge-path').first().evaluate((p) => {
      const m = p.getPointAtLength(p.getTotalLength() / 2)
      const pt = new DOMPoint(m.x, m.y).matrixTransform(p.getScreenCTM())
      return { x: pt.x, y: pt.y }
    })
    await page.mouse.click(mid.x, mid.y)
    await page.keyboard.press('Backspace')
    await waitStatus(/problem/)
    await page.locator('.problem-badge').first().waitFor()
    step('a broken connection shows a problem badge and count')

    // Fix it by dragging from ease_hue's output to gain_hue's input.
    const out = page.locator('.react-flow__node[data-id="ease_hue"] .react-flow__handle.source').first()
    const into = page.locator('.react-flow__node[data-id="gain_hue"] .react-flow__handle.target').first()
    const [a, b] = [await out.boundingBox(), await into.boundingBox()]
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
    await page.mouse.up()
    await waitStatus(/Live/)
    assert.equal(await page.locator('.problem-badge').count(), 0)
    step('rewiring clears the badge and the preview comes back')

    // Move a node, then Save as a new effect.
    const before = await nodeBox('floor_hue')
    await page.mouse.move(before.x + 40, before.y + 8)
    await page.mouse.down()
    await page.mouse.move(before.x + 40, before.y + 160, { steps: 10 })
    await page.mouse.up()
    const moved = await nodeBox('floor_hue')
    assert.ok(Math.abs(moved.y - before.y) > 50, 'node did not move')

    // Test on lights, then another session takes them.
    await button('Test on lights').click()
    await button('Keep').waitFor()
    const graph = (await api('GET', '/api/effects/builtin.video')).json.graph
    await api('PUT', '/api/graph/drafts/agent-1', { graph })
    assert.equal((await api('POST', '/api/graph/test', { session: 'agent-1' }, { 'X-Aurora-Client': 'mcp' })).status, 200)
    await page.waitForFunction(() => document.querySelector('.editor-test-note')?.textContent.includes('took the lights'), null, { timeout: 8000 })
    await api('POST', '/api/graph/test/revert', { session: 'agent-1' })
    step('test on lights, then a second session takes it and the editor says so')

    await page.locator('.editor-name input').fill('Gate check')
    await button('Save').click()
    await page.waitForFunction(() => document.querySelector('.editor-header select')?.value === 'gate-check')
    created.push('gate-check')
    step('Save as new makes a custom effect')

    // Reload the page and reopen: the layout is the saved one.
    await page.goto(`${editorUrl}?effect=gate-check`)
    await page.waitForSelector('.aurora-node')
    await page.waitForTimeout(800)
    const saved = (await api('GET', '/api/effects/gate-check')).json.graph
    assert.ok(saved.ui?.floor_hue, 'layout not saved with the effect')
    const reopened = await nodeBox('floor_hue')
    const pane = await page.locator('.react-flow__renderer').boundingBox()
    const t = await page.locator('.react-flow__viewport').evaluate((v) => {
      const m = new DOMMatrix(getComputedStyle(v).transform)
      return { k: m.a, x: m.e, y: m.f }
    })
    const want = { x: pane.x + t.x + saved.ui.floor_hue.x * t.k, y: pane.y + t.y + saved.ui.floor_hue.y * t.k }
    assert.ok(Math.abs(reopened.x - want.x) < 2 && Math.abs(reopened.y - want.y) < 2, `layout differs: ${reopened.x},${reopened.y} vs ${want.x},${want.y}`)
    step('reload and reopen keeps the saved layout')

    // Undo and redo a param edit.
    await page.locator('.aurora-node', { hasText: 'Gain' }).first().locator('.aurora-node-header').click()
    const field = page.locator('.aurora-node', { hasText: 'Gain' }).first().locator('input[type=number]').first()
    const was = await field.inputValue()
    await field.fill('0.4')
    await field.press('Enter')
    await field.blur()
    assert.equal(await gainValue(), '0.4')
    await button('Undo').click()
    assert.equal(await gainValue(), was)
    await button('Redo').click()
    assert.equal(await gainValue(), '0.4')
    step('undo and redo step a param edit')

    // Pause the lights: the editor says the preview is paused.
    assert.equal((await api('PATCH', '/api/v1/state', { running: false })).status, 200)
    await waitStatus(/paused/i, 15_000)
    step('pausing the lights shows a paused preview')
    assert.equal((await api('PATCH', '/api/v1/state', { running: true })).status, 200)
  } finally {
    await api('PATCH', '/api/v1/state', { running: true }).catch(() => {})
    await api('PUT', '/api/config', { activeEffectId: original }).catch(() => {})
    for (const id of created) await api('DELETE', `/api/effects/${id}`).catch(() => {})
    await browser.close()
  }
})
console.log('graph-editor gate: all passed')
