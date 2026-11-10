// Aurora-daaa.27.2: Delete and Backspace both delete the selection; deleting a
// node that has Dashboard controls says so in a toast; undo brings back the
// node, its edges and its controls.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const nodes = () => page.locator('.react-flow__node').count()
  const edgeCount = () => page.locator('.react-flow__edge').count()
  const toast = page.locator('.editor-toast')
  const gain = () => page.locator('.aurora-node', { hasText: 'Gain' }).first()
  const selectGain = () => gain().locator('.aurora-node-header').click()
  const gone = (n) => page.waitForFunction((k) => document.querySelectorAll('.react-flow__node').length === k, n)

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    const count = await nodes()
    const edges = await edgeCount()

    // A node with a Dashboard control: Delete removes it and the toast says so.
    await selectGain()
    await page.locator('.inspector-check input').first().check()
    const total = Number(/\((\d+)\)/.exec(await page.locator('.inspector h3', { hasText: 'Dashboard controls' }).innerText())[1])
    await selectGain()
    await page.keyboard.press('Delete')
    await gone(count - 1)
    await page.waitForFunction(() => /Removed \d+ Dashboard controls? with/.test(document.querySelector('.editor-toast')?.textContent ?? ''))
    step(`Delete removes the node and toasts: ${await toast.innerText()}`)
    assert.ok((await edgeCount()) < edges, 'its edges went too')

    // Undo restores the node, its edges and its controls.
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await gone(count)
    await page.waitForFunction((k) => document.querySelectorAll('.react-flow__edge').length === k, edges, { timeout: 5000 })
    await selectGain()
    await page.locator('.inspector h3', { hasText: `Dashboard controls (${total})` }).waitFor()
    step('undo restores the node, its edges and its controls')

    // Redo deletes it again in one step: node, wires and controls together.
    const redoKey = process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+Shift+z'
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press(redoKey)
    await gone(count - 1)
    await page.waitForFunction((k) => document.querySelectorAll('.react-flow__edge').length < k, edges, { timeout: 5000 })
    const afterRedo = await edgeCount()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await gone(count)
    await page.waitForFunction((k) => document.querySelectorAll('.react-flow__edge').length === k, edges, { timeout: 5000 })
    assert.ok(afterRedo < edges)
    step('redo removes the node and its wires again, and one undo restores them')
    await selectGain()
    await page.locator('.inspector h3', { hasText: `Dashboard controls (${total})` }).waitFor()

    // Backspace still deletes, and the same toast shows.
    await page.waitForFunction(() => document.querySelector('.editor-toast')?.getAttribute('data-shown') === 'false', null, { timeout: 6000 })
    await selectGain()
    await page.keyboard.press('Backspace')
    await gone(count - 1)
    await page.waitForFunction(() => /Removed \d+ Dashboard controls? with/.test(document.querySelector('.editor-toast')?.textContent ?? ''))
    step('Backspace deletes and toasts too')

    // A node with no controls: deleted without a toast.
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await gone(count)
    await page.waitForFunction(() => document.querySelector('.editor-toast')?.getAttribute('data-shown') === 'false', null, { timeout: 6000 })
    const plain = page.locator('.aurora-node', { hasText: 'Gain' }).first()
    await plain.locator('.aurora-node-header').click()
    await page.locator('.inspector-check input').first().uncheck()
    await plain.locator('.aurora-node-header').click()
    await page.keyboard.press('Delete')
    await gone(count - 1)
    await page.waitForTimeout(400)
    assert.equal(await toast.getAttribute('data-shown'), 'false', 'no toast when no control is lost')
    step('a node without controls is deleted with no toast')
  } finally {
    await browser.close()
  }
})
console.log('graph-editor delete: all passed')
