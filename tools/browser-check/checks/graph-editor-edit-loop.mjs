// Aurora-pvxx.7 (E4) through the browser: test on lights, Keep, Revert, a
// takeover, a lost heartbeat, Save, Save and apply, and Dashboard controls.
// Needs a built app (see tools/light-viz-relay/README.md); runs on the
// dummy input, so it works without a screen or Hue hardware.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'

const created = []

await withEditorStack(async ({ editorUrl, aurora }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))

  // Calls from inside the page go through the dev proxy, which sets Origin.
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
  const active = async () => (await api('GET', '/api/config')).json.activeEffectId
  const testNote = () => page.locator('.editor-test-note').innerText()
  const notice = () => page.locator('.editor-notice').innerText()
  const button = (name) => page.getByRole('button', { name, exact: true })
  const step = (label) => console.log(`ok  ${label}`)

  await page.goto(`${editorUrl}?effect=builtin.video`)
  await page.waitForSelector('.aurora-node')
  const original = await active()
  try {
    await page.waitForFunction(() => document.querySelector('.editor-status')?.textContent.includes('Live'), null, { timeout: 10_000 })
    step('built-in opens with a live preview')

    // Revert.
    await button('Test on lights').click()
    await button('Keep').waitFor()
    assert.match(await testNote(), /Testing on the lights, \d+ s left/)
    await page.waitForTimeout(2500)
    assert.match(await testNote(), /Testing on the lights, 11\d s left/)
    await button('Revert').click()
    await page.waitForFunction(() => document.querySelector('.editor-test-note')?.textContent.startsWith('Reverted'))
    assert.equal((await api('GET', '/api/graph/test')).json.active, false)
    step('test counts down; Revert puts the lights back')

    // Another session takes the lights.
    await button('Test on lights').click()
    await button('Keep').waitFor()
    const graph = (await api('GET', '/api/effects/builtin.video')).json.graph
    await api('PUT', '/api/graph/drafts/agent-1', { graph })
    assert.equal((await api('POST', '/api/graph/test', { session: 'agent-1' }, { 'X-Aurora-Client': 'mcp' })).status, 200)
    await page.waitForFunction(() => document.querySelector('.editor-test-note')?.textContent.includes('took the lights'), null, { timeout: 8000 })
    assert.match(await testNote(), /an agent took the lights/)
    assert.match(await button('Take over the lights').innerText(), /Take over/)
    await api('POST', '/api/graph/test/revert', { session: 'agent-1' })
    step('a takeover by an agent is reported, with the holder')

    // Lost heartbeats: the editor says so, the server puts the lights back.
    await button('Take over the lights').or(button('Test on lights')).click()
    await button('Keep').waitFor()
    await page.route('**/api/graph/test/heartbeat', (route) => route.abort())
    await page.waitForFunction(() => document.querySelector('.editor-test-note')?.textContent.includes('Lost contact'), null, { timeout: 15_000 })
    await page.unroute('**/api/graph/test/heartbeat')
    await page.waitForTimeout(7000)
    assert.equal((await api('GET', '/api/graph/test')).json.active, false)
    step('lost heartbeats are reported and the server reverts by itself')

    // Keep is refused for a graph edited since the test began.
    await button('Test on lights').click()
    await button('Keep').waitFor()
    await page.locator('.editor-name input').fill('Edited during test')
    assert.equal(await button('Keep').isDisabled(), true)
    await button('Revert').click()
    await page.locator('.editor-name input').fill('')
    step('Keep is disabled once the graph changes during a test')

    // Save as a new custom effect; the live effect stays.
    await button('Save').click()
    assert.equal(await notice(), 'Name the new effect first')
    await page.locator('.aurora-node', { hasText: 'Gain' }).first().locator('.aurora-node-header').click()
    await page.locator('.inspector-check input').first().check()
    await page.locator('.inspector h3', { hasText: 'Dashboard controls (4)' }).waitFor()
    await page.locator('.editor-name input').fill('Browser check')
    await button('Save').click()
    await page.waitForFunction(() => document.querySelector('.editor-header select')?.value === 'browser-check')
    created.push('browser-check')
    assert.match(await notice(), /^Saved as Browser check/)
    assert.equal(await active(), original)
    step('Save on a built-in makes a new custom effect and leaves the live one alone')

    // Test then Keep on the custom effect.
    await button('Test on lights').click()
    await button('Keep').waitFor()
    await button('Keep').click()
    await page.waitForFunction(() => document.querySelector('.editor-test-note')?.textContent.startsWith('Kept'))
    assert.equal(await active(), 'browser-check')
    step('Keep makes the tested graph the live effect')

    // Save and apply from a built-in.
    await api('PUT', '/api/config', { activeEffectId: 'builtin.video' })
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    await page.locator('.aurora-node', { hasText: 'Gain' }).first().locator('.aurora-node-header').click()
    await page.locator('.inspector-check input').first().check()
    const fields = page.locator('.inspector-controls li').last().locator('.inspector-field input')
    await fields.nth(0).fill('Strength')
    await fields.nth(0).press('Enter')
    await fields.nth(2).fill('How bright the lights get')
    await fields.nth(2).press('Enter')
    await page.locator('.editor-name input').fill('Browser check apply')
    await button('Save and apply').click()
    await page.waitForFunction(() => document.querySelector('.editor-header select')?.value === 'browser-check-apply')
    created.push('browser-check-apply')
    assert.equal(await active(), 'browser-check-apply')
    step('Save and apply switches the live effect')

    // The control reaches the Dashboard's graph.
    const live = (await api('GET', '/api/graph')).json
    const controls = (live.graph ?? live).controls
    assert.ok(controls.some((c) => c.node === 'gain_hue' && c.param === 'gain'), 'gain_hue.gain not among the controls')
    step('a param marked as a control is in the live graph\'s controls')

    // The Dashboard's Tuning draws it, with the label and tooltip set here.
    const dash = await browser.newPage({ viewport: { width: 700, height: 1000 } })
    await dash.goto(aurora)
    await dash.getByText('Tuning', { exact: true }).first().click()
    await dash.getByText('Strength', { exact: true }).waitFor({ timeout: 10_000 })
    assert.ok((await dash.locator('[title="How bright the lights get"]').count()) > 0, 'tooltip missing from Tuning')
    await dash.close()
    step('Dashboard Tuning shows the control with its label and tooltip')

    if (process.env.SLOW) {
      // Heartbeats keep a test alive until the server's cap, then it reverts.
      await button('Test on lights').click()
      await button('Keep').waitFor()
      await page.waitForFunction(() => document.querySelector('.editor-test-note')?.textContent.includes('time limit'), null, { timeout: 140_000 })
      assert.equal((await api('GET', '/api/graph/test')).json.active, false)
      step('the 120 s cap ends the test and the lights come back')
    }
  } finally {
    await api('PUT', '/api/config', { activeEffectId: original }).catch(() => {})
    for (const id of created) await api('DELETE', `/api/effects/${id}`).catch(() => {})
    await browser.close()
  }
})
console.log('graph-editor edit loop: all passed')
