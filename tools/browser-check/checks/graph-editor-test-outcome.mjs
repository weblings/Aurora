// Aurora-daaa.14: a test outcome in the status spot shows until the next test,
// Save or edit. Checked: it still shows after the effect opens, it clears on an
// undo back to the saved graph, and it clears on a successful Save.
// Needs a built app (see tools/light-viz-relay/README.md); dummy input.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { currentEffect, fileAction, makeEdit, setName, waitToast } from '../lib/editorMenu.mjs'

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
  const statusText = () => page.locator('.editor-status').innerText()
  const step = (label) => console.log(`ok  ${label}`)
  const statusHas = (text, timeout = 15_000) =>
    page.waitForFunction((t) => document.querySelector('.editor-status')?.textContent.includes(t), text, { timeout })
  const statusLacks = (text) =>
    page.waitForFunction((t) => !document.querySelector('.editor-status')?.textContent.includes(t), text, { timeout: 5000 })

  // A failed test: heartbeats stop, the editor reports lost contact, and the
  // server puts the lights back by itself.
  const failATest = async () => {
    await button('Test on lights').click()
    await button('Revert').waitFor()
    await page.route('**/api/graph/test/heartbeat', (route) => route.abort())
    await statusHas('Lost contact')
    await page.unroute('**/api/graph/test/heartbeat')
    await page.waitForFunction(async () => !(await (await fetch('/api/graph/test')).json()).active, null, { timeout: 15_000 })
  }

  await page.goto(`${editorUrl}?effect=builtin.video`)
  await page.waitForSelector('.aurora-node')
  const original = (await api('GET', '/api/config')).json.activeEffectId
  try {
    await statusHas('Live', 10_000)

    // Shown after the effect is open and nothing has been edited.
    await failATest()
    await page.waitForTimeout(1000)
    assert.match(await statusText(), /Lost contact/)
    step('a failed test outcome shows on an unedited, freshly opened effect')

    // An edit clears it; a test that fails while edited, then an undo back to
    // the saved graph, clears it too.
    await makeEdit(page)
    await statusLacks('Lost contact')
    await failATest()
    assert.match(await statusText(), /Lost contact/)
    await button('Undo').click()
    await statusLacks('Lost contact')
    step('undo back to the saved graph clears the outcome')

    // A successful Save clears it.
    await setName(page, 'Browser check outcome save')
    await failATest()
    assert.match(await statusText(), /Lost contact/)
    await fileAction(page, 'Save')
    await waitToast(page, 'Saved')
    created.push(await currentEffect(page))
    await statusLacks('Lost contact')
    step('a successful Save clears the outcome')
  } finally {
    await api('PUT', '/api/config', { activeEffectId: original }).catch(() => {})
    for (const id of created) await api('DELETE', `/api/effects/${id}`).catch(() => {})
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await browser.close()
  }
})
console.log('graph-editor test outcome: all passed')
