// Aurora-s1t7.4, Aurora-u8jx.6.1: the Preview island. One whole-row Preview button that hides the rest, a
// layout menu button, then plain 14 px cells, 8 per row. A sim layout can be picked over working lights
// (Sim: basic room is 4 cells), the pick lasts across a reload, and the island stays beside a side drawer and
// inside the window at 1100, 700, 400 and 360 px. The no-lights, test and announcement rules are unit tested
// (graph/previewLayout.test.ts); the app binary must be rebuilt after core preview changes.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { controlsButton } from '../lib/editorMenu.mjs'

// The dev-only /api/dev/errors routes need this in the app's environment.
process.env.AURORA_DEV_ERRORS = '1'

await withEditorStack(async ({ editorUrl, aurora }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const island = page.locator('.preview-island')
  const head = page.getByRole('button', { name: /^(Hide|Show) preview$/ })
  const layoutButton = page.getByRole('button', { name: /^Preview layout, / })
  const cells = () => page.locator('.zones-cell').evaluateAll((cs) => cs.map((c) => { const r = c.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bg: c.style.backgroundColor } }))
  const open = async () => {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    await island.waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll('.zones-cell')].some((c) => c.style.backgroundColor))
  }

  try {
    await page.evaluate(() => sessionStorage.clear()).catch(() => {})
    await open()
    assert.equal((await head.innerText()).trim(), 'Preview')
    assert.match(await layoutButton.getAttribute('aria-label'), /^Preview layout, (Lights|.+)$/)
    const cs = await cells()
    assert.ok(cs.length > 0)
    for (const c of cs) assert.ok(c.w === 14 && c.h === 14, `cell is 14 px: ${JSON.stringify(c)}`)
    assert.equal(new Set(cs.map((c) => c.x)).size, Math.min(8, cs.length), '8 per row')
    assert.equal(new Set(cs.map((c) => `${c.x},${c.y}`)).size, cs.length, 'no two cells overlap (no screen mapping)')
    assert.equal(await page.locator('.preview-island canvas').count(), 0, 'cells are DOM elements, not a canvas')
    step(`Preview island: header, layout button, ${cs.length} plain 14 px cells, 8 per row`)

    // The layout menu lists the layouts with a tick on the shown one.
    await layoutButton.click()
    const rows = page.getByRole('menuitemradio')
    await rows.first().waitFor()
    const names = await rows.allInnerTexts()
    assert.ok(names.includes('Sim: basic room'), `menu rows: ${names}`)
    assert.equal(await page.getByRole('menuitemradio', { checked: true }).count(), 1, 'one ticked row')
    // A sim can be picked while the lights work, and it draws 4 cells.
    await page.getByRole('menuitemradio', { name: 'Sim: basic room' }).click()
    await page.waitForFunction(() => document.querySelectorAll('.zones-cell').length === 4)
    assert.equal(await layoutButton.getAttribute('aria-label'), 'Preview layout, Sim: basic room')
    await page.waitForFunction(() => [...document.querySelectorAll('.zones-cell')].some((c) => c.style.backgroundColor))
    step('Sim: basic room picked: 4 cells, the button reads the pick')

    // The pick lasts the session, a reload included.
    await page.reload()
    await page.waitForSelector('.aurora-node')
    await page.waitForFunction(() => document.querySelectorAll('.zones-cell').length === 4)
    assert.equal(await layoutButton.getAttribute('aria-label'), 'Preview layout, Sim: basic room')
    step('the pick is kept across a reload')

    // Back to the lights.
    await layoutButton.click()
    await page.getByRole('menuitemradio', { name: /^(?!Sim:)/ }).first().click()
    await page.waitForFunction(() => !document.querySelector('.preview-layout')?.getAttribute('aria-label')?.includes('Sim:'))
    step('Lights picked again')

    // No reachable lights (core's output_link row): the island moves to Sim: your room by itself, Lights is
    // greyed, Test is off with its reason; when the row clears the island goes back to the lights.
    const post = (path, body) => fetch(`${aurora}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    assert.equal((await post('/api/dev/errors', { source: 'output_link', message: "Aurora can't reach your lights." })).status, 200, 'dev error route (needs a dev build)')
    await page.waitForFunction(() => document.querySelector('.preview-layout')?.getAttribute('aria-label') === 'Preview layout, Sim: your room', null, { timeout: 8000 })
    await page.waitForFunction(() => /reach your lights\. Preview shows Sim: your room\./.test(document.querySelector('[data-announcer]')?.textContent ?? ''), null, { timeout: 5000 })
    await layoutButton.click()
    assert.equal(await page.getByRole('menuitemradio').first().getAttribute('aria-disabled'), 'true', 'Lights is greyed')
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.editor-split-main').isDisabled(), true, 'Test is off with no lights')
    await post('/api/dev/errors/remove', { source: 'output_link' })
    await page.waitForFunction(() => !document.querySelector('.preview-layout')?.getAttribute('aria-label')?.includes('Sim:'), null, { timeout: 8000 })
    step('no lights: Sim: your room, announced, Lights greyed, Test off; back to Lights when they return')

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
    step('collapses and expands from the header, kept across a reload')

    // Visible beside a side drawer.
    await controlsButton(page).click()
    await page.locator('.ui-drawer').waitFor()
    await page.waitForTimeout(400)
    const [i, d] = await Promise.all([island.boundingBox(), page.locator('.ui-drawer').boundingBox()])
    assert.ok(i.x + i.width <= d.x + 1, `island ${i.x + i.width} left of the drawer ${d.x}`)
    step('stays visible beside a side drawer')

    // The island, longest layout name picked, stays inside the window with no page scroll.
    for (const [w, h] of [[1100, 800], [700, 900], [400, 800], [360, 800]]) {
      await page.setViewportSize({ width: w, height: h })
      await page.goto(`${editorUrl}?effect=builtin.video`)
      await page.waitForSelector('.aurora-node')
      await island.waitFor()
      if ((await layoutButton.getAttribute('aria-label')) !== 'Preview layout, Sim: basic room') {
        await layoutButton.click()
        await page.getByRole('menuitemradio', { name: 'Sim: basic room' }).click()
      }
      await page.waitForFunction(() => document.querySelectorAll('.zones-cell').length === 4)
      const m = await page.evaluate(() => {
        const r = document.querySelector('.preview-island').getBoundingClientRect()
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: Math.round(r.width), scroll: document.documentElement.scrollWidth - innerWidth }
      })
      assert.ok(m.left >= 0 && m.right <= w && m.scroll <= 0, `${w}x${h}: island outside the window: ${JSON.stringify(m)}`)
      step(`${w}x${h}: island ${m.w} px wide, inside the window`)
    }
  } finally {
    await browser.close()
  }
})
