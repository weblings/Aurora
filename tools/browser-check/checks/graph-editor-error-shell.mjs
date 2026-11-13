// Aurora-s1t7.9: the editor's error shell is the Dashboard's. Rows from GET /api/state (a dev
// error), the collapsed "N problems" summary and Show less, dismiss through POST /api/state/dismiss,
// the "Aurora has stopped" takeover (and the Test button off with it), the light-test row naming who
// tests and hidden for this tab's own, and the editor-supplied draft rows by the PUT's error code.
// `SHOTS=<dir>` saves screenshots of the set.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { makeEdit } from '../lib/editorMenu.mjs'

// The dev-only /api/dev/errors routes need this in the app's environment.
process.env.AURORA_DEV_ERRORS = '1'

await withEditorStack(async ({ editorUrl, aurora }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const shot = (name) => (process.env.SHOTS ? page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }) : null)
  const api = async (method, path, body, headers = {}) => {
    const res = await fetch(`${aurora}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, json: await res.json().catch(() => ({})) }
  }
  const slot = page.locator('#shell-banner-slot')
  const rows = slot.locator('.shell-banner-row')
  const header = () => page.locator('.editor-header')
  const testButton = () => page.getByRole('button', { name: 'Test on lights' })
  const session = () => page.evaluate(() => sessionStorage.getItem('aurora.graphEditor.session'))
  const errors = async () => (await api('GET', '/api/state')).json.errors ?? []
  const original = (await api('GET', '/api/config')).json.activeEffectId

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    assert.equal(await rows.count(), 0, 'no rows when nothing is wrong')

    // One host-state row, read at once. The shell is the first element of the page, above the bar.
    assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-1', message: 'simulated error one' })).status, 200, 'dev error route (needs a dev build)')
    await rows.first().waitFor({ timeout: 8000 })
    assert.match(await rows.first().innerText(), /simulated error one/)
    assert.equal(await slot.evaluate((el) => el.nextElementSibling?.className.includes('editor-header') || el.parentElement.firstElementChild === el), true, 'the slot is the first element of the page')
    assert.ok((await slot.boundingBox()).y === 0 && (await slot.boundingBox()).y < (await header().boundingBox()).y, 'above the bar, at the top')
    assert.equal(await slot.evaluate((el) => getComputedStyle(el).position), 'sticky')
    assert.equal(await slot.locator('.shell-banner-summary').count(), 0, 'one row shows in full')
    await shot('a-one-row')
    step('a host-state error shows as one full row above the bar')

    // Two: collapsed summary, expand, Show less.
    assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-2', message: 'simulated error two' })).status, 200)
    await slot.getByRole('button', { name: /2 problems/ }).waitFor({ timeout: 8000 })
    assert.equal(await rows.count(), 0, 'collapsed: only the summary')
    await shot('b-two-collapsed')
    await slot.getByRole('button', { name: /2 problems/ }).click()
    await rows.nth(1).waitFor()
    await slot.getByRole('button', { name: /Show less/ }).waitFor()
    await shot('b-two-expanded')
    await slot.getByRole('button', { name: /Show less/ }).click()
    await slot.getByRole('button', { name: /2 problems/ }).waitFor()
    step('two errors collapse to "2 problems"; the summary expands and Show less folds it back')

    // Dismiss goes through the daemon: it clears the row everywhere.
    await slot.getByRole('button', { name: /2 problems/ }).click()
    await slot.locator('#shell-banner-dismiss-dev-1').click()
    await page.waitForFunction(() => !document.querySelector('#shell-banner-dismiss-dev-1'), null, { timeout: 8000 })
    assert.deepEqual((await errors()).map((e) => e.source), ['dev-2'], 'dismissed on the daemon')
    const dash = await browser.newPage()
    await dash.goto(`${aurora}/`)
    await dash.locator('.shell-banner-row', { hasText: 'simulated error two' }).waitFor({ timeout: 8000 })
    assert.equal(await dash.locator('.shell-banner-row', { hasText: 'simulated error one' }).count(), 0, 'the Dashboard agrees')
    await dash.close()
    await api('POST', '/api/dev/errors/remove', { source: 'dev-2' })
    await api('POST', '/api/dev/errors/remove', { source: 'dev-1' })
    await rows.first().waitFor({ state: 'detached', timeout: 8000 })
    step('dismiss posts /api/state/dismiss and the Dashboard shows the same remaining row')

    // The light-test row: another session's test is named and offers Stop test; this tab's own is hidden.
    const graph = (await api('GET', '/api/effects/builtin.video')).json.graph
    await api('PUT', '/api/graph/drafts/agent-1', { graph })
    assert.equal((await api('POST', '/api/graph/test', { session: 'agent-1', mode: 'live' }, { 'X-Aurora-Client': 'mcp' })).status, 200)
    await rows.first().waitFor({ timeout: 8000 })
    assert.match(await rows.first().innerText(), /^An agent is testing an effect on the lights\./)
    await shot('d-editor-light-test-agent')
    const dash2 = await browser.newPage({ viewport: { width: 900, height: 500 } })
    await dash2.goto(`${aurora}/`)
    await dash2.locator('.shell-banner-row', { hasText: 'An agent is testing an effect on the lights.' }).waitFor({ timeout: 8000 })
    if (process.env.SHOTS) await dash2.screenshot({ path: `${process.env.SHOTS}/d-dashboard-light-test-agent.png` })
    await dash2.close()
    await api('POST', '/api/graph/test/revert', { session: 'agent-1' })
    await rows.first().waitFor({ state: 'detached', timeout: 8000 })
    await api('PUT', '/api/graph/drafts/tab-2', { graph })
    assert.equal((await api('POST', '/api/graph/test', { session: 'tab-2', mode: 'live' })).status, 200)
    await rows.first().waitFor({ timeout: 8000 })
    assert.match(await rows.first().innerText(), /^Another editor tab or window is testing an effect on the lights\./)
    await rows.first().getByRole('button', { name: 'Stop test' }).click()
    await rows.first().waitFor({ state: 'detached', timeout: 8000 })
    assert.equal((await api('GET', '/api/state')).json.test.active, false, 'Stop test ended it')
    // This tab's own test: Stop on the Test button, no shell row.
    await testButton().click()
    await page.getByRole('button', { name: 'Stop the test' }).waitFor()
    await page.waitForTimeout(4000)
    assert.equal((await api('GET', '/api/state')).json.test.holder.session, await session())
    assert.equal(await rows.count(), 0, "this tab's own test is not a shell row")
    await page.getByRole('button', { name: 'Stop the test' }).click()
    step('a light-test row names an agent or another editor tab, Stop test works, and the tab\'s own test shows no row')

    // Draft refusals, by the PUT's error code. Routes stand in for the server's answers.
    const refuse = (status, error) => page.route('**/api/graph/drafts/*', (route) => (route.request().method() === 'PUT' ? route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ succeeded: false, error }) }) : route.continue()))
    const clear = () => page.unroute('**/api/graph/drafts/*')
    // Undo and Redo each change the document, so each one sends a new draft.
    let undone = false
    const nudge = async () => {
      await page.getByRole('button', { name: undone ? 'Redo' : 'Undo', exact: true }).click()
      undone = !undone
    }
    await refuse(429, 'too_many_drafts')
    await makeEdit(page)
    const note = slot.locator('.shell-banner-row', { hasText: "Couldn't check your last edit: too many editors are open. Close one to continue." })
    await note.waitFor({ timeout: 8000 })
    assert.equal(await note.locator('button').count(), 0, 'no Retry, no X')
    await clear()
    await refuse(400, 'invalid_session')
    await nudge()
    await rows.first().waitFor({ timeout: 8000 })
    await page.waitForFunction(() => document.querySelector('#shell-banner-slot')?.innerText.trim() === "Couldn't check your last edit.", null, { timeout: 8000 }).catch(async () => assert.fail(`row text: ${await slot.innerText()}`))
    assert.equal(await rows.count(), 1, 'the row changed with the code')
    await clear()
    await refuse(413, 'draft_too_large')
    await nudge()
    await rows.first().waitFor({ state: 'detached', timeout: 8000 })
    await page.locator('.editor-problems-chip', { hasText: /1 problem/ }).click()
    await page.locator('.editor-problem-list li', { hasText: 'Whole graph' }).filter({ hasText: "Couldn't check your last edit: the graph is too large (over 256 KB)." }).waitFor()
    await page.keyboard.press('Escape')
    await clear()
    await nudge()
    await page.locator('.editor-problems-chip').waitFor({ state: 'detached', timeout: 8000 })
    step('429 and 400 are editor-only shell rows, 413 is a Whole graph problem on the chip, and a later send clears them')

    // Network failure: the takeover, and the Test button off with it; the rows are gone.
    await api('POST', '/api/dev/errors', { source: 'dev-3', message: 'simulated error three' })
    await rows.first().waitFor({ timeout: 8000 })
    await page.route('**/api/state', (route) => route.abort())
    await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ timeout: 12_000 })
    assert.equal(await page.locator('#shell-overlay-slot .overlay-panel button').count(), 0, 'heading only, no Retry')
    assert.equal(await rows.count(), 0, 'the takeover replaces the rows')
    assert.equal(await header().getAttribute('data-preview'), 'Cannot reach Aurora', 'the Test button reads the same verdict')
    assert.equal(await testButton().isDisabled(), true)
    await shot('c-takeover')
    await page.unroute('**/api/state')
    await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ state: 'detached', timeout: 8000 })
    await rows.first().waitFor({ timeout: 8000 })
    await api('POST', '/api/dev/errors/remove', { source: 'dev-3' })
    step('an unreachable Aurora raises the takeover, turns the Test button off, and clears when /api/state answers')

    // A load that fails while Aurora is gone runs again on recovery.
    await page.route('**/api/state', (route) => route.abort())
    await page.route('**/api/nodes', (route) => route.abort())
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ timeout: 12_000 })
    await page.unroute('**/api/state')
    await page.unroute('**/api/nodes')
    await page.waitForSelector('.aurora-node', { timeout: 12_000 })
    step('an editor opened while Aurora is unreachable shows the takeover, then loads when it answers')
  } finally {
    await api('POST', '/api/graph/test/revert', { session: 'agent-1' }).catch(() => {})
    await api('POST', '/api/graph/test/revert', { session: 'tab-2' }).catch(() => {})
    for (const s of ['agent-1', 'tab-2']) await api('DELETE', `/api/graph/drafts/${s}`).catch(() => {})
    for (const s of ['dev-1', 'dev-2', 'dev-3']) await api('POST', '/api/dev/errors/remove', { source: s }).catch(() => {})
    await api('PUT', '/api/config', { activeEffectId: original }).catch(() => {})
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await browser.close()
  }
})
console.log('graph-editor error shell: all passed')
