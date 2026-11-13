// Aurora-9hqa.1: the Dashboard's error shell patches rows by key instead of rewriting innerHTML on
// every 3 s poll. Keyboard focus on Retry and on Stop test survives several polls (on the same DOM
// nodes), and a changed message (POST /api/dev/errors again, same source, new text) replaces only its
// own row: the other row's node is the one drawn before. `SHOTS=<dir>` saves a screenshot.
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
    await error.waitFor({ timeout: 10_000 })
    await test.waitFor({ timeout: 10_000 })
    assert.equal(await rows.count(), 2, 'a light test and one error: two full rows, none collapsed')
    assert.match(await rows.first().innerText(), /^An agent is testing/, 'notices first')

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
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/dashboard-shell.png` })
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
