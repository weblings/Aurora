// Aurora-pvxx.13: add a node from the palette, wire it in, the preview stays
// Live, Save, and the reopened effect has the node. Runs on the dummy input.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'

const created = []

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))

  const api = (method, path) =>
    page.evaluate(async ([method, path]) => {
      const res = await fetch(path, { method })
      return { status: res.status, json: await res.json().catch(() => ({})) }
    }, [method, path])
  const waitLive = () =>
    page.waitForFunction(() => document.querySelector('.editor-status')?.textContent.includes('Live'), null, { timeout: 10_000 })
  const step = (label) => console.log(`ok  ${label}`)

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    await waitLive()
    const before = await page.locator('.react-flow__node').count()

    await page.locator('.palette-item', { hasText: 'Gain' }).first().click()
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n + 1, before)
    step('a palette click adds a node')

    // The new node is the one whose id is not in the built-in graph.
    const ids = await page.locator('.react-flow__node').evaluateAll((els) => els.map((e) => e.dataset.id))
    const added = ids.find((id) => !['cap', 'rescale'].includes(id) && /^gain(-\d+)?$/.test(id))
    assert.ok(added, `no new gain node among ${ids}`)

    const out = page.locator('.react-flow__node[data-id="ease_hue"] .react-flow__handle.source').first()
    const into = page.locator(`.react-flow__node[data-id="${added}"] .react-flow__handle.target`).first()
    const [a, b] = [await out.boundingBox(), await into.boundingBox()]
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
    await page.mouse.up()
    await waitLive()
    assert.equal(await page.locator('.problem-badge').count(), 0)
    step('wired in, the preview is Live with no problems')

    await page.locator('.editor-name input').fill('Browser check add node')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.editor-header select')?.value === 'browser-check-add-node')
    created.push('browser-check-add-node')

    await page.goto(`${editorUrl}?effect=browser-check-add-node`)
    await page.waitForSelector('.aurora-node')
    assert.equal(await page.locator(`.react-flow__node[data-id="${added}"]`).count(), 1)
    assert.equal(await page.locator('.react-flow__node').count(), before + 1)
    step('Save, reopen: the added node is there')
  } finally {
    for (const id of created) await api('DELETE', `/api/effects/${id}`).catch(() => {})
    await browser.close()
  }
})
console.log('graph-editor add node: all passed')
