// Aurora-u68h.3 (6c, revising Aurora-daaa.14): a test that ends for a reason the user did not
// cause draws nothing. The button returns to rest, the reason goes to the visually hidden live
// region and is the first line of the Test caret menu until the next test, Save or edit. A Test
// the server refuses is a visible toast with the server's words. No banner, no mark on the button.
// `SHOTS=<dir>` saves the caret menu with an outcome, the button at rest, and the refusal toast.
// Needs a built app (see tools/light-viz-relay/README.md); dummy input.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { announced, currentEffect, fileAction, makeEdit, setName, waitAnnounced, waitToast } from '../lib/editorMenu.mjs'

const created = []

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const api = (method, path, body) =>
    page.evaluate(
      async ([method, path, body]) => {
        const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
        return { status: res.status, json: await res.json().catch(() => ({})) }
      },
      [method, path, body],
    )
  const button = (name) => page.getByRole('button', { name, exact: true })
  const step = (label) => console.log(`ok  ${label}`)
  const shot = (name) => (process.env.SHOTS ? page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }) : null)
  const STOPPED = 'Test stopped from the Dashboard. The lights are back'

  // The header and button as they are at rest, to compare after an outcome: nothing is drawn.
  const resting = () =>
    page.evaluate(() => ({
      label: document.querySelector('.editor-split-main')?.textContent,
      name: document.querySelector('.editor-split-main')?.getAttribute('aria-label'),
      mainHtml: document.querySelector('.editor-split')?.outerHTML,
      preview: document.querySelector('.editor-header')?.dataset.preview,
      banners: document.querySelectorAll('.editor-banner').length,
      toast: document.querySelector('.editor-toast')?.textContent ?? '',
    }))
  const menuLines = async () => {
    await button('Test mode').click()
    const menu = page.getByRole('menu', { name: 'Test mode' })
    await menu.waitFor()
    return menu.getByRole('menuitem').or(menu.getByRole('menuitemradio')).allInnerTexts()
  }
  const closeMenu = async () => {
    await page.keyboard.press('Escape')
    await page.getByRole('menu', { name: 'Test mode' }).waitFor({ state: 'detached' })
  }
  // Starts a test and has the Dashboard's Stop end it, which is not the user's doing here.
  const stopFromDashboard = async () => {
    await button('Test on lights').click()
    await button('Stop the test').waitFor()
    assert.equal((await api('POST', '/api/graph/test/stop')).status, 200)
    await button('Test on lights').waitFor()
    await waitAnnounced(page, STOPPED)
  }

  await page.goto(`${editorUrl}?effect=builtin.video`)
  await page.waitForSelector('.aurora-node')
  const original = (await api('GET', '/api/config')).json.activeEffectId
  try {
    await page.waitForFunction(() => document.querySelector('.editor-header')?.dataset.preview.includes('Live'), null, { timeout: 10_000 })
    assert.deepEqual(await menuLines(), ['Once (15 s)', 'Live (until stopped)'], 'no outcome before any test')
    await closeMenu()
    const before = await resting()

    // Stopped from the Dashboard: announced, first menu line, nothing drawn, no toast, no banner.
    await stopFromDashboard()
    const after = await resting()
    assert.equal(after.mainHtml, before.mainHtml, 'the Test button is drawn exactly as at rest')
    assert.equal(after.label, 'Test (15s)')
    assert.equal(after.preview, before.preview, 'the header state is unchanged')
    assert.equal(after.banners, 0, 'no banner')
    assert.equal(after.toast, '', 'no toast')
    assert.equal(await page.locator('[data-announcer]').getAttribute('aria-live'), 'polite')
    assert.equal(await page.locator('[data-announcer]').getAttribute('role'), 'status')
    assert.equal(await page.locator('[data-announcer]').evaluate((el) => el.getBoundingClientRect().width <= 1 && el.getBoundingClientRect().height <= 1), true, 'the live region is visually hidden')
    await shot('b-button-at-rest-after-outcome')
    const lines = await menuLines()
    assert.deepEqual(lines, [STOPPED, 'Once (15 s)', 'Live (until stopped)'], 'the reason is the first line of the caret menu')
    await shot('a-caret-menu-with-outcome')
    await closeMenu()
    step('a test stopped from the Dashboard: announced, first line of the Test menu, nothing drawn')

    // Another effect chosen ends a running test too.
    await button('Test on lights').click()
    await button('Stop the test').waitFor()
    assert.equal((await api('PUT', '/api/config', { activeEffectId: original })).status, 200)
    await waitAnnounced(page, 'Test ended: another effect was chosen')
    assert.equal((await menuLines())[0], 'Test ended: another effect was chosen')
    await closeMenu()
    step('another effect chosen is announced and replaces the line')

    // The next test clears the line. A Once test that runs out is its own toast, not an outcome.
    await button('Test on lights').click()
    await button('Stop the test').waitFor()
    await button('Stop the test').click()
    await waitAnnounced(page, 'Reverted')
    assert.equal(await page.locator('.editor-toast').getAttribute('data-shown'), 'false', 'Stop draws no toast')
    assert.deepEqual(await menuLines(), ['Once (15 s)', 'Live (until stopped)'])
    await closeMenu()
    step('the next test clears the line')

    // An edit clears it.
    await stopFromDashboard()
    await makeEdit(page)
    assert.deepEqual(await menuLines(), ['Once (15 s)', 'Live (until stopped)'])
    await closeMenu()
    step('an edit clears the line')

    // Undo back to the saved graph is also an edit.
    await stopFromDashboard()
    await button('Undo').click()
    assert.deepEqual(await menuLines(), ['Once (15 s)', 'Live (until stopped)'])
    await closeMenu()
    step('undo back to the saved graph clears the line')

    // A successful Save clears it.
    await makeEdit(page)
    await setName(page, 'Browser check outcome save')
    await stopFromDashboard()
    await fileAction(page, 'Save')
    await waitToast(page, 'Saved')
    created.push(await currentEffect(page))
    assert.deepEqual(await menuLines(), ['Once (15 s)', 'Live (until stopped)'])
    await closeMenu()
    step('a successful Save clears the line')

    // Test failed to start: the server refuses, the user sees a toast with its words.
    await page.route('**/api/graph/test', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ succeeded: false, error: 'cannot_test', message: 'The lights are paused' }) })
        : route.continue(),
    )
    await button('Test on lights').click()
    await waitToast(page, 'The lights are paused')
    await shot('c-failed-to-start-toast')
    assert.equal((await resting()).banners, 0)
    assert.equal((await menuLines()).length, 2, 'a refused start is a toast, not a menu line')
    await closeMenu()
    await page.unroute('**/api/graph/test')
    step('a refused start is a visible toast with the server\'s words')
  } finally {
    await api('PUT', '/api/config', { activeEffectId: original }).catch(() => {})
    for (const id of created) await api('DELETE', `/api/effects/${id}`).catch(() => {})
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await browser.close()
  }
})
console.log('graph-editor test outcome: all passed')
