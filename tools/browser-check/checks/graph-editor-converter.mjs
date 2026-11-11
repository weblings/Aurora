// Aurora-0veq: dropping a Float wire on an Angle input (or the reverse) inserts the
// converter node, wired both sides, as one undo step; other mismatches still refuse.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { addNodeByName } from '../lib/editorMenu.mjs'

const undo = process.platform === 'darwin' ? 'Meta+z' : 'Control+z'

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    const catalog = await page.evaluate(async () => (await (await fetch('/api/nodes')).json()).nodes)
    const title = (type) => catalog.find((n) => n.type === type)?.title
    for (const t of ['angle.fromFloat', 'angle.toFloat']) assert.ok(title(t), `catalog has ${t} (rebuild the app?)`)

    const nodes = () => page.locator('.react-flow__node').count()
    const edges = () => page.locator('.react-flow__edge').count()
    const drag = async (from, to) => {
      const a = await from.boundingBox()
      const b = await to.boundingBox()
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
      await page.mouse.down()
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
      await page.mouse.up()
    }
    const handle = (kind, type, nth = 0) => page.locator(`.react-flow__handle.${kind}[data-port-type="${type}"]`).nth(nth)

    // Float output -> Angle input.
    await addNodeByName(page, title('angle.constant') ? 'LFO' : 'LFO')
    await addNodeByName(page, 'Color from HSV')
    await page.waitForFunction(() => document.querySelector('.react-flow__handle.target[data-port-type="Angle"]'))
    const n0 = await nodes()
    const e0 = await edges()
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } })
    await drag(handle('source', 'Float', 0), handle('target', 'Angle', 0))
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n, n0 + 1)
    assert.equal(await edges(), e0 + 2)
    assert.ok(await page.getByText(title('angle.fromFloat'), { exact: true }).count())
    step('Float to Angle drop inserts the converter with two wires')

    await page.keyboard.press(undo)
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n, n0)
    assert.equal(await edges(), e0)
    step('one undo removes the node and both wires')

    // Angle output -> Float input.
    await addNodeByName(page, 'Angle')
    const n1 = await nodes()
    const e1 = await edges()
    const floatIn = page.locator('.react-flow__handle.target[data-port-type="Float"]').first()
    await drag(handle('source', 'Angle', 0), floatIn)
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n, n1 + 1)
    assert.equal(await edges(), e1 + 2)
    step('Angle to Float drop inserts the converter')

    // Other mismatch still refused.
    await page.keyboard.press(undo)
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n, n1)
    await drag(handle('source', 'Image', 0), handle('target', 'Angle', 0))
    await page.getByText(/Image output cannot feed a/).waitFor()
    assert.equal(await nodes(), n1)
    step('an Image on an Angle input is still refused')
  } finally {
    await browser.close()
  }
})
console.log('graph-editor converter: all passed')
