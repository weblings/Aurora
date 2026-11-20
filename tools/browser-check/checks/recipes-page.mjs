// Aurora-4g4d.2: the recipes page (web/graph-editor, `npm run build:recipes`). Needs no Aurora and no stack:
// serves dist-recipes over localhost (a secure context, as GitHub Pages is) and checks, per recipe, the
// read-only viewer (editor nodes, no node menu, disabled inputs, View menu without a minimap), Copy
// (clipboard text is the clip file, Copied state), the select-and-copy fallback when writeText is refused, the
// outline (SVG wide, list under 650 px), and no sideways page scroll at 1100, 700, 400 and 360 px.
// `SHOTS=<dir>` saves a screenshot per width.
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
const slugs = Object.keys(JSON.parse(readFileSync(join(RECIPES, 'recipes.json'), 'utf8')).recipes.reduce((o, r) => ({ ...o, [r.file]: 1 }), {}))
const step = (label) => console.log(`ok  ${label}`)

const browser = await launch()
try {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage()
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const settle = () => page.waitForFunction(() => document.querySelector('.react-flow__node') !== null).then(() => page.waitForTimeout(400))

  await page.goto(base)
  await settle()
  assert.equal(await page.locator('.recipes-list .ui-button').count(), slugs.length)
  step(`${slugs.length} recipes listed`)

  for (const slug of slugs) {
    const clip = JSON.parse(clips[slug])
    await page.goto(`${base}#${slug}`)
    await page.reload()
    await settle()
    assert.equal(await page.locator('.recipe-viewer .react-flow__node').count(), clip.nodes.length, `${slug}: nodes`)
    assert.equal(await page.locator('.recipe-viewer .react-flow__edge').count(), clip.edges.length, `${slug}: wires`)
    assert.equal(await page.locator('.recipe-viewer .aurora-node-more').count(), 0, `${slug}: no node menu`)
    const inputs = page.locator('.recipe-viewer .param input, .recipe-viewer .param select')
    const open = await inputs.evaluateAll((els) => els.filter((e) => !e.disabled).length)
    assert.equal(open, 0, `${slug}: every param input is disabled`)
    assert.equal(await page.locator('.recipe-viewer .react-flow__node.draggable').count(), 0, `${slug}: nothing drags`)
    assert.equal(await page.locator('.recipe-viewer .react-flow__handle').evaluateAll((els) => els.filter((e) => getComputedStyle(e).pointerEvents !== 'none').length), 0, `${slug}: handles take no pointer`)
    assert.equal(await page.locator('.recipe-viewer .react-flow__minimap').count(), 0)
    assert.equal(await page.locator('.recipe-viewer .react-flow__attribution').count(), 1, `${slug}: React Flow credit`)
    // The outline names every node by its real type.
    const outline = await page.locator('.recipe-outline-list').innerText()
    for (const n of clip.nodes) assert.ok(outline.includes(n.type), `${slug}: outline names ${n.type}`)

    // Copy puts the clip file's text on the clipboard.
    await page.getByRole('button', { name: 'Copy', exact: true }).click()
    await page.getByRole('button', { name: 'Copied', exact: true }).waitFor()
    assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'), clips[slug].trim(), `${slug}: clipboard text is the clip file`)
    step(`${slug}: viewer read-only, outline, Copy`)
  }

  // View menu: zoom and fit only.
  await page.locator('.editor-view-menu').click()
  const items = await page.getByRole('menuitem').allInnerTexts()
  assert.deepEqual(items, ['Zoom in', 'Zoom out', 'Fit view'])
  await page.keyboard.press('Escape')
  step('View menu: Zoom in, Zoom out, Fit view')

  // Writing is refused (insecure context, no gesture): the text is shown selected.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) }, configurable: true })
  })
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  const manual = page.locator('.recipe-manual textarea')
  await manual.waitFor()
  assert.equal(await manual.inputValue(), clips[slugs[slugs.length - 1]].trim())
  assert.ok(await manual.evaluate((el) => el.selectionStart === 0 && el.selectionEnd === el.value.length), 'the text is selected')
  step('refused write shows the clip selected')

  // Keyboard: Tab reaches the list, then Copy, and Enter copies.
  await page.reload()
  await settle()
  await page.keyboard.press('Tab')
  assert.ok(await page.evaluate(() => document.activeElement?.closest('.recipes-list') !== null), 'Tab starts in the recipe list')
  await page.getByRole('button', { name: 'Copy', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Copied', exact: true }).waitFor()
  step('keyboard: list then Copy')

  // Widths: no sideways scroll, the right outline for the width.
  for (const width of [1100, 700, 400, 360]) {
    await page.setViewportSize({ width, height: 900 })
    for (const slug of ['candles', 'bands-as-rgb']) {
      await page.goto(`${base}#${slug}`)
      await page.reload()
      await settle()
      const m = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        svg: getComputedStyle(document.querySelector('.recipe-outline-svg')).display,
        listH: document.querySelector('.recipe-outline-list').getBoundingClientRect().height,
        viewer: Math.round(document.querySelector('.recipe-viewer').getBoundingClientRect().width),
        listCol: Math.round(document.querySelector('.recipes-list').getBoundingClientRect().height),
      }))
      assert.ok(m.scroll <= m.client, `${slug} at ${width}: page scrolls sideways (${m.scroll} > ${m.client})`)
      if (width >= 650) assert.notEqual(m.svg, 'none', `${slug} at ${width}: SVG outline`)
      else {
        assert.equal(m.svg, 'none', `${slug} at ${width}: no SVG under 650 px`)
        assert.ok(m.listH > 40, `${slug} at ${width}: text list shown`)
      }
      console.log(`    ${slug} @${width}: viewer ${m.viewer}px wide, list ${m.listCol}px tall, outline ${m.svg === 'none' ? `list ${Math.round(m.listH)}px tall` : 'svg'}`)
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true })
        await page.screenshot({ path: join(SHOTS, `recipes-${slug}-${width}.png`), fullPage: true })
      }
    }
    step(`${width} px: no sideways scroll`)
  }
} finally {
  await browser.close()
  server.close()
}
console.log('recipes page ok')
