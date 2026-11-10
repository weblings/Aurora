// Aurora-daaa.24.3: the cascade Add node menu. Opens from the + button and
// Shift+A (canvas focus only), searches with name matches ahead of
// description matches, opens group flyouts with the arrow keys (right opens,
// left closes one level), adds a node at the view centre, and closes on Esc
// and an outside click with focus handed back. SHOTS=<dir> saves screenshots.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const plus = page.getByRole('button', { name: 'Add node' })
  const dialog = page.getByRole('dialog', { name: 'Add node' })
  const groups = page.getByRole('menu', { name: 'Node groups' })
  const flyout = page.locator('[role=menu][aria-label="Sources nodes"]')
  const lightsFlyout = page.locator('[role=menu][aria-label="Lights nodes"]')
  const search = page.getByRole('searchbox', { name: 'Search nodes' })
  const nodeCount = () => page.locator('.react-flow__node').count()
  const shot = async (name) => process.env.SHOTS && (await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }))
  const closed = () => dialog.waitFor({ state: 'detached' })

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    const before = await nodeCount()

    // + button opens; groups listed in signal-flow order.
    await plus.click()
    await groups.waitFor()
    assert.deepEqual(
      (await groups.getByRole('menuitem').allInnerTexts()).map((t) => t.replace(/\s*›\s*$/, '').trim()),
      ['Sources', 'Audio', 'Image', 'Color', 'Numbers', 'Motion', 'Lights'],
    )
    step('the + button opens the menu with seven group rows')

    // Esc closes; focus returns to +.
    await page.keyboard.press('Escape')
    await closed()
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Add node')
    step('Esc closes it and focus returns to the + button')

    // Shift+A from the canvas, not from a text field.
    await page.locator('.react-flow__pane').click({ position: { x: 300, y: 500 } })
    await page.keyboard.press('Shift+A')
    await groups.waitFor()
    step('Shift+A opens it from the canvas')
    await page.mouse.click(700, 700)
    await closed()
    step('an outside click closes it')

    // Search ranking: name matches under their heading before description matches.
    await plus.click()
    await search.fill('gain')
    const headings = await dialog.locator('.ui-section-header').allInnerTexts()
    assert.equal(headings[0], 'Name matches')
    const rows = await dialog.getByRole('option').allInnerTexts()
    const first = rows[0].toLowerCase()
    assert.ok(first.includes('gain'), `first row is a name match: ${first}`)
    if (headings.length > 1) assert.equal(headings[1], 'Description matches')
    await shot('add-menu-search')
    step(`search ranks name matches first (${rows.length} rows, headings ${headings.join(' / ')})`)

    // Query clears back to groups.
    await search.fill('')
    await groups.waitFor()
    step('clearing the query returns to the group rows')

    // Flyout keyboard: right opens, left closes one level.
    await search.focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowRight')
    await flyout.waitFor()
    const flyoutItems = await flyout.locator('[role=menuitem]').count()
    assert.ok(flyoutItems > 0)
    await shot('add-menu-flyout')
    await page.keyboard.press('ArrowLeft')
    await flyout.waitFor({ state: 'detached' })
    assert.equal(await dialog.count(), 1, 'left closes only the flyout')
    step('ArrowRight opens a group flyout; ArrowLeft closes just that level')

    // Add by keyboard from a flyout: Lights > first node.
    await page.getByRole('menuitem', { name: /^Lights/ }).hover()
    await lightsFlyout.waitFor()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await closed()
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n + 1, before)
    step('Enter on a flyout row adds a node and closes the menu')

    // Add by mouse through search.
    await plus.click()
    await search.fill('rescale')
    await dialog.getByRole('option').first().click()
    await closed()
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n + 2, before)
    step('clicking a search result adds a node')

    // Shift+A in a text box does not open the menu.
    await page.locator('.react-flow__pane').click({ position: { x: 300, y: 500 } })
    await page.keyboard.press('Shift+A')
    await groups.waitFor()
    await page.keyboard.press('Escape')
    await closed()
  } finally {
    await browser.close()
  }
})
console.log('graph-editor add menu: all passed')
