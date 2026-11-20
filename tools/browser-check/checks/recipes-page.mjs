// Aurora-4g4d.2: the recipes page (web/graph-editor, `npm run build:recipes`). Needs no Aurora and no stack:
// serves dist-recipes over localhost (a secure context, as GitHub Pages is) and checks, per recipe, the
// read-only viewer (editor nodes, no node menu, disabled inputs, View menu without a minimap), Copy
// (clipboard text is the clip file, the Copied balloon stays inside the window), the select-and-copy fallback
// when writeText is refused, the Outline switch (wide picture, turned picture under 650 px, the text list
// always in the page), the phone picker (a menu with a checkmark), and no sideways page scroll at 1100, 700,
// 400 and 360 px. `SHOTS=<dir>` saves a screenshot per width.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from '../lib/browser.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(HERE, '..', '..', '..')
const DIST = join(ROOT, 'web', 'graph-editor', 'dist-recipes')
const RECIPES = join(ROOT, 'docs', 'recipes')
const SHOTS = process.env.SHOTS
assert.ok(existsSync(join(DIST, 'recipes.html')), 'run `npm run build:recipes` in web/graph-editor first')

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.md': 'text/markdown' }
const server = createServer((req, res) => {
  const path = join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'recipes.html')
  if (!path.startsWith(DIST) || !existsSync(path) || statSync(path).isDirectory()) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path))
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const base = `http://localhost:${server.address().port}/recipes.html`

const clips = Object.fromEntries(
  readdirSync(RECIPES)
    .filter((f) => f.endsWith('.clip.json'))
    .map((f) => [f.replace('.clip.json', ''), readFileSync(join(RECIPES, f), 'utf8')]),
)
const list = JSON.parse(readFileSync(join(RECIPES, 'recipes.json'), 'utf8')).recipes
const slugs = list.map((r) => r.file)
const step = (label) => console.log(`ok  ${label}`)

const browser = await launch()
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage()
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const settle = () => page.waitForFunction(() => document.querySelector('.react-flow__node') !== null).then(() => page.waitForTimeout(500))
  const open = async (slug) => {
    await page.goto(`${base}#${slug}`)
    await page.reload()
    await settle()
  }

  await open(slugs[0])
  assert.equal(await page.getByRole('tab').count(), slugs.length)
  step(`${slugs.length} recipe pills`)

  for (const slug of slugs) {
    const clip = JSON.parse(clips[slug])
    await open(slug)
    assert.equal(await page.getByRole('tab', { selected: true }).innerText(), list.find((r) => r.file === slug).name, `${slug}: pill selected`)
    assert.equal(await page.locator('.recipe-viewer .react-flow__node').count(), clip.nodes.length, `${slug}: nodes`)
    assert.equal(await page.locator('.recipe-viewer .react-flow__edge').count(), clip.edges.length, `${slug}: wires`)
    assert.equal(await page.locator('.recipe-viewer .aurora-node-more').count(), 0, `${slug}: no node menu`)
    const open0 = await page.locator('.recipe-viewer .param input, .recipe-viewer .param select').evaluateAll((els) => els.filter((e) => !e.disabled).length)
    assert.equal(open0, 0, `${slug}: every param input is disabled`)
    assert.equal(await page.locator('.recipe-viewer .react-flow__node.draggable').count(), 0, `${slug}: nothing drags`)
    assert.equal(await page.locator('.recipe-viewer .react-flow__handle').evaluateAll((els) => els.filter((e) => getComputedStyle(e).pointerEvents !== 'none').length), 0, `${slug}: handles take no pointer`)
    assert.equal(await page.locator('.recipe-viewer .react-flow__minimap').count(), 0)
    assert.equal(await page.locator('.recipe-viewer .react-flow__attribution').count(), 1, `${slug}: React Flow credit`)
    // The text list is in the page, with every node's real type, but never shown while the graph is.
    const text = await page.locator('.recipe-outline-list').textContent()
    for (const n of clip.nodes) assert.ok(text.includes(n.type), `${slug}: text list names ${n.type}`)
    assert.ok((await page.locator('.recipe-outline-list').boundingBox()).width <= 1, `${slug}: text list is visually hidden`)

    await page.getByRole('button', { name: 'Copy', exact: true }).click()
    await page.getByRole('button', { name: 'Copied', exact: true }).waitFor()
    assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'), clips[slug].trim(), `${slug}: clipboard text is the clip file`)
    const balloon = await page.locator('.recipes-balloon').innerText()
    assert.match(balloon, /Paste into graph editor with (Ctrl|Cmd)\+V/, `${slug}: balloon words`)
    step(`${slug}: viewer read-only, text list, Copy`)
  }

  // View menu: zoom and fit only.
  await page.locator('.editor-view-menu').click()
  assert.deepEqual(await page.getByRole('menuitem').allInnerTexts(), ['Zoom in', 'Zoom out', 'Fit view'])
  await page.keyboard.press('Escape')
  step('View menu: Zoom in, Zoom out, Fit view')

  // Outline switch: the graph goes, the picture comes.
  await page.getByText('Outline', { exact: true }).click()
  assert.equal(await page.locator('.recipe-viewer').count(), 0)
  assert.equal(await page.locator('.recipe-outline-svg').isVisible(), true)
  assert.equal(await page.locator('.recipe-outline-svg-tall').isVisible(), false)
  await page.getByText('Outline', { exact: true }).click()
  assert.equal(await page.locator('.recipe-viewer').count(), 1)
  step('Outline switch swaps graph and picture')

  // Writing is refused (insecure context, no gesture): the text is shown selected.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) }, configurable: true })
  })
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  const manual = page.locator('.recipes-manual textarea')
  await manual.waitFor()
  assert.equal(await manual.inputValue(), clips[slugs[slugs.length - 1]].trim())
  assert.ok(await manual.evaluate((el) => el.selectionStart === 0 && el.selectionEnd === el.value.length), 'the text is selected')
  step('refused write shows the clip selected')

  // Keyboard: the pills, then Copy, and Enter copies.
  await open(slugs[0])
  await page.keyboard.press('Tab')
  assert.ok(await page.evaluate(() => document.activeElement?.getAttribute('role') === 'tab'), 'Tab starts on the pills')
  await page.getByRole('button', { name: 'Copy', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Copied', exact: true }).waitFor()
  step('keyboard: pills then Copy')

  // Widths.
  for (const width of [1100, 700, 400, 360]) {
    await page.setViewportSize({ width, height: 900 })
    const phone = width < 650
    for (const slug of ['candles', 'bands-as-rgb']) {
      await open(slug)
      await page.getByText('Outline', { exact: true }).click()
      const m = await page.evaluate(() => {
        const box = (q) => document.querySelector(q).getBoundingClientRect()
        const vis = (q) => getComputedStyle(document.querySelector(q)).display !== 'none'
        const balloonless = !document.querySelector('.recipes-balloon')
        return {
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          wide: vis('.recipe-outline-svg'),
          tall: vis('.recipe-outline-svg-tall'),
          tallRight: Math.round(box('.recipe-outline-svg-tall').right),
          balloonless,
        }
      })
      assert.ok(m.scroll <= m.client, `${slug} at ${width}: page scrolls sideways (${m.scroll} > ${m.client})`)
      assert.equal(m.wide, !phone, `${slug} at ${width}: wide picture only on wide screens`)
      assert.equal(m.tall, phone, `${slug} at ${width}: turned picture only under 650 px`)
      if (phone) assert.ok(m.tallRight <= width, `${slug} at ${width}: turned picture inside the window`)
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true })
        await page.screenshot({ path: join(SHOTS, `recipes-${slug}-${width}.png`), fullPage: true })
      }
    }
    if (phone) {
      // The picker is the editor's menu: a checkmark on the current recipe, and a pick switches recipe.
      await open('loudness-switch')
      await page.locator('.recipes-picker').click()
      const items = page.getByRole('menuitemradio')
      assert.equal(await items.count(), slugs.length)
      assert.equal(await page.getByRole('menuitemradio', { checked: true }).innerText(), 'Loudness switch')
      await page.getByRole('menuitemradio', { name: 'VU meter fill' }).click()
      await page.waitForFunction(() => location.hash === '#vu-meter')
    }
    step(`${width} px: no sideways scroll, right outline`)
  }
} finally {
  await browser.close()
  server.close()
}
console.log('recipes page ok')
