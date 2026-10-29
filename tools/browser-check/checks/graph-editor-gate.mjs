// Aurora-pvxx.9 / .15 (E6): the Sequence E gate. One pass through the editor
// against the fake-Hue stack: open builtin.video, break a connection (badge),
// fix it (preview changes), test on lights, have a second session take the
// test, Save, reload, restart Aurora and reopen (layout kept), add a palette
// node and wire it in, Save as new from a custom, undo and redo (the preview
// follows the edit), the replaced / draft_invalid / too-many-drafts preview
// states, pause. Runs on the dummy input, so it needs no screen or Hue hardware.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'

const created = []

await withEditorStack(async ({ editorUrl, restart }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 1000 } })
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
  const thumb = () => page.locator('.zone-thumbnail').evaluate((c) => c.toDataURL())
  // Summed red+green+blue of the zone thumbnail, 0 when it is blank.
  const brightness = () =>
    page.locator('.zone-thumbnail').evaluate((c) => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let sum = 0
      for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) * (d[i + 3] / 255)
      return sum
    })
  const until = async (test, what, ms = 10_000) => {
    for (const end = Date.now() + ms; !(await test()); ) {
      if (Date.now() > end) assert.fail(what)
      await page.waitForTimeout(150)
    }
  }
  // The header and canvas reflow as the status text changes, so let the page
  // settle before taking coordinates for a mouse drag.
  const settle = () => page.waitForTimeout(500)
  const drag = async (from, to) => {
    await settle()
    const [a, b] = [await from.boundingBox(), await to.boundingBox()]
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
    await page.mouse.up()
  }
  const handle = (id, kind) => page.locator(`.react-flow__node[data-id="${id}"] .react-flow__handle.${kind}`).first()
  const session = () => page.evaluate(() => sessionStorage.getItem('aurora.graphEditor.session'))
  const checkLayout = async (id) => {
    const saved = (await api('GET', `/api/effects/${id}`)).json.graph
    assert.ok(saved.ui?.floor_hue, 'layout not saved with the effect')
    const shown = await nodeBox('floor_hue')
    const pane = await page.locator('.react-flow__renderer').boundingBox()
    const t = await page.locator('.react-flow__viewport').evaluate((v) => {
      const m = new DOMMatrix(getComputedStyle(v).transform)
      return { k: m.a, x: m.e, y: m.f }
    })
    const want = { x: pane.x + t.x + saved.ui.floor_hue.x * t.k, y: pane.y + t.y + saved.ui.floor_hue.y * t.k }
    assert.ok(Math.abs(shown.x - want.x) < 2 && Math.abs(shown.y - want.y) < 2, `layout differs: ${shown.x},${shown.y} vs ${want.x},${want.y}`)
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

    // Fix it by dragging from ease_hue's output to gain_hue's input. The
    // thumbnail must show a new frame, not just the status flip back.
    const held = await thumb()
    await drag(handle('ease_hue', 'source'), handle('gain_hue', 'target'))
    await waitStatus(/Live/)
    assert.equal(await page.locator('.problem-badge').count(), 0)
    await page.waitForFunction((was) => {
      const c = document.querySelector('.zone-thumbnail')
      return c && !c.classList.contains('zone-thumbnail-stale') && c.toDataURL() !== was
    }, held, { timeout: 10_000 })
    step('rewiring clears the badge and the thumbnail shows a new frame')

    // Move a node, then Save as a new effect.
    await settle()
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
    await checkLayout('gate-check')
    step('reload and reopen keeps the saved layout')

    // Restart Aurora itself; the custom effect and its layout come back.
    restart()
    await page.goto(`${editorUrl}?effect=gate-check`)
    await page.waitForSelector('.aurora-node')
    await waitStatus(/Live/, 20_000)
    await page.waitForTimeout(800)
    await checkLayout('gate-check')
    step('restarting Aurora and reopening the effect keeps the saved layout, preview Live')

    // Add a node from the palette and wire it in.
    const nodeCount = await page.locator('.react-flow__node').count()
    await page.locator('.palette-item', { hasText: 'Gain' }).first().click()
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n + 1, nodeCount)
    const ids = await page.locator('.react-flow__node').evaluateAll((els) => els.map((e) => e.dataset.id))
    const added = ids.find((id) => /^gain(-\d+)?$/.test(id))
    assert.ok(added, `no new gain node among ${ids}`)
    await drag(handle('ease_hue', 'source'), handle(added, 'target'))
    await waitStatus(/Live/)
    assert.equal(await page.locator('.problem-badge').count(), 0)
    step('a palette node is added and wired in, preview Live')

    // An output-bound node starts on a registered output, so it has no problem badge.
    const beforeSend = await page.locator('.react-flow__node').count()
    await page.locator('.palette-item', { hasText: 'Send to output' }).first().click()
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n + 1, beforeSend)
    const sendNode = page.locator('.aurora-node', { hasText: 'Send to output' }).last()
    assert.equal(await sendNode.locator('.problem-badge').count(), 0)
    assert.equal(await sendNode.locator('select[aria-label=output]').inputValue(), 'hue')
    await sendNode.locator('.aurora-node-header').click()
    await page.keyboard.press('Backspace')
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n, beforeSend)
    step('an output-bound palette node starts on a registered output with no problem')

    // Save as new from the custom effect: the original keeps its graph.
    const originalNodes = (await api('GET', '/api/effects/gate-check')).json.graph.nodes.length
    await page.locator('.editor-name input').fill('Gate copy')
    await button('Save as new').click()
    await page.waitForFunction(() => document.querySelector('.editor-header select')?.value === 'gate-copy')
    created.push('gate-copy')
    assert.equal((await api('GET', '/api/effects/gate-check')).json.graph.nodes.length, originalNodes)
    assert.equal((await api('GET', '/api/effects/gate-copy')).json.graph.nodes.length, originalNodes + 1)
    step('Save as new from a custom makes a copy and leaves the original')

    // Undo and redo a param edit; the thumbnail follows it.
    await page.locator('.aurora-node', { hasText: 'Gain' }).first().locator('.aurora-node-header').click()
    const field = page.locator('.aurora-node', { hasText: 'Gain' }).first().locator('input[type=number]').first()
    const was = await field.inputValue()
    await waitStatus(/Live/)
    await until(async () => (await brightness()) > 0, 'thumbnail is blank before the edit')
    const full = await brightness()
    await field.fill('0.4')
    await field.press('Enter')
    await field.blur()
    assert.equal(await gainValue(), '0.4')
    await until(async () => (await brightness()) < full * 0.8, 'thumbnail did not dim after gain 0.4')
    await button('Undo').click()
    assert.equal(await gainValue(), was)
    await button('Redo').click()
    assert.equal(await gainValue(), '0.4')
    step('undo and redo step a param edit, and the preview follows it')
    await button('Undo').click()

    // A second view takes the preview stream; Reconnect gets it back.
    const mine = await session()
    await page.evaluate((s) => {
      window.__thief = new EventSource(`/api/graph/preview?session=${encodeURIComponent(s)}`)
    }, mine)
    await waitStatus(/taken over/)
    await page.evaluate(() => window.__thief.close())
    await button('Reconnect').click()
    await waitStatus(/Live/)
    step('a second preview of the same session shows taken over, Reconnect restores it')

    // A draft that needs an input the preview did not open: draft_invalid.
    const audio = (await api('GET', '/api/effects/builtin.audio')).json.graph
    assert.equal((await api('PUT', `/api/graph/drafts/${mine}`, { graph: audio })).status, 200)
    await waitStatus(/would not load/)
    await button('Redo').click()
    await waitStatus(/Live/)
    step('a draft needing an unopened input shows draft would not load, and the next edit recovers')

    // Fill the draft slots, then open the editor on a new session: too many drafts.
    const filled = []
    for (let i = 0; i < 40; i++) {
      const r = await api('PUT', `/api/graph/drafts/gate-fill-${i}`, { graph: audio })
      if (r.status === 429) {
        assert.equal(r.json.error, 'too_many_drafts')
        break
      }
      filled.push(`gate-fill-${i}`)
    }
    assert.ok(filled.length < 40, 'never hit the draft limit')
    await page.evaluate(() => sessionStorage.removeItem('aurora.graphEditor.session'))
    await page.goto(`${editorUrl}?effect=gate-copy`)
    await page.waitForSelector('.aurora-node')
    await waitStatus(/Draft not sent/)
    assert.match(await page.locator('.editor-status').getAttribute('title'), /too_many_drafts/)
    step('a full draft store shows draft not sent (too_many_drafts)')
    for (const id of [...filled, mine]) await api('DELETE', `/api/graph/drafts/${id}`).catch(() => {})
    await page.reload()
    await page.waitForSelector('.aurora-node')
    await waitStatus(/Live/)

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
