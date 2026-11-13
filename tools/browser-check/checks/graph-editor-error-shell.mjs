// Aurora-s1t7.9: the editor's error shell is the Dashboard's. Rows from GET /api/state (a dev
// error), dismiss through POST /api/state/dismiss, the "Aurora has stopped" takeover (and the Test
// button off with it), the light-test row naming who tests and hidden for this tab's own, and the
// editor-supplied draft rows by the PUT's error code. Aurora-u8jx.5: the shell collapses as one
// (one toggle button, counts or Show less): 2+ rows at load start collapsed, a lone row open and
// collapsible, an arrival or a changed message re-opens, the light-test countdown does not, and the
// takeover's recovery is a new baseline. `SHOTS=<dir>` saves screenshots of the set (also at 400 wide).
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
  const toggle = () => slot.locator('#shell-banner-toggle')
  const toggleText = async () => (await toggle().innerText()).replace(/\s+/g, ' ').trim()
  const expectCollapsed = async (label) => {
    await page.waitForFunction((l) => { const t = document.querySelector('#shell-banner-toggle'); return t?.getAttribute('aria-expanded') === 'false' && t.innerText.replace(/\s+/g, ' ').trim() === l }, label, { timeout: 8000 }).catch(async () => assert.fail(`wanted the collapsed bar "${label}", got "${await slot.innerText().catch(() => '')}"`))
  }
  const expectOpen = async () => {
    await page.waitForFunction(() => document.querySelector('#shell-banner-toggle')?.getAttribute('aria-expanded') === 'true', null, { timeout: 8000 })
    assert.equal(await toggleText(), 'Show less')
  }
  const colorOf = (loc) => loc.evaluate((el) => getComputedStyle(el).color)
  const markColor = colorOf
  const toggleColor = () => colorOf(toggle().locator('.shell-count-error'))
  const RED = 'rgb(255, 107, 107)'
  const WHITE = 'rgb(255, 255, 255)'
  const header = () => page.locator('.editor-header')
  const testButton = () => page.getByRole('button', { name: 'Test on lights' })
  const session = () => page.evaluate(() => sessionStorage.getItem('aurora.graphEditor.session'))
  const errors = async () => (await api('GET', '/api/state')).json.errors ?? []
  const original = (await api('GET', '/api/config')).json.activeEffectId

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    assert.equal(await rows.count(), 0, 'no rows when nothing is wrong')
    assert.equal(await toggle().count(), 0, 'no toggle either')

    // One host-state row, read at once. A lone row starts open, with the toggle (Show less) below it.
    // The shell is the first element of the page, above the bar.
    assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-1', message: 'simulated error one' })).status, 200, 'dev error route (needs a dev build)')
    await rows.first().waitFor({ timeout: 8000 })
    assert.match(await rows.first().innerText(), /simulated error one/)
    assert.equal(await slot.evaluate((el) => el.nextElementSibling?.className.includes('editor-header') || el.parentElement.firstElementChild === el), true, 'the slot is the first element of the page')
    assert.ok((await slot.boundingBox()).y === 0 && (await slot.boundingBox()).y < (await header().boundingBox()).y, 'above the bar, at the top')
    assert.equal(await slot.evaluate((el) => getComputedStyle(el).position), 'sticky')
    assert.equal(await toggle().getAttribute('aria-expanded'), 'true')
    assert.equal(await toggleText(), 'Show less', 'a lone row is open and can collapse')
    assert.equal(await markColor(rows.first().locator('.shell-mark-error')), RED, 'the open error row carries the red circled-exclamation')
    await shot('a-one-row')
    step('a host-state error shows as one open row above the bar, with the red mark and Show less')

    // A lone row collapses by hand: the bar reads '1 error'.
    await toggle().click()
    await expectCollapsed('1 error')
    assert.equal(await toggle().getAttribute('aria-expanded'), 'false')
    await shot('a-one-collapsed')
    await toggle().click()
    await rows.first().waitFor()
    await expectOpen()
    step('a lone row can be collapsed to "1 error" and opened again')

    // A second row arrives while open: stays open (no snapshot), then Show less folds both.
    assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-2', message: 'simulated error two' })).status, 200)
    await rows.nth(1).waitFor({ timeout: 8000 })
    await expectOpen()
    await shot('b-two-expanded')
    await toggle().click()
    await expectCollapsed('2 errors')
    assert.equal(await rows.count(), 0, 'collapsed: only the bar')
    assert.equal(await markColor(toggle().locator('.shell-mark-error')), RED, 'the bar carries the red mark')
    assert.equal(await toggleColor(), RED, 'and the error count reads in the error tone')
    await shot('b-two-collapsed')
    // Polls leave it collapsed.
    await page.waitForTimeout(3500)
    await expectCollapsed('2 errors')
    step('two errors collapse to "2 errors" and stay collapsed across polls')

    // An arrival re-opens; a changed message re-opens; clearing a row (rows differ) leaves it open.
    assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-3', message: 'simulated error three' })).status, 200)
    await rows.nth(2).waitFor({ timeout: 8000 })
    await expectOpen()
    await toggle().click()
    await expectCollapsed('3 errors')
    assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-3', message: 'simulated error three, changed' })).status, 200)
    await rows.nth(2).waitFor({ timeout: 8000 })
    await expectOpen()
    assert.match(await slot.innerText(), /three, changed/)
    await api('POST', '/api/dev/errors/remove', { source: 'dev-3' })
    await page.waitForFunction(() => document.querySelectorAll('#shell-banner-slot .shell-banner-row').length === 2, null, { timeout: 8000 })
    await expectOpen()
    step('a new row and a changed message each re-open the collapsed shell')

    // Load with 2 errors: starts collapsed (the first /api/state reply is the baseline).
    await page.reload()
    await page.waitForSelector('.aurora-node')
    await expectCollapsed('2 errors')
    assert.equal(await rows.count(), 0)
    // Load with 1: open.
    await api('POST', '/api/dev/errors/remove', { source: 'dev-2' })
    await page.reload()
    await page.waitForSelector('.aurora-node')
    await rows.first().waitFor({ timeout: 8000 })
    await expectOpen()
    assert.equal(await rows.count(), 1)
    await api('POST', '/api/dev/errors', { source: 'dev-2', message: 'simulated error two' })
    await rows.nth(1).waitFor({ timeout: 8000 })
    await page.reload()
    await page.waitForSelector('.aurora-node')
    await expectCollapsed('2 errors')
    step('a load with two errors starts collapsed, a load with one starts open')

    // Dismiss goes through the daemon: it clears the row everywhere.
    await toggle().click()
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
    assert.equal(await toggle().count(), 0, 'no rows, no toggle: the state resets')
    step('dismiss posts /api/state/dismiss and the Dashboard shows the same remaining row')

    // The countdown is not a change: a Once light test and one error, collapsed, stay collapsed across ticks.
    const graph0 = (await api('GET', '/api/effects/builtin.video')).json.graph
    await api('PUT', '/api/graph/drafts/agent-1', { graph: graph0 })
    await api('POST', '/api/dev/errors', { source: 'dev-1', message: 'simulated error one' })
    assert.equal((await api('POST', '/api/graph/test', { session: 'agent-1' }, { 'X-Aurora-Client': 'mcp' })).status, 200, 'a Once test')
    const keepAgent = setInterval(() => void api('POST', '/api/graph/test/heartbeat', { session: 'agent-1' }).catch(() => {}), 1000)
    await page.locator('#shell-light-test-time').waitFor({ timeout: 8000 })
    await expectOpen()
    assert.equal(await markColor(rows.first().locator('.shell-mark-info')), WHITE, 'the light-test row carries the default-colour circled-info')
    await shot('e-notice-and-error-open')
    await toggle().click()
    await expectCollapsed('1 notice 1 error')
    assert.equal(await markColor(toggle().locator('.shell-mark-info')), WHITE, 'the notice mark is the default colour')
    await shot('e-notice-and-error-collapsed')
    // At 400 wide nothing clips or overflows, collapsed or open.
    await page.setViewportSize({ width: 400, height: 800 })
    const overflow = () => slot.evaluate((el) => el.scrollWidth - el.clientWidth)
    assert.ok((await overflow()) <= 0, 'the collapsed bar fits at 400 wide')
    await shot('e-collapsed-400')
    await toggle().click()
    await expectOpen()
    assert.ok((await overflow()) <= 0, 'the open rows fit at 400 wide')
    await shot('e-open-400')
    await toggle().click()
    await expectCollapsed('1 notice 1 error')
    await page.setViewportSize({ width: 1470, height: 900 })
    await page.waitForTimeout(5000)
    await expectCollapsed('1 notice 1 error')
    assert.equal((await api('GET', '/api/state')).json.test.active, true, 'the Once test was still counting down')
    clearInterval(keepAgent)
    await api('POST', '/api/graph/test/revert', { session: 'agent-1' })
    await api('DELETE', '/api/graph/drafts/agent-1')
    await api('POST', '/api/dev/errors/remove', { source: 'dev-1' })
    await rows.first().waitFor({ state: 'detached', timeout: 8000 })
    step('a Once light test joins the collapse as a notice, and its countdown ticking never re-opens it')

    // The light-test row: another session's test is named and offers Stop test; this tab's own is hidden.
    const graph = (await api('GET', '/api/effects/builtin.video')).json.graph
    await api('PUT', '/api/graph/drafts/agent-1', { graph })
    // A test whose holder stops sending heartbeats ends after a few seconds (heartbeat_lost), so the
    // stand-in agent and tab keep theirs going, as a real client does, while their rows are checked.
    const holdLights = (session) => {
      const timer = setInterval(() => void api('POST', '/api/graph/test/heartbeat', { session }).catch(() => {}), 1000)
      return () => clearInterval(timer)
    }
    assert.equal((await api('POST', '/api/graph/test', { session: 'agent-1', mode: 'live' }, { 'X-Aurora-Client': 'mcp' })).status, 200)
    const releaseAgent = holdLights('agent-1')
    await rows.first().waitFor({ timeout: 8000 })
    assert.match((await rows.first().innerText()).trim(), /^An agent is testing an effect on the lights\./)
    // One source for who holds the lights (useHostState): the Test button says Take over with the row, not up to 3 s apart.
    assert.equal(await page.getByRole('button', { name: 'Take over the lights' }).count(), 1, 'Take over appears with the shell row')
    // The button's tooltip names the holder (lightsInUseText), not the generic Test line.
    await page.getByRole('button', { name: 'Take over the lights' }).hover()
    const tip = page.getByRole('tooltip')
    await tip.waitFor({ timeout: 4000 })
    assert.equal((await tip.innerText()).trim(), 'Lights in use: an agent is testing', 'Take over tooltip names the holder')
    await shot('d-editor-light-test-agent')
    const dash2 = await browser.newPage({ viewport: { width: 900, height: 500 } })
    await dash2.goto(`${aurora}/`)
    await dash2.locator('.shell-banner-row', { hasText: 'An agent is testing an effect on the lights.' }).waitFor({ timeout: 8000 })
    if (process.env.SHOTS) await dash2.screenshot({ path: `${process.env.SHOTS}/d-dashboard-light-test-agent.png` })
    await dash2.close()
    releaseAgent()
    await api('POST', '/api/graph/test/revert', { session: 'agent-1' })
    await rows.first().waitFor({ state: 'detached', timeout: 8000 })
    assert.equal(await page.getByRole('button', { name: 'Take over the lights' }).count(), 0, 'Take over goes with the row')
    await api('PUT', '/api/graph/drafts/tab-2', { graph })
    assert.equal((await api('POST', '/api/graph/test', { session: 'tab-2', mode: 'live' })).status, 200)
    const releaseTab = holdLights('tab-2')
    await rows.first().waitFor({ timeout: 8000 })
    assert.match((await rows.first().innerText()).trim(), /^Another editor tab or window is testing an effect on the lights\./)
    await rows.first().getByRole('button', { name: 'Stop test' }).click()
    releaseTab()
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
    await page.waitForFunction(() => document.querySelector('#shell-banner-slot .shell-banner-row')?.innerText.trim() === "Couldn't check your last edit.", null, { timeout: 8000 }).catch(async () => assert.fail(`row text: ${await slot.innerText()}`))
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

    // Network failure: the takeover, and the Test button off with it; the rows are gone. Recovery is a
    // new baseline: two rows (open before the takeover) come back collapsed, one row comes back open.
    await api('POST', '/api/dev/errors', { source: 'dev-3', message: 'simulated error three' })
    await api('POST', '/api/dev/errors', { source: 'dev-4', message: 'simulated error four' })
    await rows.nth(1).waitFor({ timeout: 8000 })
    await expectOpen()
    await page.route('**/api/state', (route) => route.abort())
    await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ timeout: 12_000 })
    assert.equal(await page.locator('#shell-overlay-slot .overlay-panel button').count(), 0, 'heading only, no Retry')
    assert.equal(await rows.count(), 0, 'the takeover replaces the rows')
    assert.equal(await toggle().count(), 0, 'and the toggle')
    assert.equal(await header().getAttribute('data-preview'), 'Cannot reach Aurora', 'the Test button reads the same verdict')
    assert.equal(await testButton().isDisabled(), true)
    await shot('c-takeover')
    await page.unroute('**/api/state')
    await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ state: 'detached', timeout: 8000 })
    await expectCollapsed('2 errors')
    assert.equal(await rows.count(), 0, 'recovery with two rows is a new baseline: collapsed')
    // Again, with one row left when Aurora answers.
    await toggle().click()
    await expectOpen()
    await page.route('**/api/state', (route) => route.abort())
    await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ timeout: 12_000 })
    await api('POST', '/api/dev/errors/remove', { source: 'dev-4' })
    await page.unroute('**/api/state')
    await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ state: 'detached', timeout: 8000 })
    await rows.first().waitFor({ timeout: 8000 })
    await expectOpen()
    assert.equal(await rows.count(), 1, 'recovery with one row: open')
    await api('POST', '/api/dev/errors/remove', { source: 'dev-3' })
    step('an unreachable Aurora raises the takeover, turns the Test button off, and clears when /api/state answers, re-baselining the collapse')

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
    for (const s of ['dev-1', 'dev-2', 'dev-3', 'dev-4']) await api('POST', '/api/dev/errors/remove', { source: s }).catch(() => {})
    await api('PUT', '/api/config', { activeEffectId: original }).catch(() => {})
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await browser.close()
  }
})
console.log('graph-editor error shell: all passed')
