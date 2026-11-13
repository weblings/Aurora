// Aurora-u68h.7 (stage 6f): a Save, Save as new or Save and apply that Aurora refused or could not
// write is an error-shell row, "Couldn't save <title>: <Aurora's reason>", with no Retry, no action and
// no dismiss, cleared by the next Save or edit. A network failure sets no row (the "Aurora has stopped"
// takeover owns it). `SHOTS=<dir>` saves the row.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { fileAction, makeEdit, openTitleMenu, setName, tickFirst, waitEffect, waitToast } from '../lib/editorMenu.mjs'

const created = []
const shots = process.env.SHOTS

await withEditorStack(async ({ editorUrl }) => {
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
    assert.equal(await slot.getByRole('button').count(), 0, 'no Retry, no action, no dismiss')
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
