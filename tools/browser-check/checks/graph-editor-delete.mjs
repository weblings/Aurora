// Aurora-daaa.27.2: Delete and Backspace both delete the selection; deleting a
// node that has Dashboard controls says so in a toast; undo brings back the
// node, its edges and its controls.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { controlCount, tickFirst, waitControlCount } from '../lib/editorMenu.mjs'

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
    await tickFirst(page, gain())
    const total = await controlCount(page)
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
    await waitControlCount(page, total)
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
    await waitControlCount(page, total)

    // Backspace still deletes, and the same toast shows.
    await page.waitForFunction(() => document.querySelector('.editor-toast')?.getAttribute('data-shown') === 'false', null, { timeout: 12_000 })
    await selectGain()
    await page.keyboard.press('Backspace')
    await gone(count - 1)
    await page.waitForFunction(() => /Removed \d+ Dashboard controls? with/.test(document.querySelector('.editor-toast')?.textContent ?? ''))
    step('Backspace deletes and toasts too')

    // A node with no controls: deleted without a toast.
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await gone(count)
    await page.waitForFunction(() => document.querySelector('.editor-toast')?.getAttribute('data-shown') === 'false', null, { timeout: 12_000 })
    const plain = page.locator('.aurora-node', { hasText: 'Gain' }).first()
    await tickFirst(page, plain, false)
    await plain.locator('.aurora-node-header').click()
    await page.keyboard.press('Delete')
    await gone(count - 1)
    await page.waitForTimeout(400)
    assert.equal(await toast.getAttribute('data-shown'), 'false', 'no toast when no control is lost')
    step('a node without controls is deleted with no toast')

    // Several nodes at once: one toast with the total, one undo restores all.
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await gone(count)
    await page.waitForFunction(() => document.querySelector('.editor-toast')?.getAttribute('data-shown') === 'false', null, { timeout: 12_000 })
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    // Give a second node a control, so the selection owns at least two.
    const second = page.locator('.aurora-node', { hasText: 'Rescale' }).first()
    await tickFirst(page, second)
    await tickFirst(page, gain(), false)
    await tickFirst(page, gain())
    const before = await nodes()
    const beforeEdges = await edgeCount()
    const owned = await controlCount(page)
    await second.locator('.aurora-node-header').click()
    await page.keyboard.down(modifier)
    await gain().locator('.aurora-node-header').click()
    await page.keyboard.up(modifier)
    assert.equal(await page.locator('.react-flow__node.selected').count(), 2, 'two nodes selected')
    await page.keyboard.press('Delete')
    await gone(before - 2)
    const text = await toast.innerText()
    assert.match(text, /^Removed \d+ Dashboard controls with \S/, text)
    assert.match(text, /Rescale/, 'an unlabelled control is named with its node title')
    const n = Number(/Removed (\d+)/.exec(text)[1])
    assert.ok(n >= 2 && n <= owned, `toast total ${n} of ${owned}: ${text}`)
    step(`deleting two nodes: ${text}`)
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await gone(before)
    await page.waitForFunction((k) => document.querySelectorAll('.react-flow__edge').length === k, beforeEdges, { timeout: 5000 })
    await selectGain()
    await waitControlCount(page, owned)
    step('one undo restores both nodes, their wires and their controls')
  } finally {
    await browser.close()
  }
})
console.log('graph-editor delete: all passed')
