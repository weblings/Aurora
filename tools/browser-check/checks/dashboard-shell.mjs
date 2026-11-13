// Aurora-9hqa.1: the Dashboard's error shell patches rows by key instead of rewriting innerHTML on
// every 3 s poll. Keyboard focus on Retry and on Stop test survives several polls (on the same DOM
// nodes), and a changed message (POST /api/dev/errors again, same source, new text) replaces only its
// own row: the other row's node is the one drawn before. Aurora-u8jx.5: the shell collapses as one:
// the first /api/state reply is the baseline (two rows start collapsed, one starts open), the one
// toggle button is the same node in both states and keeps focus across polls and toggles, a lone row
// collapses, an arrival or a changed message re-opens, a Once light test's countdown does not, and
// recovery from the takeover re-baselines. `SHOTS=<dir>` saves screenshots (also at 400 wide).
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withAuroraStack } from '../lib/stack.mjs'

// The dev-only /api/dev/errors routes need this in the app's environment.
process.env.AURORA_DEV_ERRORS = '1'

await withAuroraStack(async ({ aurora }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const api = async (method, path, body, headers = {}) => {
    const res = await fetch(`${aurora}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, json: await res.json().catch(() => ({})) }
  }
  const rows = page.locator('#shell-banner-slot .shell-banner-row')
  const toggle = page.locator('#shell-banner-toggle')
  const shot = (name) => (process.env.SHOTS ? page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }) : null)
  const RED = 'rgb(255, 107, 107)'
  const WHITE = 'rgb(255, 255, 255)'
  const markColor = (loc) => loc.evaluate((el) => getComputedStyle(el).color)
  const overflow = () => page.locator('#shell-banner-slot').evaluate((el) => el.scrollWidth - el.clientWidth)
  const label = async () => (await toggle.innerText()).replace(/\s+/g, ' ').trim()
  const expectCollapsed = async (text) => {
    await page.waitForFunction((l) => { const t = document.querySelector('#shell-banner-toggle'); return t?.getAttribute('aria-expanded') === 'false' && t.innerText.replace(/\s+/g, ' ').trim() === l }, text, { timeout: 10_000 }).catch(async () => assert.fail(`wanted the collapsed bar "${text}", got "${await page.locator('#shell-banner-slot').innerText().catch(() => '')}"`))
  }
  const expectOpen = async () => {
    await page.waitForFunction(() => document.querySelector('#shell-banner-toggle')?.getAttribute('aria-expanded') === 'true', null, { timeout: 10_000 })
    assert.equal(await label(), 'Show less')
  }
  // Waits for n further /api/state answers: the shell's beat, one per 3 s.
  const polls = async (n) => {
    for (let i = 0; i < n; i += 1) await page.waitForResponse((r) => r.url().endsWith('/api/state') && r.request().method() === 'GET', { timeout: 10_000 })
  }
  const active = () => page.evaluate(() => document.activeElement?.id ?? null)
  // Marks a node so a later check can tell it from a redrawn one.
  const tag = (selector, value) => page.evaluate(([sel, v]) => { document.querySelector(sel).__tag = v }, [selector, value])
  const tagOf = (selector) => page.evaluate((sel) => document.querySelector(sel)?.__tag ?? null, selector)
  const original = (await api('GET', '/api/config')).json.activeEffectId
  let release = () => {}

  try {
    assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-1', message: 'first message' })).status, 200, 'dev error route (needs a dev build)')
    // Another session's live test is the light-test row with its Stop test button. Its holder must keep
    // sending heartbeats or the daemon ends the test after a few seconds.
    const graph = (await api('GET', '/api/effects/builtin.video')).json.graph
    await api('PUT', '/api/graph/drafts/agent-1', { graph })
    assert.equal((await api('POST', '/api/graph/test', { session: 'agent-1', mode: 'live' }, { 'X-Aurora-Client': 'mcp' })).status, 200)
    const timer = setInterval(() => void api('POST', '/api/graph/test/heartbeat', { session: 'agent-1' }).catch(() => {}), 1000)
    release = () => clearInterval(timer)

    await page.goto(`${aurora}/`)
    const error = page.locator('.shell-banner-row', { hasText: 'first message' })
    const test = page.locator('.shell-banner-row', { hasText: 'is testing an effect on the lights' })
    // Two rows at load (a light test and one error): the baseline collapses them, notices first.
    await expectCollapsed('1 notice 1 error')
    assert.equal(await rows.count(), 0, 'collapsed: only the bar')
    assert.equal(await markColor(toggle.locator('.shell-mark-error')), RED, 'red circled-exclamation on the error count')
    assert.equal(await markColor(toggle.locator('.shell-mark-info')), WHITE, 'default circled-info on the notice count')
    await shot('dashboard-collapsed')
    await page.setViewportSize({ width: 400, height: 800 })
    assert.ok((await overflow()) <= 0, 'the collapsed bar fits at 400 wide')
    await shot('dashboard-collapsed-400')
    await page.setViewportSize({ width: 1100, height: 800 })
    step('two rows at load start collapsed: "1 notice 1 error"')

    // The toggle keeps keyboard focus across polls and is one node across the toggle.
    await page.evaluate(() => { document.querySelector('#shell-banner-toggle').__tag = 'toggle-node' })
    await page.focus('#shell-banner-toggle')
    await polls(2)
    assert.equal(await active(), 'shell-banner-toggle', 'the toggle keeps keyboard focus across polls')
    await page.keyboard.press('Enter')
    await error.waitFor({ timeout: 10_000 })
    await test.waitFor({ timeout: 10_000 })
    await expectOpen()
    assert.equal(await tagOf('#shell-banner-toggle'), 'toggle-node', 'the same toggle node after expanding')
    assert.equal(await active(), 'shell-banner-toggle', 'focus stayed on the toggle through the toggle')
    await polls(2)
    assert.equal(await active(), 'shell-banner-toggle')
    assert.equal(await markColor(rows.first().locator('.shell-mark-info')), WHITE, 'the open light-test row carries the circled-info')
    assert.equal(await markColor(error.locator('.shell-mark-error')), RED, 'the open error row carries the red circled-exclamation')
    assert.equal(await rows.count(), 2, 'a light test and one error: two full rows')
    assert.match((await rows.first().innerText()).trim(), /^An agent is testing/, 'notices first')
    await shot('dashboard-open')
    await page.setViewportSize({ width: 400, height: 800 })
    assert.ok((await overflow()) <= 0, 'the open rows fit at 400 wide')
    await shot('dashboard-open-400')
    await page.setViewportSize({ width: 1100, height: 800 })
    step('the toggle is the same node, with focus, across polls and Show less / expand')

    // Focus on Retry survives polls, on the same node.
    await tag('#shell-banner-retry-dev-1', 'retry-node')
    await page.focus('#shell-banner-retry-dev-1')
    await polls(3)
    assert.equal(await active(), 'shell-banner-retry-dev-1', 'Retry keeps keyboard focus across 3 polls')
    assert.equal(await tagOf('#shell-banner-retry-dev-1'), 'retry-node', 'the same Retry node')
    step('keyboard focus on Retry survives three polls')

    // Focus on Stop test survives too.
    await tag('#shell-light-test-stop', 'stop-node')
    await page.focus('#shell-light-test-stop')
    await polls(3)
    assert.equal(await active(), 'shell-light-test-stop', 'Stop test keeps keyboard focus across 3 polls')
    assert.equal(await tagOf('#shell-light-test-stop'), 'stop-node', 'the same Stop test node')
    step('keyboard focus on Stop test survives three polls')

    // A changed message replaces only its own row.
    const testRow = '.shell-banner-row:has(#shell-light-test-stop)'
    await tag(testRow, 'test-row')
    await tag('.shell-banner-row:has(#shell-banner-retry-dev-1)', 'old-error-row')
    assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-1', message: 'second message' })).status, 200)
    await page.locator('.shell-banner-row', { hasText: 'second message' }).waitFor({ timeout: 10_000 })
    assert.equal(await page.locator('.shell-banner-row', { hasText: 'first message' }).count(), 0, 'the old text is gone')
    assert.equal(await rows.count(), 2)
    assert.equal(await tagOf(testRow), 'test-row', 'the light-test row is the same node')
    assert.equal(await tagOf('.shell-banner-row:has(#shell-banner-retry-dev-1)'), null, 'the error row is a new node')
    assert.equal(await active(), 'shell-light-test-stop', 'focus stayed on Stop test through the other row\'s replacement')
    step('a changed message replaces only its own row')

    // Collapsed again, a changed message re-opens it.
    await toggle.click()
    await expectCollapsed('1 notice 1 error')
    assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-1', message: 'third message' })).status, 200)
    await page.locator('.shell-banner-row', { hasText: 'third message' }).waitFor({ timeout: 10_000 })
    await expectOpen()
    step('a changed message re-opens the collapsed shell')

    // The light test ends: a lone row stays open and can collapse; an arrival re-opens it.
    release()
    await api('POST', '/api/graph/test/revert', { session: 'agent-1' })
    await test.waitFor({ state: 'detached', timeout: 10_000 })
    await expectOpen()
    assert.equal(await rows.count(), 1)
    await toggle.click()
    await expectCollapsed('1 error')
    await polls(2)
    await expectCollapsed('1 error')
    assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-2', message: 'arrived' })).status, 200)
    await page.locator('.shell-banner-row', { hasText: 'arrived' }).waitFor({ timeout: 10_000 })
    await expectOpen()
    step('a lone row collapses to "1 error"; an arrival re-opens it')

    // The countdown is not a change: a Once test and two errors, collapsed, stay collapsed across ticks.
    assert.equal((await api('POST', '/api/graph/test', { session: 'agent-1' }, { 'X-Aurora-Client': 'mcp' })).status, 200, 'a Once test')
    const keepAgent = setInterval(() => void api('POST', '/api/graph/test/heartbeat', { session: 'agent-1' }).catch(() => {}), 1000)
    try {
      await page.locator('#shell-light-test-time').waitFor({ timeout: 10_000 })
      await toggle.click()
      await expectCollapsed('1 notice 2 errors')
      await page.waitForTimeout(5000)
      await expectCollapsed('1 notice 2 errors')
      assert.equal((await api('GET', '/api/state')).json.test.active, true, 'the Once test was still counting down')
      step('the light-test countdown ticking never re-opens the collapsed shell')
      // Recovery from the takeover is a new baseline: 3 rows come back collapsed, then 1 row comes back open.
      await toggle.click()
      await expectOpen()
      await page.route('**/api/state', (route) => route.abort())
      await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ timeout: 15_000 })
      assert.equal(await toggle.count(), 0, 'the takeover clears the shell')
      await page.unroute('**/api/state')
      await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ state: 'detached', timeout: 10_000 })
      await expectCollapsed('1 notice 2 errors')
      await toggle.click()
      await expectOpen()
      await page.route('**/api/state', (route) => route.abort())
      await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ timeout: 15_000 })
      clearInterval(keepAgent)
      await api('POST', '/api/graph/test/revert', { session: 'agent-1' })
      await api('POST', '/api/dev/errors/remove', { source: 'dev-2' })
      await page.unroute('**/api/state')
      await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ state: 'detached', timeout: 10_000 })
      await rows.first().waitFor({ timeout: 10_000 })
      await expectOpen()
      assert.equal(await rows.count(), 1, 'a lone row after recovery is open')
      step('recovery from the takeover re-baselines: collapsed with several rows, open with one')
    } finally {
      clearInterval(keepAgent)
    }
  } finally {
    release()
    await api('POST', '/api/graph/test/revert', { session: 'agent-1' }).catch(() => {})
    await api('DELETE', '/api/graph/drafts/agent-1').catch(() => {})
    await api('POST', '/api/dev/errors/remove', { source: 'dev-1' }).catch(() => {})
    await api('PUT', '/api/config', { activeEffectId: original }).catch(() => {})
    await browser.close()
  }
})
console.log('dashboard shell: all passed')
