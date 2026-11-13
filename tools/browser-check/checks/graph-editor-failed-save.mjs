// Aurora-u68h.7 (stage 6f): a Save, Save as new or Save and apply that Aurora refused or could not
// write is an error-shell row, "Couldn't save <title>: <Aurora's reason>", with no Retry, no action and
// no dismiss, cleared by the next Save or edit. A network failure sets no row (the "Aurora has stopped"
// takeover owns it). Aurora-f8yk: a Save and apply that saves but cannot run (a server draft needing an
// unopened input) shows Aurora's own row in the editor and on the Dashboard, and applying a working graph
// clears it. `SHOTS=<dir>` saves the rows.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { fileAction, makeEdit, openTitleMenu, setName, tickFirst, waitEffect, waitToast } from '../lib/editorMenu.mjs'

const created = []
const shots = process.env.SHOTS

await withEditorStack(async ({ editorUrl, aurora }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const api = (method, path, body) =>
    page.evaluate(async ([method, path, body]) => {
      const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      return { status: res.status, json: await res.json().catch(() => ({})) }
    }, [method, path, body])
  const slot = page.locator('#shell-banner-slot')
  const rows = slot.locator('.shell-banner-row')
  const refuse = (kind, message) =>
    page.route(`**/api/graph/${kind}`, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'write_failed', message }) }),
    )
  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    await setName(page, 'Failed save a')
    await fileAction(page, 'Save')
    await waitEffect(page, 'failed-save-a')
    created.push('failed-save-a')
    await page.waitForSelector('.aurora-node')
    await waitToast(page, 'Saved as Failed save a')
    assert.equal(await rows.count(), 0)
    await page.waitForFunction(() => document.querySelector('.editor-toast')?.getAttribute('data-shown') === 'false', null, { timeout: 12_000 })

    // Save refused: the row, worded with the title and Aurora's reason.
    await makeEdit(page)
    await refuse('save', 'Aurora could not write the file')
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'Save', exact: true }).click()
    const want = "Couldn't save Failed save a: Aurora could not write the file"
    await rows.filter({ hasText: want }).waitFor()
    assert.equal((await rows.first().innerText()).trim(), want)
    assert.equal(await rows.count(), 1)
    assert.equal(await slot.locator('.shell-banner-row').getByRole('button').count(), 0, 'no Retry, no action, no dismiss')
    assert.equal(await page.locator('.editor-toast[data-shown="true"]').count(), 0, 'no toast')
    // The Test button is not disabled by it.
    assert.equal(await page.getByRole('button', { name: 'Test on lights' }).isDisabled(), false, 'Test stays on')
    if (shots) await page.screenshot({ path: `${shots}/failed-save-row.png` })
    step('Save refused: "Couldn\'t save <title>: <reason>", no button, no toast, no banner, Test still on')

    // The next edit clears it.
    await tickFirst(page, page.locator('.aurora-node', { hasText: 'Gain' }).first(), false)
    await rows.first().waitFor({ state: 'detached' })
    step('the next edit clears the row')

    // Save and apply refused: the same row; the next Save (which succeeds) clears it.
    await page.unroute('**/api/graph/save')
    await refuse('apply', 'Aurora could not apply it')
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'Save and apply', exact: true }).click()
    await rows.filter({ hasText: "Couldn't save Failed save a: Aurora could not apply it" }).waitFor()
    await page.unroute('**/api/graph/apply')
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'Save', exact: true }).click()
    await waitToast(page, 'Saved as Failed save a')
    assert.equal(await rows.count(), 0, 'a successful Save clears the row')
    step('Save and apply refused shows the row; the next Save clears it')

    // Aurora-f8yk: a Save and apply the server accepts but cannot run. The effect is running first (a
    // working Save and apply); then the draft the server holds is swapped for one needing an input
    // Aurora has not opened, so the reload fails and Aurora records it. Nothing editor-side sets the row.
    await makeEdit(page)
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'Save and apply', exact: true }).click()
    await page.waitForFunction(async () => (await (await fetch('/api/config')).json()).activeEffectId === 'failed-save-a', null, { timeout: 10_000 })
    const audio = (await api('GET', '/api/effects/builtin.audio')).json.graph
    const sessionId = await page.evaluate(() => sessionStorage.getItem('aurora.graphEditor.session'))
    await makeEdit(page)
    await page.route('**/api/graph/apply', async (route) => {
      await fetch(`${new URL(route.request().url()).origin}/api/graph/drafts/${sessionId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graph: audio }),
      })
      await route.continue()
    })
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'Save and apply', exact: true }).click()
    await rows.first().waitFor({ timeout: 15_000 })
    // Aurora words it: for an input it cannot open the row is the effect failure's (with Retry and Open
    // Settings); a same-effect build error would read "Couldn't apply settings: <reason>" (this stack cannot
    // cause that one; ErrorShell.test.tsx and web/ui/shell.test.mjs are its coverage). Either way it
    // is Aurora's row, not the editor's "Couldn't save".
    const reloadText = (await rows.first().innerText()).trim().split('\n')[0]
    assert.ok(reloadText.length > 10 && !/^Couldn't save/.test(reloadText), `Aurora's own row, got: ${reloadText}`)
    // The editor reloads what Aurora applied, so it now holds the audio graph and its own preview says
    // "Draft would not load" with Test off. That is the editor's verdict on that graph, not the row's, so
    // Test-stays-on is only asserted for the refused Saves above.
    // The Dashboard shows the same row.
    const dash = await browser.newPage()
    await dash.goto(`${aurora}/`)
    await dash.locator('.shell-banner-row', { hasText: reloadText }).waitFor({ timeout: 8000 })
    await dash.close()
    if (shots) await page.screenshot({ path: `${shots}/failed-reload-row.png` })
    step('a Save and apply whose reload fails shows Aurora\'s own row in the editor and on the Dashboard')

    // A working graph applied clears it.
    await page.unroute('**/api/graph/apply')
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    await setName(page, 'Failed save b')
    await fileAction(page, 'Save and apply')
    await waitEffect(page, 'failed-save-b')
    created.push('failed-save-b')
    await rows.first().waitFor({ state: 'detached', timeout: 15_000 })
    step('applying a working graph clears the row')

    // A network failure sets no row.
    await makeEdit(page)
    await page.route('**/api/graph/save', (route) => route.abort('failed'))
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'Save', exact: true }).click()
    await page.waitForTimeout(800)
    assert.equal(await page.locator('text=/Couldn.t save/').count(), 0, 'a network failure sets no row')
    await page.unroute('**/api/graph/save')
    step('a network failure on Save sets no row')
  } finally {
    for (const id of created) await api('DELETE', `/api/effects/${id}`).catch(() => {})
    await browser.close()
  }
})
console.log('graph-editor failed-save: all passed')
