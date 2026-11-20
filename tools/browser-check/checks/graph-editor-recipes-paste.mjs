// Aurora-4g4d.3: each docs/recipes clip pasted into an empty graph with Ctrl+V, then Select all and Ctrl+C
// round-trips it. Checks node and wire counts, no skipped toast, one Undo, and the editor's own problem list.
// Runs with an audio input so an audio recipe's preview must reopen for it (Aurora-ookv).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'recipes')
const recipes = JSON.parse(readFileSync(join(dir, 'recipes.json'), 'utf8')).recipes
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'
const SHOTS = process.env.SHOTS

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const context = await browser.newContext({ viewport: { width: 1470, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] }, { audio: true })
  const page = await context.newPage()
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const count = (sel) => page.locator(sel).count()
  const warmText = readFileSync(join(dir, 'candles.clip.json'), 'utf8')
  const waitLive = () => page.waitForFunction(() => /Live/.test(document.querySelector('.editor-header')?.dataset.preview ?? ''), null, { timeout: 15_000 })
  const waitNodes = (n) => page.waitForFunction((k) => document.querySelectorAll('.react-flow__node').length === k, n)
  try {
    for (const { file, name } of recipes) {
      const text = readFileSync(join(dir, `${file}.clip.json`), 'utf8')
      const clip = JSON.parse(text)
      await page.goto(`${editorUrl}?effect=%40empty`)
      await page.waitForSelector('.react-flow__pane')
      assert.equal(await count('.react-flow__node'), 0, `${name}: starts empty`)
      // A video graph opens the preview stream, then clearing leaves it open on that graph: the
      // owner's case (an empty graph with a live stream). The paste below must reopen it.
      await page.evaluate((t) => navigator.clipboard.writeText(t), warmText)
      await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
      await page.keyboard.press(`${MOD}+v`)
      await waitNodes(JSON.parse(warmText).nodes.length)
      await waitLive()
      await page.keyboard.press(`${MOD}+a`)
      await page.keyboard.press('Delete')
      await waitNodes(0)
      await page.evaluate((t) => navigator.clipboard.writeText(t), text)
      await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } }, { audio: true })
      await page.keyboard.press(`${MOD}+v`)
      await waitNodes(clip.nodes.length)
      await page.waitForFunction((k) => document.querySelectorAll('.react-flow__edge').length === k, clip.edges.length)
      assert.equal(await count('.editor-toast:has-text("skipped")'), 0, `${name}: nothing skipped`)
      // The preview reloads for the pasted graph: a stream that never opened its input shows a problem here.
      await page.waitForFunction(() => /Live/.test(document.querySelector('.editor-header')?.dataset.preview ?? ''), null, { timeout: 15_000 }, { audio: true })
      await page.waitForTimeout(700)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${file}.png` }, { audio: true })
      assert.equal(await count('.editor-problems-chip'), 0, `${name}: the editor lists no problems`)
      console.log(`ok  ${name}: pasted ${clip.nodes.length} nodes, ${clip.edges.length} wires, no problems`)

      await page.keyboard.press(`${MOD}+a`)
      await page.keyboard.press(`${MOD}+c`)
      await page.waitForFunction((t) => navigator.clipboard.readText().then((c) => c !== t && c.includes('aurora-graph-clip')), text)
      const back = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()))
      assert.equal(back.nodes.length, clip.nodes.length, `${name}: copy returns every node`)
      assert.equal(back.edges.length, clip.edges.length, `${name}: copy returns every wire`)
      assert.deepEqual(back.nodes.map((n) => n.type).sort(), clip.nodes.map((n) => n.type).sort(), `${name}: same node types`)
      console.log(`ok  ${name}: Ctrl+A, Ctrl+C returns the same graph`)

      await page.keyboard.press(`${MOD}+z`)
      await waitNodes(0)
    }
  } finally {
    await browser.close()
  }
}, { audio: true })
