// Aurora-pvxx.7 (E4) through the browser: test on lights, Revert, a
// takeover, a lost heartbeat, Save, Save and apply, and Dashboard controls.
// Needs a built app (see tools/light-viz-relay/README.md); runs on the
// dummy input, so it works without a screen or Hue hardware.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { announced, detailsChecks, fileAction, waitAnnounced, pickAction, setName, tickFirst, waitControlCount, waitToast } from '../lib/editorMenu.mjs'

const created = []

await withEditorStack(async ({ editorUrl, aurora }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
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
  const countdown = () => button('Stop the test').innerText()
  const button = (name) => page.getByRole('button', { name, exact: true })
  const step = (label) => console.log(`ok  ${label}`)

  await page.goto(`${editorUrl}?effect=builtin.video`)
  await page.waitForSelector('.aurora-node')
  const original = await active()
  try {
    await page.waitForFunction(() => document.querySelector('.editor-header')?.dataset.preview.includes('Live'), null, { timeout: 10_000 })
    step('built-in opens with a live preview')

    // Stop.
    await button('Test on lights').click()
    await button('Stop the test').waitFor()
    assert.match(await countdown(), /Stop 0:1\d/)
    await page.waitForTimeout(2500)
    assert.match(await countdown(), /Stop 0:1[0-3]/)
    await button('Stop the test').click()
    // Stop is the user's own act and the lights show it: announced, never drawn (Aurora-u68h.6).
    await waitAnnounced(page, 'Reverted')
    assert.equal(await page.locator('.editor-toast').getAttribute('data-shown'), 'false', 'Stop draws no toast')
    assert.equal((await page.locator('.editor-toast').innerText()).trim(), '', 'Stop draws no toast text')
    assert.equal((await api('GET', '/api/graph/test')).json.active, false)
    step('test counts down on Stop; Stop puts the lights back')

    // Another session takes the lights.
    await button('Test on lights').click()
    await button('Stop the test').waitFor()
    const graph = (await api('GET', '/api/effects/builtin.video')).json.graph
    await api('PUT', '/api/graph/drafts/agent-1', { graph })
    assert.equal((await api('POST', '/api/graph/test', { session: 'agent-1' }, { 'X-Aurora-Client': 'mcp' })).status, 200)
    const keepAgent = setInterval(() => void api('POST', '/api/graph/test/heartbeat', { session: 'agent-1' }).catch(() => {}), 1000)
    await waitAnnounced(page, 'took the lights', 8000)
    assert.match(await announced(page), /Test ended: an agent took the lights/)
    assert.match(await button('Take over the lights').innerText(), /Take over/)
    clearInterval(keepAgent)
    await api('POST', '/api/graph/test/revert', { session: 'agent-1' })
    step('a takeover by an agent is reported, with the holder')

    // Lost heartbeats: the editor says so, the server puts the lights back.
    await button('Take over the lights').or(button('Test on lights')).click()
    await button('Stop the test').waitFor()
    await page.route('**/api/graph/test/heartbeat', (route) => route.abort())
    // Three failed heartbeats: the tab gives up and the button is at rest. Lost contact is the
    // "Aurora has stopped" takeover (needs /api/state down as well), never a message of its own.
    await button('Test on lights').waitFor({ timeout: 15_000 })
    assert.equal(await page.locator('.editor-banner').count(), 0)
    assert.doesNotMatch(await announced(page), /Lost contact/)
    await page.unroute('**/api/graph/test/heartbeat')
    await page.waitForTimeout(7000)
    assert.equal((await api('GET', '/api/graph/test')).json.active, false)
    step('lost heartbeats return the button to rest, with no message of their own, and the server reverts by itself')

    // A test shows Stop only: Keep is gone, the title menu commits.
    await button('Test on lights').click()
    await button('Stop the test').waitFor()
    assert.equal(await button('Keep').count(), 0)
    await button('Stop the test').click()
    step('a test offers Stop only')

    // Save as a new custom effect; the live effect stays.
    await pickAction(page, 'Save')
    // Save on a built-in opens the naming dialog; Escape writes nothing.
    await page.getByRole('dialog', { name: 'Name the new effect' }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'Name the new effect' }).waitFor({ state: 'detached' })
    await tickFirst(page, page.locator('.aurora-node', { hasText: 'Gain' }).first())
    await waitControlCount(page, 4)
    await setName(page, 'Browser check')
    await fileAction(page, 'Save')
    await page.waitForFunction(() => document.querySelector('[data-effect]')?.dataset.effect === 'browser-check')
    created.push('browser-check')
    await waitToast(page, 'Saved as Browser check')
    assert.equal(await active(), original)
    step('Save on a built-in makes a new custom effect and leaves the live one alone')

    // Save and apply during a test ends it (apply alone leaves it running).
    await button('Test on lights').click()
    await button('Stop the test').waitFor()
    await fileAction(page, 'Save and apply')
    await page.waitForFunction(() => document.querySelector('.editor-toast')?.textContent.startsWith('Saved and live'))
    assert.equal((await api('GET', '/api/graph/test')).json.active, false)
    assert.equal(await active(), 'browser-check')
    step('Save and apply with the graph as tested makes it live and ends the test')

    // Edited since the test began: the edited graph is what ends up live.
    await api('PUT', '/api/config', { activeEffectId: original })
    await button('Test on lights').click()
    await button('Stop the test').waitFor()
    await setName(page, 'Browser check edited')
    // The earlier toast must be gone, or the wait below passes on it.
    await page.locator('.editor-toast[data-shown="false"]').waitFor({ state: 'attached' })
    await fileAction(page, 'Save and apply')
    await page.waitForFunction(() => document.querySelector('.editor-toast')?.textContent.startsWith('Saved and live'))
    assert.equal((await api('GET', '/api/graph/test')).json.active, false)
    assert.equal(await active(), 'browser-check')
    assert.equal((await api('GET', '/api/effects/browser-check')).json.graph.title, 'Browser check edited')
    step('Save and apply with an edited graph makes the edit live and ends the test')

    // Save and apply from a built-in.
    await api('PUT', '/api/config', { activeEffectId: 'builtin.video' })
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    await tickFirst(page, page.locator('.aurora-node', { hasText: 'Gain' }).first())
    const fields = detailsChecks(page).first().locator('xpath=ancestor::div[1]').locator('.drawer-field input')
    await fields.nth(0).fill('Strength')
    await fields.nth(0).press('Enter')
    await fields.nth(2).fill('How bright the lights get')
    await fields.nth(2).press('Enter')
    await setName(page, 'Browser check apply')
    await fileAction(page, 'Save and apply')
    await page.waitForFunction(() => document.querySelector('[data-effect]')?.dataset.effect === 'browser-check-apply')
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
      // A Once test ends by itself after 15 s: the lights come back and a toast says so.
      await button('Test on lights').click()
      await button('Stop the test').waitFor()
      await page.waitForFunction(() => document.querySelector('.editor-toast')?.textContent.includes('lights are back'), null, { timeout: 30_000 })
      assert.equal((await api('GET', '/api/graph/test')).json.active, false)
      step('a Once test ends after 15 s and the lights come back')
    }
  } finally {
    await api('PUT', '/api/config', { activeEffectId: original }).catch(() => {})
    for (const id of created) await api('DELETE', `/api/effects/${id}`).catch(() => {})
    await browser.close()
  }
})
console.log('graph-editor edit loop: all passed')
