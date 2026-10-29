// Aurora-pvxx.14: Save as new forks a custom effect. The new effect opens with
// the edits; the original file and the live effect are unchanged.
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
  const step = (label) => console.log(`ok  ${label}`)
  const selected = () => page.locator('.editor-header select').evaluate((s) => s.value)

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    assert.equal(await page.getByRole('button', { name: 'Save as new' }).count(), 0)
    step('no Save as new on a built-in')

    await page.locator('.editor-name input').fill('Browser check fork source')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.editor-header select')?.value === 'browser-check-fork-source')
    created.push('browser-check-fork-source')

    const original = JSON.stringify((await api('GET', '/api/effects/browser-check-fork-source')).json)
    const live = (await api('GET', '/api/config')).json.activeEffectId
    const before = await page.locator('.react-flow__node').count()

    await page.locator('.palette-item', { hasText: 'Gain' }).first().click()
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n + 1, before)
    const ids = await page.locator('.react-flow__node').evaluateAll((els) => els.map((e) => e.dataset.id))
    const added = ids.find((id) => /^gain(-\d+)?$/.test(id))
    const out = page.locator('.react-flow__node[data-id="ease_hue"] .react-flow__handle.source').first()
    const into = page.locator(`.react-flow__node[data-id="${added}"] .react-flow__handle.target`).first()
    const [a, b] = [await out.boundingBox(), await into.boundingBox()]
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
    await page.mouse.up()
    await page.waitForFunction(() => document.querySelector('.editor-status')?.textContent.includes('Live'), null, { timeout: 10_000 })
    // The name is left alone: the copy still gets a title of its own.
    await page.getByRole('button', { name: 'Save as new' }).click()
    await page.waitForFunction(() => document.querySelector('.editor-header select')?.value === 'browser-check-fork-source-copy')
    created.push('browser-check-fork-source-copy')
    step('Save as new opens the new effect')
    await page.waitForSelector('.aurora-node')
    assert.equal(await page.locator('.editor-name input').inputValue(), 'Browser check fork source copy')
    assert.equal((await api('GET', '/api/effects/browser-check-fork-source')).json.graph.title, 'Browser check fork source')
    step('the copy has a distinct title; the original keeps its own')

    await page.waitForSelector('.aurora-node')
    assert.equal(await page.locator('.react-flow__node').count(), before + 1)
    assert.equal(JSON.stringify((await api('GET', '/api/effects/browser-check-fork-source')).json), original)
    assert.equal((await api('GET', '/api/config')).json.activeEffectId, live)
    step('the new effect has the edit; the original and the live effect are unchanged')
  } finally {
    for (const id of created) await api('DELETE', `/api/effects/${id}`).catch(() => {})
    await browser.close()
  }
})
console.log('graph-editor save as new: all passed')
