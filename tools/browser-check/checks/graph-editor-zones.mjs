// Aurora-s1t7.4: the Zones island, as in the Grille mock with the Zones and
// no-resize switches on. Header "Zones" with a hide chevron; one 14 px cell per
// zone, 8 per row, no screen mapping; no size button; collapses and expands
// from the header and keeps that across a reload. Stays visible beside a side
// drawer and above the bottom dock (the narrow check covers 700x900, 1000x600).
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { controlsButton } from '../lib/editorMenu.mjs'

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const island = page.locator('.zones-island')
  const head = page.getByRole('button', { name: /^(Hide|Show) zones$/ })
  const cells = () => page.locator('.zones-cell').evaluateAll((cs) => cs.map((c) => { const r = c.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bg: c.style.backgroundColor } }))

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    await island.waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll('.zones-cell')].some((c) => c.style.backgroundColor))

    assert.equal((await island.innerText()).trim(), 'Zones')
    assert.equal(await page.locator('.zones-island button').count(), 1, 'the header is the only button: no resize')
    assert.equal(await page.locator('.zones-island canvas').count(), 0, 'cells are DOM elements, not a canvas')
    const cs = await cells()
    assert.ok(cs.length > 0)
    for (const c of cs) assert.ok(c.w === 14 && c.h === 14, `cell is 14 px: ${JSON.stringify(c)}`)
    const cols = new Set(cs.map((c) => c.x)).size
    assert.equal(cols, Math.min(8, cs.length), `8 per row: ${cols} columns for ${cs.length} cells`)
    assert.equal(new Set(cs.map((c) => `${c.x},${c.y}`)).size, cs.length, 'no two cells overlap (no screen mapping)')
    step(`Zones island: header, ${cs.length} plain 14 px cells, 8 per row, no resize`)

    // Collapse and expand from the header; kept across a reload.
    await head.click()
    assert.equal(await page.locator('.zones-cell').count(), 0, 'collapsed hides the cells')
    assert.equal(await head.getAttribute('aria-expanded'), 'false')
    await page.reload()
    await page.waitForSelector('.aurora-node')
    await island.waitFor()
    assert.equal(await page.locator('.zones-cell').count(), 0, 'collapsed state kept for the session')
    await head.click()
    await page.waitForFunction(() => document.querySelectorAll('.zones-cell').length > 0)
    assert.equal(await head.getAttribute('aria-expanded'), 'true')
    step('collapses and expands from the header, kept across a reload')

    // Visible beside a side drawer.
    await controlsButton(page).click()
    await page.locator('.ui-drawer').waitFor()
    await page.waitForTimeout(400)
    const [i, d] = await Promise.all([island.boundingBox(), page.locator('.ui-drawer').boundingBox()])
    assert.ok(i.x + i.width <= d.x + 1, `island ${i.x + i.width} left of the drawer ${d.x}`)
    step('stays visible beside a side drawer')
  } finally {
    await browser.close()
  }
})
