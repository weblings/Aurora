// Aurora-s1t7.9: the editor's error shell is the Dashboard's. Rows from GET /api/state (a dev
// error), dismiss through POST /api/state/dismiss, the "Aurora has stopped" takeover (and the Test
// button off with it), the light-test row naming who tests and hidden for this tab's own, and the
// editor-supplied draft rows by the PUT's error code. Aurora-u8jx.5: the shell collapses as one
// (one toggle button, counts or Show less): 2+ rows at load start collapsed, a lone row open and
// collapsible, an arrival or a changed message re-opens, the light-test countdown does not, and the
// takeover's recovery is a new baseline. Aurora-9hqa.4: LAN pairing requests (real ones, raised with
// POST /api/pairing/request) are notices in the editor's shell too: one already pending at load is
// baseline (no re-open; with another row it starts collapsed), one arriving re-opens a collapsed
// shell, and Approve and Deny reach the server and the row goes. Aurora-9hqa.2: arrivals pulse once and are announced through the page's one announcer (the toast stays silent); `SHOTS=<dir>` saves screenshots of the set (also at 400 wide).
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { makeEdit } from '../lib/editorMenu.mjs'
import { pairingApi } from '../lib/pairing.mjs'
import { fastPolls, finish, statePolls, stepLogger, until } from '../lib/waits.mjs'

// The dev-only /api/dev/errors routes need this in the app's environment.
process.env.AURORA_DEV_ERRORS = '1'
// The shell polls every 300 ms instead of 3 s (AURORA_DEV_POLL_MS=3000 for the shipped cadence); STEP=<text> stops after that step.
fastPolls()

await finish('graph-editor error shell', withEditorStack(async ({ editorUrl, aurora }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = stepLogger()
  const tracker = statePolls(page)
  // Counted /api/state answers: a step that proves nothing happens across polls waits for the polls.
  const polls = (n) => tracker.polls(n)
  const remaining = async () => (await api('GET', '/api/state')).json.test.confirmRemainingMs
  // The countdown has visibly ticked (server-side), over at least n polls.
  const ticked = async (n) => {
    const from = await remaining()
    await polls(n)
    await until(async () => (await remaining()) <= from - 1500, 'the countdown to tick')
  }
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
  const pairing = pairingApi(aurora)
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
    await polls(3)
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

    // Arrival spotlight observer (Aurora-9hqa.2), installed before the next load: a page-side log of every
    // data-new that appears or ends (with the computed animation, tint and shadow at that moment) and
    // every text the page's polite live region gets, so a 1.4 s pulse cannot be missed by polling.
    await page.addInitScript(() => {
      window.__pulses = []
      window.__said = []
      const note = (el) => {
        const cs = getComputedStyle(el)
        window.__pulses.push({ kind: 'add', key: el.getAttribute('data-key'), t: performance.now(), anim: cs.animationName, tint: cs.getPropertyValue('--shell-ping-tint').trim(), shadow: cs.boxShadow })
      }
      new MutationObserver((list) => {
        const region = document.querySelector('[data-announcer]')
        if (region && list.some((m) => m.target === region || region.contains(m.target)) && region.textContent) window.__said.push({ text: region.textContent, t: performance.now() })
        for (const m of list) {
          if (m.type === 'attributes' && m.attributeName === 'data-new') {
            if (m.target.hasAttribute('data-new')) note(m.target)
            else window.__pulses.push({ kind: 'end', key: m.target.getAttribute('data-key'), t: performance.now() })
          } else if (m.type === 'childList') {
            for (const n of m.addedNodes) {
              if (n.nodeType !== 1) continue
              for (const el of [n, ...n.querySelectorAll('[data-new]')]) if (el.hasAttribute('data-new')) note(el)
            }
          }
        }
      }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-new'] })
    })
    const spot = async () => page.evaluate(() => ({ pulses: window.__pulses.slice(), said: window.__said.map((x) => x.text) }))
    const adds = async () => (await spot()).pulses.filter((p) => p.kind === 'add')
    const ends = async () => (await spot()).pulses.filter((p) => p.kind === 'end')
    const waitFor = (kind, n) => page.waitForFunction(([k, count]) => window.__pulses.filter((p) => p.kind === k).length >= count, [kind, n], { timeout: 10_000 })
    const waitSaid = (n) => page.waitForFunction((count) => window.__said.length >= count, n, { timeout: 10_000 })
    // The toast is a live region too (role=status inside .toast): it must stay silent for shell rows.
    const toastText = () => page.locator('[role="status"]:not([data-announcer])').evaluateAll((els) => els.map((el) => el.textContent).join(''))
    const freeze = (selector) => page.evaluate((sel) => { const el = document.querySelector(sel); el.style.animationPlayState = 'paused'; el.style.animationDelay = '-300ms' }, selector)
    const thaw = (selector) => page.evaluate((sel) => { const el = document.querySelector(sel); el.style.cssText = ''; el.removeAttribute('data-new') }, selector)

    // Pairing requests (Aurora-9hqa.4). Real ones: POST /api/pairing/request is open to any caller.
    const reqRow = (r) => slot.locator('.shell-banner-row', { has: page.locator(`#shell-pairing-approve-${r.ref}`) })
    const waitRowGone = (r) => page.waitForFunction((id) => !document.getElementById(id), `shell-pairing-approve-${r.ref}`, { timeout: 8000 })
    const loaded = await pairing.raise('load')
    await api('POST', '/api/dev/errors', { source: 'dev-1', message: 'simulated error one' })
    await page.reload()
    await page.waitForSelector('.aurora-node')
    // Already pending at load, with another row: baseline, so 2 rows start collapsed and nothing re-opens.
    await expectCollapsed('1 notice 1 error')
    assert.equal(await rows.count(), 0)
    assert.equal(await markColor(toggle().locator('.shell-mark-info')), WHITE, 'the request counts under the default-colour circled-info')
    await shot('p-collapsed')
    await page.setViewportSize({ width: 400, height: 800 })
    assert.ok((await slot.evaluate((el) => el.scrollWidth - el.clientWidth)) <= 0, 'the collapsed bar fits at 400 wide')
    await shot('p-collapsed-400')
    await page.setViewportSize({ width: 1470, height: 900 })
    await polls(4)
    await expectCollapsed('1 notice 1 error')
    step('a request already pending at load is baseline: it starts collapsed with the error and polls never re-open it')

    // Open it: the row carries the code the requester holds, a circled-info and both buttons.
    await toggle().click()
    await expectOpen()
    assert.equal(await rows.count(), 2)
    assert.match((await rows.first().innerText()).trim(), /^Pair a device with Aurora\?/, 'notices first, above the error')
    const loadRow = reqRow(loaded)
    assert.match(await loadRow.innerText(), new RegExp(`Device: ${loaded.name}`))
    assert.match(await loadRow.innerText(), new RegExp(`Code: ${loaded.code}`), "the row shows the requester's code")
    assert.match(await loadRow.innerText(), /Access: Read\. View only\./)
    assert.equal(await markColor(loadRow.locator('.shell-mark-info')), WHITE)
    await shot('p-open')
    await page.setViewportSize({ width: 400, height: 800 })
    assert.ok((await slot.evaluate((el) => el.scrollWidth - el.clientWidth)) <= 0, 'the open request fits at 400 wide')
    await shot('p-open-400')
    await page.setViewportSize({ width: 1470, height: 900 })
    step('an open request row names the device, code and access, notices above errors')

    // Collapsed again, a new request arrives while this tab sits in the editor: it re-opens.
    await toggle().click()
    await expectCollapsed('1 notice 1 error')
    const arrived = await pairing.raise('arrive')
    await reqRow(arrived).waitFor({ timeout: 8000 })
    await expectOpen()
    assert.equal(await rows.count(), 3)
    await toggle().click()
    await expectCollapsed('2 notices 1 error')
    step('a request arriving in the editor re-opens the collapsed shell; the bar counts "2 notices 1 error"')

    // Approve and Deny reach the server; the row goes after the re-read.
    await toggle().click()
    await expectOpen()
    await page.locator(`#shell-pairing-approve-${arrived.ref}`).click()
    await waitRowGone(arrived)
    const approved = await pairing.outcome(arrived.pollKey)
    assert.equal(approved.status, 200, 'the server approved it')
    assert.equal(approved.json.state, 'approved')
    assert.ok((await pairing.call('GET', '/api/pairing/devices')).json.devices.some((d) => d.name === arrived.name), 'a paired device was made')
    await page.locator(`#shell-pairing-deny-${loaded.ref}`).click()
    await waitRowGone(loaded)
    assert.equal((await pairing.outcome(loaded.pollKey)).status, 403, 'the server denied it')
    assert.equal((await pairing.pending()).filter((p) => p.name.startsWith('bc-9hqa4')).length, 0, 'nothing left pending')
    assert.equal(await rows.count(), 1, 'only the error row remains')
    await pairing.cleanup()
    await api('POST', '/api/dev/errors/remove', { source: 'dev-1' })
    await rows.first().waitFor({ state: 'detached', timeout: 8000 })
    step('Approve and Deny from the editor reach the server (approved device, denied poll) and the row goes')

    // A lone request already pending at load starts open (a lone row), and a request does not lapse unseen.
    const lone = await pairing.raise('lone')
    await page.reload()
    await page.waitForSelector('.aurora-node')
    await reqRow(lone).waitFor({ timeout: 8000 })
    await expectOpen()
    await pairing.cleanup()
    await waitRowGone(lone)
    await toggle().waitFor({ state: 'detached', timeout: 8000 })
    step('a lone request at load starts open, and clears when it is decided elsewhere')

    // Arrival spotlight (Aurora-9hqa.2).
    const pre = await pairing.raise('pre')
    await page.reload()
    await page.waitForSelector('.aurora-node')
    await page.locator(`#shell-pairing-approve-${pre.ref}`).waitFor({ timeout: 8000 })
    await polls(4)
    let seen = await spot()
    assert.deepEqual(seen.pulses, [], 'a request pending at load does not pulse')
    assert.deepEqual(seen.said, [], 'and is not announced')
    assert.equal(await page.locator('[data-announcer]').count(), 1, 'the editor has the one announcer')
    step('load: a request already pending does not pulse and is not announced')

    assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-spot', message: 'spot one' })).status, 200)
    await waitFor('add', 1)
    await waitFor('end', 1)
    seen = await spot()
    assert.equal(seen.pulses.length, 2, 'one pulse: one add and one end')
    const [added, ended] = seen.pulses
    assert.equal(added.key, 'error:dev-spot:spot one', 'only the arriving row pulses (the request already there does not)')
    assert.equal(added.anim, 'shell-ping')
    assert.equal(added.tint, '#ff6b6b', 'an error row is tinted error red')
    assert.ok(ended.t - added.t > 1200 && ended.t - added.t < 2300, `data-new clears after the 1375 ms pulse (was ${Math.round(ended.t - added.t)} ms)`)
    await waitSaid(1)
    assert.deepEqual((await spot()).said, ['spot one'], 'announced once, in words')
    assert.equal(await toastText(), '', 'the toast says nothing for a shell row')
    await polls(4)
    assert.equal((await adds()).length, 1, 'later polls do not pulse it again')
    assert.deepEqual((await spot()).said, ['spot one'], 'or announce it again')
    step('an arriving error pulses once (error red, ~1.4 s), only that row, and is announced once through the page announcer')

    assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-spot', message: 'spot two' })).status, 200)
    await waitFor('add', 2)
    await waitFor('end', 2)
    assert.equal((await adds())[1].key, 'error:dev-spot:spot two')
    await waitSaid(2)
    assert.deepEqual((await spot()).said, ['spot one', 'spot two'])
    step('a changed message pulses and is announced')

    const spotReq = await pairing.raise('spot')
    await waitFor('add', 3)
    const reqAdd = (await adds())[2]
    assert.equal(reqAdd.key, `pairing:${spotReq.ref}`)
    assert.equal(reqAdd.anim, 'shell-ping')
    assert.equal(reqAdd.tint, '', 'a notice keeps the default ring colour')
    await waitSaid(3)
    assert.equal((await spot()).said[2], `Pair a device with Aurora? ${spotReq.name}.`)
    await waitFor('end', 3)
    step('a real pairing request pulses once with the default ring and is announced with its device name')

    await expectOpen()
    await toggle().click()
    await expectCollapsed('2 notices 1 error')
    const before = (await adds()).length
    assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-spot-b', message: 'spot three' })).status, 200)
    await waitFor('add', before + 1)
    await expectOpen()
    assert.equal((await adds()).length, before + 1, 'one pulse')
    assert.equal((await adds()).at(-1).key, 'error:dev-spot-b:spot three')
    await waitFor('end', before + 1)
    assert.equal((await adds()).length, before + 1, 'the rows that came back with the re-open never pulsed')
    step('an arrival while collapsed re-opens the shell with one pulse: the rows already there stay still')

    // Another session's Once light test: pulses and is announced when its key arrives, not on the countdown.
    const saidBefore = (await spot()).said.length
    const addsBefore = (await adds()).length
    await api('PUT', '/api/graph/drafts/agent-1', { graph: (await api('GET', '/api/effects/builtin.video')).json.graph })
    assert.equal((await api('POST', '/api/graph/test', { session: 'agent-1' }, { 'X-Aurora-Client': 'mcp' })).status, 200)
    const keepTest = setInterval(() => void api('POST', '/api/graph/test/heartbeat', { session: 'agent-1' }).catch(() => {}), 1000)
    try {
      await page.locator('#shell-light-test-time').waitFor({ timeout: 8000 })
      await waitFor('add', addsBefore + 1)
      assert.equal((await adds()).at(-1).key, 'test:agent-1:once')
      await waitSaid(saidBefore + 1)
      assert.equal((await spot()).said.at(-1), 'An agent is testing an effect on the lights.')
      await ticked(3)
      assert.equal((await adds()).length, addsBefore + 1, 'the ticking countdown never pulses')
      assert.equal((await spot()).said.length, saidBefore + 1, 'and is never announced')
      step('a light test pulses and is announced once when it arrives, not on its countdown')

      const addsAtDown = (await adds()).length
      const saidAtDown = (await spot()).said.length
      await page.route('**/api/state', (route) => route.abort())
      await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ timeout: 12_000 })
      await page.unroute('**/api/state')
      await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ state: 'detached', timeout: 8000 })
      await toggle().waitFor({ timeout: 8000 })
      await polls(4)
      assert.equal((await adds()).length, addsAtDown, 'recovery: nothing pulses')
      assert.equal((await spot()).said.length, saidAtDown, 'recovery: nothing is announced')
      step('recovery from the takeover does not pulse or announce')
    } finally {
      clearInterval(keepTest)
      await api('POST', '/api/graph/test/revert', { session: 'agent-1' }).catch(() => {})
      await api('DELETE', '/api/graph/drafts/agent-1').catch(() => {})
    }

    // Reduced motion: a held 2px ring, no pulse.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const rmBefore = (await adds()).length
    assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-spot', message: 'spot reduced' })).status, 200)
    await waitFor('add', rmBefore + 1)
    const held = (await adds()).at(-1)
    assert.equal(held.anim, 'shell-ping-hold', 'reduced motion: the held ring, not the pulse')
    assert.ok(held.shadow.includes('2px'), `a 2px ring (${held.shadow})`)
    await waitFor('end', (await ends()).length + 1)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    step('reduced motion: a held 2px ring, not the pulse, cleared after the same time')

    if (process.env.SHOTS) {
      const sel = '.shell-banner-row[data-new]'
      await api('POST', '/api/dev/errors', { source: 'dev-spot', message: 'spot shot' })
      await page.waitForSelector(sel, { timeout: 8000 })
      await freeze(sel)
      await shot('editor-pulse-error')
      await thaw(sel)
      await pairing.raise('shot')
      await page.waitForSelector(sel, { timeout: 8000 })
      await freeze(sel)
      await shot('editor-pulse-notice')
      await thaw(sel)
    }
    await pairing.cleanup()
    for (const src of ['dev-spot', 'dev-spot-b']) await api('POST', '/api/dev/errors/remove', { source: src })
    await toggle().waitFor({ state: 'detached', timeout: 8000 })

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
    await ticked(3)
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
    await polls(3)
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
    const noteSaid = (await spot()).said.length
    await refuse(429, 'too_many_drafts')
    await makeEdit(page)
    const note = slot.locator('.shell-banner-row', { hasText: "Couldn't check your last edit: too many editors are open. Close one to continue." })
    await note.waitFor({ timeout: 8000 })
    assert.equal(await note.locator('button').count(), 0, 'no Retry, no X')
    // An editor-only note row is announced once, by the page announcer, and the toast stays silent (Aurora-9hqa.2).
    const noteText = "Couldn't check your last edit: too many editors are open. Close one to continue."
    await page.waitForFunction((t) => window.__said.some((x) => x.text === t), noteText, { timeout: 10_000 })
    await polls(3)
    const noteSays = (await spot()).said.slice(noteSaid).filter((t) => t === noteText)
    assert.equal(noteSays.length, 1, 'announced once')
    assert.equal(await toastText(), '', 'and the toast says nothing for it')
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
    const tooLarge = page.locator('.editor-problem-list li', { hasText: 'Whole graph' }).filter({ hasText: "Couldn't check your last edit: the graph is too large (over 256 KB)." })
    await tooLarge.waitFor()
    assert.equal(await tooLarge.locator('button').count(), 0, 'a Whole graph row with no fitting action has no button (Aurora-u8jx.2)')
    await page.keyboard.press('Escape')
    await clear()
    await nudge()
    await page.locator('.editor-problems-chip').waitFor({ state: 'detached', timeout: 8000 })
    step('429 and 400 are editor-only shell rows, 413 is a Whole graph problem on the chip, and a later send clears them')

    // Whole graph rows by code (Aurora-u8jx.2): an unknown Dashboard control node opens the controls drawer; a cycle has no button.
    await page.route('**/api/graph/drafts/*', (route) => (route.request().method() === 'PUT'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ valid: false, errors: [
        { node: null, code: 'control_node_unknown', message: 'server control', options: [] },
        { node: null, code: 'graph_cycle', message: 'server cycle' },
      ] }) })
      : route.continue()))
    await nudge()
    const wholeChip = page.locator('.editor-problems-chip', { hasText: /2 problems/ })
    await wholeChip.waitFor({ timeout: 8000 })
    await wholeChip.click()
    const ctlRow = page.locator('.editor-problem-list li', { hasText: 'Dashboard control' })
    const loopRow = page.locator('.editor-problem-list li', { hasText: 'loop back' })
    await ctlRow.waitFor()
    assert.equal(await loopRow.locator('button').count(), 0, 'a cycle has no action')
    await ctlRow.getByRole('button', { name: 'Open controls' }).click()
    await page.getByRole('button', { name: /Dashboard controls/, expanded: true }).waitFor({ timeout: 5000 })
    await clear()
    await nudge()
    await page.locator('.editor-problems-chip').waitFor({ state: 'detached', timeout: 8000 })
    step('a Whole graph row has an action only when its code fits one: unknown control node opens Dashboard controls, a cycle has none')

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
    await pairing.cleanup().catch(() => {})
    for (const s of ['dev-1', 'dev-2', 'dev-3', 'dev-4', 'dev-spot', 'dev-spot-b']) await api('POST', '/api/dev/errors/remove', { source: s }).catch(() => {})
    await api('PUT', '/api/config', { activeEffectId: original }).catch(() => {})
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await browser.close()
  }
}))
