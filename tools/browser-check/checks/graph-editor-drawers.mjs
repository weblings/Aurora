// Aurora-daaa.27.4, Aurora-e4bi.3: the Details drawer and the Tuning card list, which replaced
// the Inspector (Aurora-daaa.27.3). Covers what the other checks only use in
// passing: opening each, one drawer at a time, Details following the
// selection, the on-node Dashboard mark, the label fields, reorder/remove in
// the controls drawer, Backspace inside a drawer keeping the node, and Esc.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { openTitleMenu, titleMenu, controlCount,controlsButton, detailsChecks, openDetails, tickFirst, waitControlCount } from '../lib/editorMenu.mjs'


// Opens a card's `...` menu: returns pick(name), which clicks a menu item by its name.
async function cardMenuOf(page, card) {
  await card.hover()
  await card.getByRole('button', { name: /actions$/ }).click()
  const menu = page.getByRole('menu', { name: /actions$/ })
  await menu.waitFor()
  return { menu, pick: (name) => menu.getByRole('menuitem', { name, exact: true }).click() }
}
const labels = (page) => page.locator('.cp-item-card .cp-label').allInnerTexts()
const waitLabels = (page, want) =>
  page.waitForFunction((w) => JSON.stringify([...document.querySelectorAll('.cp-item-card .cp-label')].map((e) => e.textContent)) === JSON.stringify(w), want)

// The Tuning card list (Aurora-e4bi.3) on builtin.audio, which has named sections.
async function cardList(browser, editorUrl, width, step) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const tag = `${width} px`
  try {
    await page.goto(`${editorUrl}?effect=builtin.audio`)
    await page.waitForSelector('.aurora-node')
    const total = await controlCount(page)
    await controlsButton(page).click()
    const cards = page.locator('.cp-item-card')
    await cards.first().waitFor()
    assert.equal(await cards.count(), total)
    assert.ok((await page.locator('.cp-item-sec').count()) > 0, 'section headings show')
    assert.equal(await page.getByRole('button', { name: /^(Move .* (up|down)|Remove .* from the Dashboard)$/ }).count(), 0, 'no arrow buttons')
    assert.ok(!(await page.locator('.ui-drawer').innerText()).includes('No label'), 'no No label line')
    step(`${tag}: ${total} cards under section headings, no arrows, no "No label" line`)

    // Edit...: label and tooltip save, an empty label falls back to the param's own name.
    let m = await cardMenuOf(page, cards.first())
    await m.pick('Edit…')
    const dialog = page.getByRole('dialog', { name: 'Edit control' })
    await dialog.getByRole('textbox', { name: 'Label' }).fill('Check label')
    await dialog.getByRole('textbox', { name: 'Tooltip' }).fill('Check tip')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await dialog.waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.querySelector('.cp-item-card .cp-label')?.textContent === 'Check label')
    m = await cardMenuOf(page, cards.first())
    await m.pick('Edit…')
    const label = dialog.getByRole('textbox', { name: 'Label' })
    assert.equal(await label.inputValue(), 'Check label')
    assert.equal(await dialog.getByRole('textbox', { name: 'Tooltip' }).inputValue(), 'Check tip')
    await label.fill('')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await dialog.waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.querySelector('.cp-item-card .cp-label')?.textContent !== 'Check label')
    const back = (await cards.first().locator('.cp-label').innerText()).trim()
    assert.ok(back && back !== 'Check label', `an empty label falls back (${back})`)
    step(`${tag}: Edit... saves label and tooltip, an empty label falls back to the param's own name`)

    // Move up and down stay inside the section.
    m = await cardMenuOf(page, cards.first())
    assert.equal(await m.menu.getByRole('menuitem', { name: 'Move up', exact: true }).getAttribute('aria-disabled'), 'true', 'first card: no Move up')
    await page.keyboard.press('Escape')
    await m.menu.waitFor({ state: 'detached' })
    const before = await labels(page)
    m = await cardMenuOf(page, cards.first())
    await m.pick('Move down')
    await waitLabels(page, [before[1], before[0], ...before.slice(2)])
    m = await cardMenuOf(page, cards.nth(1))
    await m.pick('Move up')
    await waitLabels(page, before)
    step(`${tag}: Move down and Move up swap neighbours, the first card has no Move up`)

    // Move to section: the other sections are listed, a pick moves the card to that section's end.
    const heads = await page.locator('.cp-item-sec .cp-sec-name').allInnerTexts()
    const firstCount = Number(await page.locator('.cp-item-sec .cp-count').first().innerText())
    m = await cardMenuOf(page, cards.first())
    await m.menu.getByRole('menuitem', { name: 'Move to section' }).click()
    const sub = page.getByRole('menu', { name: 'Move to section' })
    await sub.waitFor()
    const choices = await sub.getByRole('menuitem').allInnerTexts()
    assert.deepEqual(choices, [...heads.slice(1), 'General'].filter((n, i, a) => a.indexOf(n) === i), 'the other sections, in order, then General')
    await sub.getByRole('menuitem', { name: heads[1], exact: true }).click()
    await page.waitForFunction((n) => document.querySelector('.cp-item-sec .cp-count')?.textContent === String(n), firstCount - 1)
    step(`${tag}: Move to section lists the other sections and moves the card`)

    // Show on node selects the node and pings the param's row; double-click does the same.
    const clearSelection = () => page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
    await clearSelection()
    m = await cardMenuOf(page, cards.first())
    await m.pick('Show on node')
    await page.locator('.react-flow__node.selected .param[data-ping]').waitFor({ timeout: 3000 })
    await clearSelection()
    await cards.nth(1).dblclick()
    await page.locator('.react-flow__node.selected .param[data-ping]').waitFor({ timeout: 3000 })
    step(`${tag}: Show on node and double-click select the node and ping the param`)

    // Remove: toast with the name, Undo brings it back.
    const name = (await cards.first().locator('.cp-label').innerText()).trim()
    m = await cardMenuOf(page, cards.first())
    await m.pick('Remove')
    await waitControlCount(page, total - 1)
    await page.waitForFunction((t) => document.querySelector('.editor-toast')?.textContent.includes(t), `Removed ${name} from Tuning.`)
    await page.locator('.editor-toast').getByRole('button', { name: 'Undo' }).click()
    await waitControlCount(page, total)
    step(`${tag}: Remove toasts "Removed ${name} from Tuning." and Undo restores it`)
  } finally {
    await page.close()
  }
}

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const nodes = () => page.locator('.react-flow__node').count()
  const gain = () => page.locator('.aurora-node', { hasText: 'Gain' }).first()
  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    const count = await nodes()
    const total = await controlCount(page)
    assert.equal(await page.locator('.react-flow__node .dashboard-mark').count(), 0, 'no on-node Dashboard mark (dropped, Aurora-s1t7.5)')
    assert.equal(await page.locator('.inspector').count(), 0, 'no Inspector in the editor')
    step(`${total} controls, no on-node marks, no Inspector`)

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

    // Ticking adds the count and the three fields.
    await tickFirst(page, gain())
    await waitControlCount(page, total + 1)
    const fields = detailsChecks(page).first().locator('xpath=ancestor::div[1]').locator('.drawer-field input')
    assert.equal(await fields.count(), 3, 'Label, Section, Tooltip')
    await fields.nth(0).fill('Check label')
    await fields.nth(0).press('Enter')
    step('ticking adds a count and Label/Section/Tooltip fields')

    // Backspace with focus in the drawer does not delete the node.
    await fields.nth(0).blur()
    await detailsChecks(page).first().focus()
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Delete')
    assert.equal(await nodes(), count)
    step('Delete and Backspace inside the drawer keep the node')

    // One drawer at a time; the controls drawer lists, reorders and removes.
    await controlsButton(page).click()
    const list = page.locator('.cp-item-card')
    await list.first().waitFor()
    assert.equal(await page.locator('.drawer-details').count(), 0, 'opening controls closes Details')
    assert.equal(await list.count(), total + 1)
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
    assert.equal(await list.count(), total + 1, 'a canvas click leaves the drawer open')
    await (await cardMenuOf(page, list.first())).pick('Remove')
    await waitControlCount(page, total)
    step('controls drawer: one drawer at a time, stays open on a canvas click, Remove from the card menu')

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
    for (const width of [1100, 400]) await cardList(browser, editorUrl, width, step)
  } finally {
    await browser.close()
  }
})
console.log('graph-editor drawers: all passed')
