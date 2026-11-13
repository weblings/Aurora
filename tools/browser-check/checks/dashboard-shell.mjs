// Aurora-9hqa.1: the Dashboard's error shell patches rows by key instead of rewriting innerHTML on
// every 3 s poll. Keyboard focus on Retry and on Stop test survives several polls (on the same DOM
// nodes), and a changed message (POST /api/dev/errors again, same source, new text) replaces only its
// own row: the other row's node is the one drawn before. Aurora-u8jx.5: the shell collapses as one:
// the first /api/state reply is the baseline (two rows start collapsed, one starts open), the one
// toggle button is the same node in both states and keeps focus across polls and toggles, a lone row
// collapses, an arrival or a changed message re-opens, a Once light test's countdown does not, and
// recovery from the takeover re-baselines. Aurora-9hqa.4: LAN pairing requests (real ones, raised
// with POST /api/pairing/request) are notices inside the collapse: one already pending at load is
// baseline (2+ rows start collapsed, a lone one open), one arriving re-opens, Deny reaches the server.
// Aurora-9hqa.2: arrivals pulse once and are announced (see the last block). `SHOTS=<dir>` saves screenshots (also at 400 wide).
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withAuroraStack } from '../lib/stack.mjs'
import { pairingApi } from '../lib/pairing.mjs'

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
  const pairing = pairingApi(aurora)
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

      // Pairing requests (Aurora-9hqa.4).
      const reqRow = (r) => page.locator('.shell-banner-row', { has: page.locator(`#shell-pairing-approve-${r.ref}`) })
      const loaded = await pairing.raise('load')
      await api('POST', '/api/dev/errors', { source: 'dev-1', message: 'pair one' })
      await page.reload()
      await expectCollapsed('1 notice 1 error')
      await polls(3)
      await expectCollapsed('1 notice 1 error')
      assert.equal(await markColor(toggle.locator('.shell-mark-info')), WHITE)
      await shot('dashboard-pairing-collapsed')
      await page.setViewportSize({ width: 400, height: 800 })
      assert.ok((await overflow()) <= 0, 'the collapsed bar fits at 400 wide')
      await shot('dashboard-pairing-collapsed-400')
      await page.setViewportSize({ width: 1100, height: 800 })
      step('a request already pending at load is baseline: it starts collapsed with the error and polls never re-open it')
      await toggle.click()
      await expectOpen()
      assert.match((await rows.first().innerText()).trim(), /^Pair a device with Aurora\?/, 'notices first')
      assert.match(await reqRow(loaded).innerText(), new RegExp(`Code: ${loaded.code}`))
      assert.equal(await markColor(reqRow(loaded).locator('.shell-mark-info')), WHITE, 'the request carries the circled-info')
      await shot('dashboard-pairing-open')
      await page.setViewportSize({ width: 400, height: 800 })
      assert.ok((await overflow()) <= 0, 'the open request fits at 400 wide')
      await shot('dashboard-pairing-open-400')
      await page.setViewportSize({ width: 1100, height: 800 })
      await toggle.click()
      await expectCollapsed('1 notice 1 error')
      const arrived = await pairing.raise('arrive')
      await reqRow(arrived).waitFor({ timeout: 10_000 })
      await expectOpen()
      await toggle.click()
      await expectCollapsed('2 notices 1 error')
      step('a request arriving re-opens the collapsed shell; the bar counts "2 notices 1 error"')
      await toggle.click()
      await expectOpen()
      await page.locator(`#shell-pairing-deny-${arrived.ref}`).click()
      await page.waitForFunction((id) => !document.getElementById(id), `shell-pairing-approve-${arrived.ref}`, { timeout: 10_000 })
      assert.equal((await pairing.outcome(arrived.pollKey)).status, 403, 'the server denied it')
      await pairing.cleanup()
      await api('POST', '/api/dev/errors/remove', { source: 'dev-1' })
      await rows.first().waitFor({ state: 'detached', timeout: 10_000 })
      // A lone request at load starts open.
      const lone = await pairing.raise('lone')
      await page.reload()
      await reqRow(lone).waitFor({ timeout: 10_000 })
      await expectOpen()
      step('Deny reaches the server and the row goes; a lone request at load starts open')

      // Arrival spotlight (Aurora-9hqa.2). A page-side observer logs every data-new that appears or
      // ends (with the computed animation, tint and shadow at that moment) and every text the polite
      // live region gets, so a pulse that lasts 1.4 s cannot be missed by polling.
      await page.addInitScript(() => {
        window.__pulses = []
        window.__said = []
        const note = (el) => {
          const cs = getComputedStyle(el)
          window.__pulses.push({ kind: 'add', key: el.getAttribute('data-key'), t: performance.now(), anim: cs.animationName, tint: cs.getPropertyValue('--shell-ping-tint').trim(), shadow: cs.boxShadow })
        }
        new MutationObserver((list) => {
          const region = document.getElementById('shell-announcer')
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
      const waitFor = (kind, n) => page.waitForFunction(([k, count]) => window.__pulses.filter((p) => p.kind === k).length >= count, [kind, n], { timeout: 10_000 })
      const waitSaid = (n) => page.waitForFunction((count) => window.__said.length >= count, n, { timeout: 10_000 })
      // Freezes the pulse at ~20% and screenshots it, then lets it end: only when SHOTS is set.
      const freeze = async (selector) => page.evaluate((sel) => { const el = document.querySelector(sel); el.style.animationPlayState = 'paused'; el.style.animationDelay = '-300ms' }, selector)
      const thaw = async (selector) => page.evaluate((sel) => { const el = document.querySelector(sel); el.style.cssText = ''; el.removeAttribute('data-new') }, selector)

      await pairing.cleanup()
      const pre = await pairing.raise('pre')
      await page.reload()
      await page.locator(`#shell-pairing-approve-${pre.ref}`).waitFor({ timeout: 10_000 })
      await polls(3)
      let seen = await spot()
      assert.deepEqual(seen.pulses, [], 'a request pending at load does not pulse')
      assert.deepEqual(seen.said, [], 'and is not announced')
      assert.equal(await page.locator('#shell-announcer').getAttribute('role'), 'status')
      assert.equal(await page.locator('#shell-announcer').getAttribute('aria-live'), 'polite')
      assert.equal(await page.locator('#shell-banner-slot #shell-announcer').count(), 0, 'the live region is outside the slot the patch rewrites')
      step('load: a request already pending does not pulse and is not announced; the live region is in the page')

      // An error arrives: one pulse on that row only, error red, announced, cleared after ~1.4 s.
      assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-spot', message: 'spot one' })).status, 200)
      await waitFor('add', 1)
      await waitFor('end', 1)
      seen = await spot()
      assert.equal(seen.pulses.length, 2, 'one pulse: one add and one end')
      const [added, ended] = seen.pulses
      assert.equal(added.key, 'error:dev-spot:spot one', 'only the arriving row pulses (the request already there does not)')
      assert.equal(added.anim, 'shell-ping', 'the row runs the shared keyframes')
      assert.equal(added.tint, '#ff6b6b', 'an error row is tinted error red')
      assert.ok(ended.t - added.t > 1200 && ended.t - added.t < 1900, `data-new clears after the 1375 ms pulse (was ${Math.round(ended.t - added.t)} ms)`)
      assert.equal(await page.locator('#shell-banner-slot [data-new]').count(), 0)
      await waitSaid(1)
      assert.deepEqual((await spot()).said, ['spot one'], 'announced once, in words')
      await polls(2)
      assert.equal((await adds()).length, 1, 'later polls do not pulse it again')
      assert.deepEqual((await spot()).said, ['spot one'], 'or announce it again')
      step('an arriving error pulses once (error red, ~1.4 s), only that row, and is announced once')

      // A changed message is a new row: it pulses and is announced.
      assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-spot', message: 'spot two' })).status, 200)
      await waitFor('add', 2)
      await waitFor('end', 2)
      assert.equal((await adds())[1].key, 'error:dev-spot:spot two')
      await waitSaid(2)
      assert.deepEqual((await spot()).said, ['spot one', 'spot two'])
      step('a changed message pulses and is announced')

      // A real pairing request arrives: a notice, so a default ring; announced with the device name.
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

      // Collapsed, an arrival re-opens the shell in the same render: it pulses, the rows already there do not.
      await expectOpen()
      await toggle.click()
      await expectCollapsed('2 notices 1 error')
      const before = (await adds()).length
      assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-spot-b', message: 'spot three' })).status, 200)
      await waitFor('add', before + 1)
      await expectOpen()
      assert.equal((await adds()).length, before + 1, 'one pulse')
      assert.equal((await adds()).at(-1).key, 'error:dev-spot-b:spot three')
      assert.ok((await rows.count()) >= 3, 'the collapsed rows are drawn again')
      await waitFor('end', before + 1)
      assert.equal((await adds()).length, before + 1, 'the rows that came back with the re-open never pulsed')
      step('an arrival while collapsed re-opens the shell with one pulse: the rows already there stay still')

      // The Once light test: pulses and is announced when its key arrives; the countdown never does.
      const saidBefore = (await spot()).said.length
      const addsBefore = (await adds()).length
      assert.equal((await api('POST', '/api/graph/test', { session: 'agent-1' }, { 'X-Aurora-Client': 'mcp' })).status, 200)
      const keepTest = setInterval(() => void api('POST', '/api/graph/test/heartbeat', { session: 'agent-1' }).catch(() => {}), 1000)
      try {
        await page.locator('#shell-light-test-time').waitFor({ timeout: 10_000 })
        await waitFor('add', addsBefore + 1)
        assert.equal((await adds()).at(-1).key, 'test:agent-1:once')
        await waitSaid(saidBefore + 1)
        assert.equal((await spot()).said.at(-1), 'An agent is testing an effect on the lights.')
        await page.waitForTimeout(5000)
        assert.equal((await adds()).length, addsBefore + 1, 'the ticking countdown never pulses')
        assert.equal((await spot()).said.length, saidBefore + 1, 'and is never announced')
        step('a light test pulses and is announced once when it arrives, not on its countdown')

        // Recovery from the takeover is a new baseline: what is there when it comes back is not an arrival.
        const addsAtDown = (await adds()).length
        const saidAtDown = (await spot()).said.length
        await page.route('**/api/state', (route) => route.abort())
        await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ timeout: 15_000 })
        await page.unroute('**/api/state')
        await page.getByRole('heading', { name: 'Aurora has stopped' }).waitFor({ state: 'detached', timeout: 10_000 })
        await toggle.waitFor({ timeout: 10_000 })
        await polls(2)
        assert.equal((await adds()).length, addsAtDown, 'recovery: nothing pulses')
        assert.equal((await spot()).said.length, saidAtDown, 'recovery: nothing is announced')
        step('recovery from the takeover does not pulse or announce')
      } finally {
        clearInterval(keepTest)
        await api('POST', '/api/graph/test/revert', { session: 'agent-1' }).catch(() => {})
      }

      // Reduced motion: no growing ring; a 2px ring held for the same time, then cleared.
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const rmBefore = (await adds()).length
      assert.equal((await api('POST', '/api/dev/errors', { source: 'dev-spot', message: 'spot reduced' })).status, 200)
      await waitFor('add', rmBefore + 1)
      const held = (await adds()).at(-1)
      assert.equal(held.anim, 'shell-ping-hold', 'reduced motion: the held ring, not the pulse')
      assert.ok(held.shadow.includes('2px'), `a 2px ring (${held.shadow})`)
      await waitFor('end', (await spot()).pulses.filter((p) => p.kind === 'end').length + 1)
      assert.equal(await page.locator('#shell-banner-slot [data-new]').count(), 0, 'cleared after the hold')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      step('reduced motion: a held 2px ring, not the pulse, cleared after the same time')

      // Frames for the record: the ring mid-pulse on an error row and on a notice row.
      if (process.env.SHOTS) {
        await api('POST', '/api/dev/errors', { source: 'dev-spot', message: 'spot shot' })
        const errSel = '.shell-banner-row[data-new]'
        await page.waitForSelector(errSel, { timeout: 10_000 })
        await freeze(errSel)
        await shot('dashboard-pulse-error')
        await thaw(errSel)
        await pairing.raise('shot')
        await page.waitForSelector(errSel, { timeout: 10_000 })
        await freeze(errSel)
        await shot('dashboard-pulse-notice')
        await thaw(errSel)
      }
    } finally {
      clearInterval(keepAgent)
    }
  } finally {
    release()
    await api('POST', '/api/graph/test/revert', { session: 'agent-1' }).catch(() => {})
    await api('DELETE', '/api/graph/drafts/agent-1').catch(() => {})
    await api('POST', '/api/dev/errors/remove', { source: 'dev-1' }).catch(() => {})
    await api('POST', '/api/dev/errors/remove', { source: 'dev-spot' }).catch(() => {})
    await api('POST', '/api/dev/errors/remove', { source: 'dev-spot-b' }).catch(() => {})
    await pairing.cleanup().catch(() => {})
    await api('PUT', '/api/config', { activeEffectId: original }).catch(() => {})
    await browser.close()
  }
})
console.log('dashboard shell: all passed')
