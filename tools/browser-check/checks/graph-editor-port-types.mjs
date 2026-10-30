// Aurora-ex8z: every port type draws its own colour and shape, edges take the
// source colour, and a drag tints the line and dims handles of other types.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`
}
const VIDEO = '#38c9a8'
const AUDIO = '#c58cf0'
const LIGHT = '#e5ad3c'
const NUMBER = '#9a9a9a'
const EXPECT = {
  Image: [VIDEO, 'square'],
  AudioBuffer: [AUDIO, 'square'],
  AudioFeatures: [AUDIO, 'circle'],
  Frame: [LIGHT, 'square'],
  Color: [LIGHT, 'circle'],
  Float: [NUMBER, 'circle'],
  Angle: [NUMBER, 'diamond'],
  Trigger: [NUMBER, 'triangle'],
}

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')

    // Add node types until every port type has a handle on the canvas.
    const catalog = await page.evaluate(async () => (await (await fetch('/api/nodes')).json()).nodes)
    const have = async () => new Set(await page.locator('.aurora-handle').evaluateAll((els) => els.map((e) => e.dataset.portType)))
    for (const type of Object.keys(EXPECT)) {
      if ((await have()).has(type)) continue
      const info = catalog.find((n) => [...n.inputs, ...n.outputs].some((p) => p.type === type))
      assert.ok(info, `no node type has a ${type} port`)
      await page.getByRole('button', { name: info.title || info.type, exact: true }).first().click()
      await page.waitForFunction((t) => document.querySelector(`.aurora-handle[data-port-type="${t}"]`), type)
    }
    assert.deepEqual([...(await have())].sort(), Object.keys(EXPECT).sort())
    step('a graph with all 8 port types is on the canvas')

    for (const [type, [color, shape]] of Object.entries(EXPECT)) {
      const look = await page.locator(`.aurora-handle[data-port-type="${type}"]`).first().evaluate((el) => {
        const s = getComputedStyle(el)
        return { bg: s.backgroundColor, radius: s.borderRadius, rotate: s.rotate, clip: s.clipPath }
      })
      assert.equal(look.bg, rgb(color), `${type} colour`)
      if (shape === 'circle') assert.equal(look.radius, '50%', `${type} shape`)
      if (shape === 'square') assert.ok(look.radius === '0px' && look.rotate === 'none', `${type} shape ${JSON.stringify(look)}`)
      if (shape === 'diamond') assert.equal(look.rotate, '45deg', `${type} shape`)
      if (shape === 'triangle') assert.ok(look.clip.startsWith('polygon'), `${type} shape`)
    }
    step('each type draws its spec colour and shape')

    // Edges of the built-in take their source handle's colour.
    const strokes = await page
      .locator('.react-flow__edge path.react-flow__edge-path')
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).stroke))
    assert.ok(strokes.length > 0)
    const allowed = Object.values(EXPECT).map(([c]) => rgb(c))
    for (const s of strokes) assert.ok(allowed.includes(s), `edge stroke ${s} is not a port colour`)
    step('edges are drawn in port colours')

    // Dragging from a handle tints the line and dims other types.
    const src = page.locator('.react-flow__handle.source[data-port-type="Float"]').first()
    const box = await src.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 120, box.y + 80, { steps: 8 })
    await page.waitForSelector('.react-flow.is-connecting')
    const opacity = (type) =>
      page.locator(`.aurora-handle[data-port-type="${type}"]`).first().evaluate((el) => getComputedStyle(el).opacity)
    assert.equal(await opacity('Float'), '1')
    assert.equal(await opacity('Image'), '0.25')
    const line = await page.locator('.react-flow__connection path').first().evaluate((el) => getComputedStyle(el).stroke)
    assert.equal(line, rgb(NUMBER))
    await page.mouse.up()
    await page.waitForFunction(() => !document.querySelector('.react-flow.is-connecting'))
    step('drag line takes the source colour and other types dim, then reset')
  } finally {
    await browser.close()
  }
})
console.log('graph-editor port types: all passed')
