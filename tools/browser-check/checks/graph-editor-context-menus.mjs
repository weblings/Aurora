// Aurora-daaa.27.1: right-click and ⋯ menus. Canvas (Add node cascade placing at
// the pointer, Undo, Redo, Fit view), node (Details, Show on the Dashboard,
// Delete with the selection count) and wire (Delete connection); ⋯ and
// Shift+F10 open the node menu; Delete/Backspace inside a menu do not delete.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const nodeCount = () => page.locator('.react-flow__node').count()
  const edgeCount = () => page.locator('.react-flow__edge').count()
  const menu = (name) => page.getByRole('menu', { name })
  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    const nodes0 = await nodeCount()

    // Node accessible names and the ⋯ button.
    const labelled = await page.locator('.react-flow__node').evaluateAll((els) => els.every((e) => e.getAttribute('aria-label')))
    assert.ok(labelled, 'every node has an aria-label')
    const more = page.locator('.aurora-node-more').first()
    assert.equal(await more.getAttribute('aria-haspopup'), 'menu')
    assert.match((await more.getAttribute('aria-label')) ?? '', /^Actions for /)
    step('nodes carry their title; ⋯ is a labelled menu button')

    // ⋯ opens the node menu; Delete inside it does not delete.
    await more.click()
    await menu('Node actions').waitFor()
    await page.keyboard.press('Delete')
    await page.keyboard.press('Backspace')
    assert.equal(await nodeCount(), nodes0)
    step('⋯ opens the node menu; Delete/Backspace in it do nothing')
    await page.keyboard.press('Escape')
    await menu('Node actions').waitFor({ state: 'detached' })

    // Shift+F10 on a focused node.
    await page.locator('.react-flow__node').first().focus()
    await page.keyboard.press('Shift+F10')
    await menu('Node actions').waitFor()
    step('Shift+F10 opens the node menu')
    await page.keyboard.press('Escape')

    // Right-click node: Delete acts on it.
    await page.locator('.aurora-node-header').first().click({ button: 'right' })
    await menu('Node actions').waitFor()
    await page.getByRole('menuitem', { name: 'Delete node' }).click()
    assert.equal(await nodeCount(), nodes0 - 1)
    step('node menu Delete removes the node')

    // Undo from the canvas menu.
    await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 600, y: 700 } })
    await menu('Canvas actions').waitFor()
    await page.getByRole('menuitem', { name: 'Undo' }).click()
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n, nodes0)
    step('canvas menu Undo restores it')

    // Add node at the pointer.
    await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 600, y: 700 } })
    await page.getByRole('menuitem', { name: 'Add node' }).hover()
    await page.getByRole('menuitem', { name: /^Lights/ }).hover()
    const flyout = page.locator('[role=menu][aria-label="Lights nodes"]')
    await flyout.waitFor()
    await flyout.getByRole('menuitem').first().click()
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n + 1, nodes0)
    const pane = await page.locator('.react-flow__pane').boundingBox()
    const added = await page.locator('.react-flow__node').last().boundingBox()
    const at = { x: pane.x + 600, y: pane.y + 700 }
    assert.ok(Math.abs(added.x - at.x) < 200 && Math.abs(added.y - at.y) < 200,
      `new node at (${Math.round(added.x)}, ${Math.round(added.y)}), right-click at (${Math.round(at.x)}, ${Math.round(at.y)})`)
    step('canvas menu Add node adds a node at the right-click position')

    // Wire menu.
    const edges0 = await edgeCount()
    const mid = await page.locator('.react-flow__edge-interaction').first().evaluate((p) => {
      const m = p.getPointAtLength(p.getTotalLength() / 2)
      const pt = new DOMPoint(m.x, m.y).matrixTransform(p.getScreenCTM())
      return { x: pt.x, y: pt.y }
    })
    await page.mouse.click(mid.x, mid.y, { button: 'right' })
    await menu('Connection actions').waitFor()
    await page.getByRole('menuitem', { name: 'Delete connection' }).click()
    assert.equal(await edgeCount(), edges0 - 1)
    step('wire menu Delete connection removes the wire')
  } finally {
    await browser.close()
  }
})
console.log("graph-editor context menus: all passed")
