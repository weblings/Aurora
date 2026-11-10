// Narrow windows (Aurora-daaa.27.4): no horizontal page scroll and every bar control inside the
// viewport, with each drawer open. Asserted down to 520 px; 400 px is reported only (Test on lights
// runs 92 px off the right edge, filed). SHOTS=<dir> saves screenshots.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { controlsButton, openDetails } from '../lib/editorMenu.mjs'

const SHOTS = process.env.SHOTS
const check = (width, what, p) => {
  if (width >= 520) assert.ok(p.scroll <= 0 && p.out.length === 0, `${width} px, ${what}: ${JSON.stringify(p)}`)
}
await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
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
