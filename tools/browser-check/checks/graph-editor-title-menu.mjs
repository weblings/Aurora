// Aurora-daaa.10: the title menu, the editor's first popup. Opens by mouse and
// keyboard, closes on Esc (focus inside or outside it), an outside click and a
// pane drag, hands focus back, and never lets Delete or Backspace delete a
// node while it is open. Arrow keys only move focus: nothing is saved.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { openTitleMenu, titleMenu, titleMenuButton } from '../lib/editorMenu.mjs'

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const saves = []
  page.on('request', (r) => /\/api\/graph\/(save|apply)$/.test(r.url()) && saves.push(r.url()))
  const isOpen = async () => (await titleMenu(page).count()) > 0
  const closed = () => titleMenu(page).waitFor({ state: 'detached' })
  const focusInTrigger = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Effect menu')
  const nodes = () => page.locator('.react-flow__node').count()
  // Fit view stops at 60% zoom (Aurora-daaa.18) and the pane drag pans further, so
  // the first node can sit outside the window: click the first header in view.
  const header = async () => {
    const headers = page.locator('.aurora-node .aurora-node-header')
    const inView = await headers.evaluateAll((els) =>
      els.findIndex((el) => {
        const r = el.getBoundingClientRect()
        return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
      }),
    )
    assert.notEqual(inView, -1, 'no node header is fully in view')
    return headers.nth(inView)
  }

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    const count = await nodes()

    // A built-in: Save and Save and apply, no Save as new.
    await openTitleMenu(page)
    assert.deepEqual(await titleMenu(page).getByRole('menuitem').allInnerTexts(), ['Save', 'Save and apply', 'New empty effect'])
    step('the menu opens on a click and lists Save, Save and apply and New empty effect for a built-in')

    // Esc with focus inside the menu.
    await page.keyboard.press('Escape')
    await closed()
    assert.equal(await focusInTrigger(), true)
    step('Esc closes it and focus returns to the trigger')

    // Keyboard: open, move with the arrows, nothing is committed.
    await titleMenuButton(page).focus()
    await page.keyboard.press('Enter')
    await titleMenu(page).waitFor()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowDown')
    assert.equal(saves.length, 0)
    assert.equal(await isOpen(), true)
    await page.keyboard.press('Escape')
    await closed()
    step('opens from the keyboard; arrow keys move focus and save nothing')

    // Esc while focus is outside the menu.
    await openTitleMenu(page)
    await page.locator('.react-flow__pane').focus()
    await page.keyboard.press('Escape')
    await closed()
    step('Esc closes it while focus is outside the menu')

    // Outside click.
    await openTitleMenu(page)
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
    await closed()
    step('a click outside closes it')

    // Pane drag.
    await openTitleMenu(page)
    const pane = await page.locator('.react-flow__pane').boundingBox()
    await page.mouse.move(pane.x + pane.width - 40, pane.y + 40)
    await page.mouse.down()
    await page.mouse.move(pane.x + pane.width - 90, pane.y + 90, { steps: 6 })
    await page.mouse.up()
    await closed()
    step('dragging the pane closes it')

    // Delete and Backspace do not delete the selected node while it is open.
    await (await header()).click()
    await openTitleMenu(page)
    await page.keyboard.press('Delete')
    await page.keyboard.press('Backspace')
    assert.equal(await nodes(), count)
    assert.equal(await isOpen(), true)
    await page.keyboard.press('Escape')
    await closed()
    assert.equal(await nodes(), count)
    step('Delete and Backspace leave the selected node alone while it is open')

    // With the menu closed, the same key deletes again.
    await (await header()).click()
    await page.keyboard.press('Backspace')
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n - 1, count)
    step('with the menu closed Backspace deletes the selected node again')
  } finally {
    await browser.close()
  }
})
console.log('graph-editor title menu: all passed')
