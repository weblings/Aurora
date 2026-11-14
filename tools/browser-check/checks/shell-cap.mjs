// Aurora-9hqa.3: the error shell's 60vh safety cap, on the Dashboard and on the editor (one stack, one
// pass per page, each at 400x650 and at a 420 px high window). IntersectionObserver, scrollHeight and
// scrolling only exist in a browser, so this is where they are verified (shellCap.test.mjs holds the
// pure choice of the row to scroll to). Rows are real: dev errors (POST /api/dev/errors) and LAN pairing
// requests (lib/pairing.mjs). Per page and window:
//   - the cap holds: the rows region is no taller than 60vh, the toggle sits below it and in the window;
//   - the fades show only at an edge with more rows past it (top, both, bottom);
//   - the region is in the tab order (tabindex 0, an aria-label, reached by Tab, scrolls by arrow key)
//     only while it overflows, and a resize that ends the overflow removes it again;
//   - ordinary polls do not reset scrollTop;
//   - a new row arriving while the user is scrolled elsewhere scrolls into view, and its pulse is held
//     (data-wait) until the row is fully in view, then runs;
//   - three new rows in one poll: the first scrolls into view and pulses; the later ones, still off
//     screen, keep their pulse held (and data-new) past the 2 s fallback until the user scrolls to
//     them, then pulse once;
//   - a collapsed shell has no region concerns, and an arrival re-opens it and scrolls to the row.
// Decision recorded here: the arrival always scrolls to the FIRST new row, wherever the user was
// scrolled (the mock's sequence 11); "a row arriving off screen pulses when scrolled to" is the
// second and later new rows of one poll. `SHOTS=<dir>` saves the fade frames.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { pairingApi } from '../lib/pairing.mjs'
import { fastPolls, finish, statePolls, StepReached } from '../lib/waits.mjs'

// The dev-only /api/dev/errors routes need this in the app's environment.
process.env.AURORA_DEV_ERRORS = '1'
// The shell polls every 300 ms instead of 3 s (AURORA_DEV_POLL_MS=3000 for the shipped cadence).
fastPolls()

const DEV = ['dev-cap-1', 'dev-cap-2', 'dev-cap-3', 'dev-cap-new', 'dev-cap-late']
const WINDOWS = [
  { width: 400, height: 650 },
  { width: 400, height: 420 },
]

// STEP=<text> runs only the page/window cases whose name contains it (dashboard, editor, 400x420, "editor 400x650");
// text that names no case stops a run after the first step with that text instead.
const CASES = ['dashboard', 'editor'].flatMap((n) => WINDOWS.map((w) => `${n} ${w.width}x${w.height}`))
const only = process.env.STEP && CASES.some((c) => c.includes(process.env.STEP)) ? process.env.STEP : null

await finish('shell cap', withEditorStack(async ({ editorUrl, aurora }) => {
  const browser = await launch()
  const stopAt = process.env.STEP && !only ? process.env.STEP : null
  const step = (label) => {
    console.log(`ok  ${label}`)
    if (stopAt && label.includes(stopAt)) throw new StepReached(label)
  }
  const api = async (method, path, body) => {
    const res = await fetch(`${aurora}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, json: await res.json().catch(() => ({})) }
  }
  const pairing = pairingApi(aurora)
  const original = (await api('GET', '/api/config')).json.activeEffectId
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const clean = async () => {
    await pairing.cleanup().catch(() => {})
    for (const s of DEV) await api('POST', '/api/dev/errors/remove', { source: s }).catch(() => {})
  }

  try {
    for (const { name, url } of [
      { name: 'dashboard', url: `${aurora}/` },
      { name: 'editor', url: `${editorUrl}?effect=builtin.video` },
    ]) {
      for (const win of WINDOWS) {
        const tag = `${name} ${win.width}x${win.height}`
        if (only && !tag.includes(only)) continue
        await clean()
        const page = await browser.newPage({ viewport: win })
        const tracker = statePolls(page)
        page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
        const shot = (file) => (process.env.SHOTS ? page.screenshot({ path: `${process.env.SHOTS}/${name}-${win.height}-${file}.png` }) : null)
        const region = page.locator('#shell-banner-slot .shell-banner-rows')
        const toggle = page.locator('#shell-banner-toggle')
        const rowCount = () => page.locator('#shell-banner-slot .shell-banner-row').count()
        const info = () =>
          region.evaluate((el) => {
            const box = el.getBoundingClientRect()
            const t = document.querySelector('#shell-banner-toggle')?.getBoundingClientRect()
            const style = getComputedStyle(el)
            return {
              height: box.height, bottom: box.bottom, scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
              tabindex: el.getAttribute('tabindex'), label: el.getAttribute('aria-label'), classes: [...el.classList],
              fadeTop: style.getPropertyValue('--shell-fade-top').trim(), fadeBottom: style.getPropertyValue('--shell-fade-bottom').trim(),
              mask: style.maskImage || style.webkitMaskImage,
              toggleTop: t?.top ?? null, toggleBottom: t?.bottom ?? null, vh: window.innerHeight,
            }
          })
        // Two animation frames: the scroll event has fired and the fade classes are updated.
        const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
        const scrollTo = async (top) => {
          await region.evaluate((el, v) => { el.scrollTop = v }, top)
          await frames()
        }
        const polls = (n) => tracker.polls(n)
        // Page-side log of every arrival: was its pulse held when it appeared, and where was it when released.
        const events = () => page.evaluate(() => window.__capEvents)
        const watch = () =>
          page.evaluate(() => {
            window.__capEvents = []
            const seen = (node) => node.nodeType === 1 && node.classList.contains('shell-banner-row')
            const frame = (node) => {
              const r = node.closest('.shell-banner-rows')?.getBoundingClientRect()
              const n = node.getBoundingClientRect()
              return r ? { inView: n.top >= r.top - 1 && n.bottom <= r.bottom + 1, scrollTop: node.closest('.shell-banner-rows').scrollTop } : { inView: false, scrollTop: -1 }
            }
            new MutationObserver((records) => {
              for (const rec of records) {
                if (rec.type === 'childList') {
                  for (const node of rec.addedNodes) if (seen(node) && node.hasAttribute('data-new')) window.__capEvents.push({ kind: 'arrive', key: node.getAttribute('data-key'), held: node.hasAttribute('data-wait'), t: performance.now() })
                } else if (rec.type === 'attributes' && rec.attributeName === 'data-wait' && !rec.target.hasAttribute('data-wait') && rec.target.hasAttribute('data-new')) {
                  const running = rec.target.getAnimations().some((a) => a.animationName === 'shell-ping' || a.animationName === 'shell-ping-hold')
                  window.__capEvents.push({ kind: 'start', key: rec.target.getAttribute('data-key'), ...frame(rec.target), running, t: performance.now() })
                }
              }
            }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-wait'], attributeOldValue: true })
          })
        const rowOf = (text) => page.locator('#shell-banner-slot .shell-banner-row', { hasText: text })
                const expectOpen = async () => page.waitForFunction(() => document.querySelector('#shell-banner-toggle')?.getAttribute('aria-expanded') === 'true', null, { timeout: 10_000 })

        // 2 pairing notices and 3 errors at load: 5 rows, so the baseline starts collapsed.
        await api('POST', '/api/dev/errors', { source: 'dev-cap-1', message: 'cap error one' })
        await api('POST', '/api/dev/errors', { source: 'dev-cap-2', message: 'cap error two' })
        await api('POST', '/api/dev/errors', { source: 'dev-cap-3', message: 'cap error three' })
        await pairing.raise('first device')
        await pairing.raise('second device')
        await page.goto(url)
        await toggle.waitFor({ timeout: 15_000 })
        await page.waitForFunction(() => document.querySelector('#shell-banner-toggle')?.getAttribute('aria-expanded') === 'false', null, { timeout: 10_000 })
        let i = await info()
        assert.equal(await rowCount(), 0, `${tag}: collapsed draws no rows`)
        assert.equal(i.tabindex, null, `${tag}: a collapsed shell's region is not focusable`)
        assert.equal(i.scrollHeight, 0, `${tag}: and holds nothing`)
        await watch()
        step(`${tag}: collapsed at load: no region concerns`)

        await toggle.click()
        await expectOpen()
        await frames()

        // The cap holds, the toggle is below the region and in the window.
        i = await info()
        assert.ok(i.height <= 0.6 * i.vh + 1, `${tag}: region ${i.height} <= 60vh ${0.6 * i.vh}`)
        assert.ok(i.scrollHeight > i.clientHeight + 1, `${tag}: 2 notices and 3 errors overflow the cap (${i.scrollHeight} > ${i.clientHeight})`)
        assert.ok(i.toggleTop >= i.bottom - 1 && i.toggleBottom <= i.vh, `${tag}: Show less is below the region and in the window (${i.toggleTop}..${i.toggleBottom} of ${i.vh})`)
        assert.equal(await toggle.innerText().then((t) => t.trim()), 'Show less')
        // Top of the region: a fade at the bottom only.
        assert.equal(i.scrollTop, 0)
        assert.ok(i.classes.includes('shell-over') && i.classes.includes('shell-more') && !i.classes.includes('shell-less'), `${tag}: at the top only the bottom edge fades (${i.classes})`)
        assert.equal(i.fadeBottom, '28px')
        assert.equal(i.fadeTop, '0px')
        assert.match(i.mask, /linear-gradient/)
        await shot('fade-bottom')
        // Middle: both. End: top only.
        await scrollTo(Math.min(40, i.scrollHeight - i.clientHeight - 20))
        let m = await info()
        assert.ok(m.classes.includes('shell-less') && m.classes.includes('shell-more'), `${tag}: mid-scroll both edges fade (${m.classes})`)
        assert.equal(m.fadeTop, '28px')
        await shot('fade-both')
        await scrollTo(99999)
        m = await info()
        assert.ok(m.classes.includes('shell-less') && !m.classes.includes('shell-more'), `${tag}: at the end only the top edge fades (${m.classes})`)
        assert.equal(m.fadeBottom, '0px')
        await shot('fade-top')
        step(`${tag}: cap holds (${Math.round(i.height)} px <= 60vh), Show less below it, fades at the right edges`)

        // Tab order: the region is a stop while it overflows, and the arrow keys scroll it.
        assert.equal(m.tabindex, '0')
        assert.match(m.label, /scrollable/)
        // Walk back from Show less (the sequential-focus start moves with the click): the region comes
        // before the buttons in its rows.
        await toggle.focus()
        let reached = false
        for (let n = 0; n < 30 && !reached; n += 1) {
          await page.keyboard.press('Shift+Tab')
          reached = await page.evaluate(() => document.activeElement?.classList.contains('shell-banner-rows') ?? false)
        }
        assert.ok(reached, `${tag}: Tab order reaches the overflowing region`)
        await scrollTo(0)
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('ArrowDown')
        // The arrow key's scroll is smooth: wait until it has moved and then come to rest.
        await page.waitForFunction(() => {
          const el = document.querySelector('.shell-banner-rows')
          const was = window.__rest
          window.__rest = el.scrollTop
          return el.scrollTop > 0 && was === el.scrollTop
        }, null, { timeout: 5000, polling: 'raf' })
        assert.ok((await info()).scrollTop > 0, `${tag}: arrow keys scroll the focused region`)
        step(`${tag}: in the tab order while it overflows, scrolls by arrow key`)

        // Ordinary polls leave scrollTop alone.
        await scrollTo(60)
        const before = (await info()).scrollTop
        await polls(2)
        assert.ok(Math.abs((await info()).scrollTop - before) <= 1, `${tag}: scrollTop kept across polls (${before})`)
        step(`${tag}: two polls do not reset scrollTop`)

        // A new error lands just below the pairing notices, off the bottom of the window when the region is
        // at the top: it scrolls down to it and pulses once it is in view.
        await scrollTo(0)
        const farTop = (await info()).scrollTop
        await api('POST', '/api/dev/errors', { source: 'dev-cap-new', message: 'cap error new' })
        await rowOf('cap error new').waitFor({ timeout: 10_000 })
        await page.waitForFunction(() => window.__capEvents.some((e) => e.kind === 'start'), null, { timeout: 10_000 })
        let ev = await events()
        const arrive = ev.find((e) => e.kind === 'arrive')
        const start = ev.find((e) => e.kind === 'start')
        assert.ok(arrive.held, `${tag}: the new row's pulse is held when it arrives`)
        assert.ok(start.inView, `${tag}: its pulse starts with the row fully in view`)
        assert.ok(start.running, `${tag}: and the ping runs`)
        assert.ok(start.scrollTop > farTop, `${tag}: the region scrolled down to it (${farTop} -> ${start.scrollTop})`)
        await page.waitForFunction(() => !document.querySelector('[data-new]'), null, { timeout: 6000 })
        assert.equal(await rowCount(), 6, `${tag}: six rows now`)
        step(`${tag}: a row arriving off screen scrolls into view and pulses once it is visible`)

        // Three new rows in one poll: the first scrolls into view; the rest wait, past the 2 s fallback.
        await watch()
        await scrollTo(0)
        // Together, so they land in one poll.
        await Promise.all([pairing.raise('late one'), pairing.raise('late two'), pairing.raise('late three')])
        await rowOf('late one').waitFor({ timeout: 10_000 })
        await rowOf('late three').waitFor({ timeout: 10_000 })
        await page.waitForFunction(() => window.__capEvents.some((e) => e.kind === 'start'), null, { timeout: 10_000 })
        ev = await events()
        const firstArrivals = ev.filter((e) => e.kind === 'arrive')
        assert.ok(firstArrivals.length >= 1)
        // Drawn order, not the order they were raised in.
        const lateKeys = await page.evaluate(() => [...document.querySelectorAll('.shell-banner-row')].filter((n) => /late (one|two|three)/.test(n.textContent)).map((n) => n.getAttribute('data-key')))
        assert.equal(lateKeys.length, 3)
        const oneKey = lateKeys[0]
        await page.waitForFunction((k) => window.__capEvents.some((e) => e.kind === 'start' && e.key === k), oneKey, { timeout: 10_000 })
        ev = await events()
        const firstStart = ev.find((e) => e.kind === 'start' && e.key === oneKey)
        assert.ok(firstStart.inView && firstStart.running, `${tag}: the first new row (in drawn order) pulses with itself in view (scrollTop ${firstStart.scrollTop})`)
        // Whichever poll raised each one, the last (lowest) row is off screen and waiting.
        // Real time on purpose: the pulse's own 2 s fallback is a timer, not a poll.
        await sleep(2600)
        const lastKey = lateKeys[2]
        const last = await page.evaluate((k) => { const el = document.querySelector(`.shell-banner-row[data-key="${CSS.escape(k)}"]`); return { wait: el.hasAttribute('data-wait'), fresh: el.hasAttribute('data-new') } }, lastKey)
        assert.deepEqual(last, { wait: true, fresh: true }, `${tag}: the off-screen row keeps its held pulse past the 2 s fallback`)
        assert.ok(!(await events()).some((e) => e.kind === 'start' && e.key === lastKey), `${tag}: it has not pulsed`)
        // Scroll to it: now it pulses, once.
        // The user scrolls through the waiting rows one by one.
        for (const key of await page.evaluate(() => [...document.querySelectorAll('.shell-banner-row[data-wait]')].map((n) => n.getAttribute('data-key')))) {
          await page.evaluate((k) => document.querySelector(`.shell-banner-row[data-key="${CSS.escape(k)}"]`)?.scrollIntoView({ block: 'center' }), key)
          await frames()
        }
        await page.waitForFunction(() => !document.querySelector('[data-wait]'), null, { timeout: 6000 })
        const later = (await events()).filter((e) => e.kind === 'start')
        assert.ok(later.some((e) => e.inView && e.running && e.key !== firstStart.key), `${tag}: a later row pulses, running, when scrolled to`)
        await page.waitForFunction(() => !document.querySelector('[data-new]'), null, { timeout: 6000 })
        step(`${tag}: later new rows keep their pulse (past the 2 s fallback) until scrolled to, then pulse`)

        // Collapsed again: an arrival re-opens it and scrolls to the new row.
        await toggle.click()
        await page.waitForFunction(() => document.querySelector('#shell-banner-toggle')?.getAttribute('aria-expanded') === 'false', null, { timeout: 10_000 })
        i = await info()
        assert.equal(i.tabindex, null, `${tag}: collapsed, the region is not focusable`)
        await watch()
        await api('POST', '/api/dev/errors', { source: 'dev-cap-late', message: 'cap error late' })
        await expectOpen()
        await rowOf('cap error late').waitFor({ timeout: 10_000 })
        await page.waitForFunction(() => window.__capEvents.some((e) => e.kind === 'start'), null, { timeout: 10_000 })
        const reopened = (await events()).find((e) => e.kind === 'start')
        assert.ok(reopened.inView && reopened.running, `${tag}: re-opened on arrival, scrolled to the new row, pulsing`)
        await page.waitForFunction(() => !document.querySelector('[data-new]'), null, { timeout: 6000 })
        step(`${tag}: a collapsed shell re-opens on arrival and scrolls to the new row`)

        // A resize that ends the overflow removes the tab stop; shrinking again restores it.
        await page.setViewportSize({ width: win.width, height: 4000 })
        await page.waitForFunction(() => !document.querySelector('.shell-banner-rows')?.hasAttribute('tabindex'), null, { timeout: 5000 }).catch(async (e) => {
          throw new Error(`${e.message}\n${JSON.stringify(await info())} rows ${await rowCount()}`)
        })
        i = await info()
        assert.equal(i.label, null)
        assert.ok(!i.classes.includes('shell-over'), `${tag}: no fades when nothing overflows`)
        await toggle.focus()
        for (let n = 0; n < 10; n += 1) {
          await page.keyboard.press('Shift+Tab')
          assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('shell-banner-rows')), false, `${tag}: a region that does not overflow is not a tab stop`)
        }
        await page.setViewportSize(win)
        await page.waitForFunction(() => document.querySelector('.shell-banner-rows')?.getAttribute('tabindex') === '0', null, { timeout: 5000 })
        step(`${tag}: a resize that ends the overflow removes the tab stop, and shrinking restores it`)

        // The rows clearing end it too.
        await pairing.cleanup()
        for (const s of DEV) await api('POST', '/api/dev/errors/remove', { source: s })
        await page.waitForFunction(() => !document.querySelector('#shell-banner-slot .shell-banner-row') && !document.querySelector('.shell-banner-rows[tabindex]'), null, { timeout: 15_000 })
        step(`${tag}: rows clearing leaves no focusable region`)
        await page.close()
      }
    }
  } finally {
    await clean()
    await api('PUT', '/api/config', { activeEffectId: original }).catch(() => {})
    await browser.close()
  }
}))
