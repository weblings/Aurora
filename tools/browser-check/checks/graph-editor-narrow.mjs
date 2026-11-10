// Narrow windows (Aurora-daaa.27.4): no horizontal page scroll and every bar control inside the
// viewport, with each drawer open, at 1100, 900, 700, 520 and 400 px (Aurora-daaa.29.1). Undo and
// Redo must stay reachable by keyboard at every width (buttons, or the More menu below 520 px).
// SHOTS=<dir> saves screenshots.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { controlsButton, openDetails } from '../lib/editorMenu.mjs'

const SHOTS = process.env.SHOTS
const check = (width, what, p) => {
  assert.ok(p.scroll <= 0 && p.out.length === 0, `${width} px, ${what}: ${JSON.stringify(p)}`)
}
// Tab from the Dashboard link until focus is on Undo (enabled: the check dragged a node first), or on
// More (then open it and find both items).
async function keyboardReachesUndoRedo(page, width) {
  await page.locator('.editor-back').focus()
  const seen = []
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    const name = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim() || '')
    seen.push(name)
    if (name === 'More') {
      await page.keyboard.press('Enter')
      await page.getByRole('menuitem', { name: 'Undo' }).waitFor({ timeout: 3000 })
      await page.getByRole('menuitem', { name: 'Redo' }).waitFor({ timeout: 3000 })
      await page.keyboard.press('Escape')
      return
    }
    if (name === 'Undo') {
      assert.equal(await page.getByRole('button', { name: 'Redo' }).count(), 1, `${width} px: no Redo button`)
      return
    }
  }
  assert.fail(`${width} px: Undo/Redo not reachable by keyboard; tabbed through ${JSON.stringify(seen)}`)
}

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    // One edit, so Undo is enabled and Tab can land on it.
    const box = await page.locator('.aurora-node').first().boundingBox()
    await page.mouse.move(box.x + 20, box.y + 10)
    await page.mouse.down()
    await page.mouse.move(box.x + 40, box.y + 30, { steps: 4 })
    await page.mouse.up()
    for (const width of [1100, 900, 700, 520, 400]) {
      await page.setViewportSize({ width, height: 800 })
      await page.waitForTimeout(400)
      const probe = () => page.evaluate(() => {
        const vw = innerWidth
        const out = [...document.querySelectorAll('button, input, select, [role=menuitem]')]
          .filter((el) => !el.closest('.react-flow__node') && !el.closest('.react-flow__minimap'))
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && r.height > 0 && (r.right > vw + 1 || r.left < -1))
          .map(({ el, r }) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30) + ' ' + Math.round(r.left) + '..' + Math.round(r.right))
        return { scroll: document.documentElement.scrollWidth - vw, out }
      })
      let p = await probe()
      console.log(width, 'closed:', JSON.stringify(p))
      check(width, 'closed', p)
      await keyboardReachesUndoRedo(page, width)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${width}-closed.png` })
      await controlsButton(page).click()
      await page.waitForTimeout(500)
      p = await probe()
      console.log(width, 'controls drawer:', JSON.stringify(p))
      check(width, 'controls drawer', p)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${width}-controls.png` })
      await page.keyboard.press('Escape')
      await openDetails(page, page.locator('.aurora-node', { hasText: 'Rescale' }).first())
      await page.waitForTimeout(500)
      p = await probe()
      console.log(width, 'details drawer:', JSON.stringify(p))
      check(width, 'details drawer', p)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${width}-details.png` })
      await page.keyboard.press('Escape')
    }
  } finally {
    await browser.close()
  }
})
console.log('graph-editor narrow: all passed')
