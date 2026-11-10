// Aurora-daaa.27.4: the Details and Dashboard controls drawers, which replaced
// the Inspector (Aurora-daaa.27.3). Covers what the other checks only use in
// passing: opening each, one drawer at a time, Details following the
// selection, the on-node Dashboard mark, the label fields, reorder/remove in
// the controls drawer, Backspace inside a drawer keeping the node, and Esc.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { openTitleMenu, titleMenu, controlCount,controlsButton, detailsChecks, openDetails, tickFirst, waitControlCount } from '../lib/editorMenu.mjs'

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const nodes = () => page.locator('.react-flow__node').count()
  const marks = () => page.locator('.react-flow__node .dashboard-mark').count()
  const gain = () => page.locator('.aurora-node', { hasText: 'Gain' }).first()
  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    const count = await nodes()
    const total = await controlCount(page)
    assert.equal(await marks(), total, 'one on-node mark per Dashboard control')
    assert.equal(await page.locator('.inspector').count(), 0, 'no Inspector in the editor')
    step(`${total} controls, ${total} on-node marks, no Inspector`)

    // Selecting does not open Details; the node menu does.
    await gain().locator('.aurora-node-header').click()
    assert.equal(await page.locator('.drawer-details').count(), 0, 'selecting does not open Details')
    await openDetails(page, gain())
    assert.ok(await detailsChecks(page).count() > 0, 'Details lists the params')
    step('Details opens from the node menu, not from selecting')

    // It follows the selection.
    const purpose = await page.locator('.drawer-details p').first().innerText()
    await page.locator('.aurora-node').nth(1).locator('.aurora-node-header').click()
    await page.waitForFunction((t) => document.querySelector('.drawer-details p')?.textContent !== t, purpose)
    step('Details follows the selection')

    // Ticking adds the mark, the count and the three fields.
    await tickFirst(page, gain())
    await waitControlCount(page, total + 1)
    assert.equal(await marks(), total + 1)
    const fields = detailsChecks(page).first().locator('xpath=ancestor::div[1]').locator('.drawer-field input')
    assert.equal(await fields.count(), 3, 'Label, Section, Tooltip')
    await fields.nth(0).fill('Check label')
    await fields.nth(0).press('Enter')
    step('ticking adds a mark, a count and Label/Section/Tooltip fields')

    // Backspace with focus in the drawer does not delete the node.
    await fields.nth(0).blur()
    await detailsChecks(page).first().focus()
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Delete')
    assert.equal(await nodes(), count)
    step('Delete and Backspace inside the drawer keep the node')

    // One drawer at a time; the controls drawer lists, reorders and removes.
    await controlsButton(page).click()
    const list = page.locator('.drawer-controls li')
    await list.first().waitFor()
    assert.equal(await page.locator('.drawer-details').count(), 0, 'opening controls closes Details')
    assert.equal(await list.count(), total + 1)
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
    assert.equal(await list.count(), total + 1, 'a canvas click leaves the drawer open')
    const first = await list.first().innerText()
    await page.getByRole('button', { name: /^Move .* down$/ }).first().click()
    await page.waitForFunction((t) => document.querySelector('.drawer-controls li')?.innerText !== t, first)
    await page.getByRole('button', { name: /^Remove .* from the Dashboard$/ }).first().click()
    await waitControlCount(page, total)
    step('controls drawer: one drawer at a time, stays open on a canvas click, reorder and remove')

    // A menu opened over the drawer takes the first Esc; the drawer takes the second.
    await openTitleMenu(page)
    await page.keyboard.press('Escape')
    await titleMenu(page).waitFor({ state: 'detached' })
    assert.equal(await list.count(), total, 'first Esc closes only the menu')
    step('Esc with a menu open closes the menu, not the drawer')

    // Esc closes it, also after a canvas click.
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press('Escape')
    await list.first().waitFor({ state: 'detached' })
    step('Esc closes the drawer from the canvas')
  } finally {
    await browser.close()
  }
})
console.log('graph-editor drawers: all passed')
