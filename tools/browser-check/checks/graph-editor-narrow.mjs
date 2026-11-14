// Narrow windows (Aurora-daaa.27.4): no horizontal page scroll and every bar control inside the
// viewport, with each drawer open, at 1100, 900, 700, 520 and 400 px (Aurora-daaa.29.1). Undo and
// Redo must stay reachable by keyboard at every width (icon buttons at every width, Aurora-s1t7.5).
// SHOTS=<dir> saves screenshots.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { controlsButton, openDetails } from '../lib/editorMenu.mjs'

const SHOTS = process.env.SHOTS
const check = (width, what, p) => {
  assert.ok(p.scroll <= 0 && p.out.length === 0, `${width} px, ${what}: ${JSON.stringify(p)}`)
}
// Tab from the Dashboard link until focus is on Undo (enabled: the check dragged a node first); Redo is
// an icon button beside it at every width.
async function keyboardReachesUndoRedo(page, width) {
  await page.locator('.editor-back').focus()
  const seen = []
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    const name = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim() || '')
    seen.push(name)
    if (name === 'Undo') {
      assert.equal(await page.getByRole('button', { name: 'Redo' }).count(), 1, `${width} px: no Redo button`)
      assert.equal(await page.locator('.editor-header [aria-label="Undo"] svg').count(), 1, `${width} px: Undo is not an icon button`)
      return
    }
  }
  assert.fail(`${width} px: Undo/Redo not reachable by keyboard; tabbed through ${JSON.stringify(seen)}`)
}

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  let page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
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
      // Aurora-daaa.29.2: drawer is clamp(280, 40vw, 350) wide and Rescale's box is clear of it.
      const geo = await page.evaluate(() => {
        const d = document.querySelector('.ui-drawer').getBoundingClientRect()
        const n = [...document.querySelectorAll('.aurora-node')].find((el) => el.textContent.includes('Rescale')).getBoundingClientRect()
        return { side: document.querySelector('.ui-drawer').dataset.side, drawerW: Math.round(d.width), drawerLeft: d.left, nodeRight: n.right }
      })
      const want = Math.min(350, Math.max(280, Math.round(width * 0.4)))
      // Below 650 px (or portrait) the drawer docks at the bottom instead; the dock block below checks that.
      if (geo.side === 'right') assert.ok(Math.abs(geo.drawerW - want) <= 1, `${width} px: drawer ${geo.drawerW} px, want ${want}`)
      if (geo.side === 'right' && width >= 520) assert.ok(geo.nodeRight <= geo.drawerLeft + 1, `${width} px: Rescale right ${geo.nodeRight} under drawer at ${geo.drawerLeft}`)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${width}-details.png` })
      await page.keyboard.press('Escape')
      if (width === 1100) {
        // Aurora-daaa.29.5: the node is now clear of the drawer, so opening Details again must not pan.
        await page.waitForTimeout(300)
        const transform = () => page.evaluate(() => document.querySelector('.react-flow__viewport').style.transform)
        const before = await transform()
        await openDetails(page, page.locator('.aurora-node', { hasText: 'Rescale' }).first())
        await page.waitForTimeout(700)
        assert.equal(await transform(), before, `${width} px: view moved although Rescale was already clear of the drawer`)
        await page.keyboard.press('Escape')
      }
    }
    // Aurora-daaa.29.4: bottom dock below 650 px wide or portrait (aspect < 0.75), else the side.
    for (const [w, h, side] of [[400, 800, 'bottom'], [700, 900, 'right'], [1000, 600, 'right'], [1470, 700, 'right']]) {
      await page.setViewportSize({ width: w, height: h })
      await page.waitForTimeout(400)
      await openDetails(page, page.locator('.aurora-node', { hasText: 'Rescale' }).first())
      await page.waitForTimeout(500)
      const dock = () => page.evaluate(() => {
        const d = document.querySelector('.ui-drawer')
        const n = [...document.querySelectorAll('.aurora-node')].find((el) => el.textContent.includes('Rescale')).getBoundingClientRect()
        const r = d.getBoundingClientRect()
        return { side: d.dataset.side, expanded: d.hasAttribute('data-expanded'), top: r.top, h: Math.round(r.height), nodeBottom: n.bottom, scroll: [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight] }
      })
      let g = await dock()
      console.log(`${w}x${h} dock:`, JSON.stringify(g))
      assert.equal(g.side, side, `${w}x${h}: drawer side ${g.side}`)
      assert.ok(g.scroll[0] <= 0 && g.scroll[1] <= 0, `${w}x${h}: page scrolls ${g.scroll}`)
      // Aurora-daaa.35: the zone preview stays visible, left of a side drawer.
      const thumb = await page.evaluate(() => {
        const t = document.querySelector('.zones-island')?.getBoundingClientRect()
        const d = document.querySelector('.ui-drawer').getBoundingClientRect()
        return t ? { right: t.right, left: t.left, top: t.top, bottom: t.bottom, drawerLeft: d.left, drawerTop: d.top } : null
      })
      assert.ok(thumb, `${w}x${h}: no zone preview`)
      if (side === 'right') assert.ok(thumb.right <= thumb.drawerLeft + 1 && thumb.left >= 0, `${w}x${h}: zone preview under the drawer: ${JSON.stringify(thumb)}`)
      else assert.ok(thumb.bottom <= thumb.drawerTop + 1, `${w}x${h}: zone preview under the dock: ${JSON.stringify(thumb)}`)
      if (side === 'bottom') {
        assert.ok(!g.expanded && Math.abs(g.h - h / 2) < h * 0.15, `${w}x${h}: not half height: ${JSON.stringify(g)}`)
        assert.ok(g.nodeBottom <= g.top + 1, `${w}x${h}: Rescale bottom ${g.nodeBottom} under sheet at ${g.top}`)
        const toggle = page.locator('.ui-drawer-toggle')
        await toggle.focus()
        await page.keyboard.press('Enter')
        await page.waitForTimeout(300)
        g = await dock()
        assert.ok(g.expanded, `${w}x${h}: toggle did not expand`)
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/${w}x${h}-dock-full.png` })
        await page.keyboard.press('Enter')
        await page.waitForTimeout(300)
        g = await dock()
        assert.ok(!g.expanded, `${w}x${h}: toggle did not return to half`)
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${w}x${h}-dock.png` })
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      assert.equal(await page.locator('.ui-drawer').count(), 0, `${w}x${h}: Esc left the drawer open`)
    }
    // Aurora-s1t7.2: with a problem showing, the chip sits in the right group just before Undo, and the bar still never wraps or overflows at every width.
    const fresh = await browser.newContext({ viewport: { width: 1470, height: 900 } })
    await page.close()
    page = await fresh.newPage()
    page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    await page.waitForTimeout(1500)
    const barHeight = await page.evaluate(() => document.querySelector('.editor-header').getBoundingClientRect().height)
    const mid = await page.locator('.react-flow__edge[data-id*="ease_hue.frame"][data-id*="gain_hue.frame"] path.react-flow__edge-path').first().evaluate((p) => {
      const m = p.getPointAtLength(p.getTotalLength() / 2)
      const pt = new DOMPoint(m.x, m.y).matrixTransform(p.getScreenCTM())
      return { x: pt.x, y: pt.y }
    })
    await page.mouse.click(mid.x, mid.y)
    await page.keyboard.press('Backspace')
    await page.locator('.editor-problems-chip', { hasText: /\d+ problems?/ }).waitFor()
    for (const width of [1470, 1100, 900, 700, 520, 400, 360]) {
      await page.setViewportSize({ width, height: 800 })
      await page.waitForTimeout(400)
      const g = await page.evaluate(() => {
        const bar = document.querySelector('.editor-header').getBoundingClientRect()
        const chip = document.querySelector('.editor-problems-chip').getBoundingClientRect()
        const next = document.querySelector('.editor-header [aria-label="Undo"]')?.getBoundingClientRect()
        const split = document.querySelector('.editor-split')?.getBoundingClientRect()
        return { barH: bar.height, chipLeft: chip.left, chipRight: chip.right, chipTop: chip.top, nextLeft: next?.left, nextTop: next?.top, splitLeft: split?.left, splitRight: split?.right, vw: innerWidth }
      })
      console.log(width, 'problems chip:', JSON.stringify(g))
      assert.ok(g.nextLeft !== undefined, `${width} px: no Undo button`)
      assert.ok(Math.abs(g.barH - barHeight) < 1, `${width} px: bar wrapped (${g.barH} px, was ${barHeight})`)
      assert.ok(g.chipLeft >= -1 && g.chipRight <= g.vw + 1, `${width} px: chip outside the window: ${JSON.stringify(g)}`)
      assert.ok(g.chipRight <= g.nextLeft + 1 && Math.abs(g.chipTop - g.nextTop) < 20, `${width} px: chip is not just before Undo: ${JSON.stringify(g)}`)
      assert.ok(g.splitLeft >= g.nextLeft && g.splitRight <= g.vw + 1, `${width} px: Test split button is not after Undo and inside the window: ${JSON.stringify(g)}`)
      const test = await page.locator('.editor-split-main').innerText()
      assert.equal(test, 'Test (15s)', `${width} px: the split button reads ${test}, not Test (15s)`)
      assert.equal(await page.locator('.editor-split-main').isDisabled(), true, `${width} px: Test is not disabled with problems`)
      await page.mouse.move(700, 400)
    await page.locator('.editor-split').hover({ force: true })
      assert.match(await page.locator('.ui-tooltip').first().innerText(), /Fix the problems/)
      const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      assert.ok(o <= 0, `${width} px: page scrolls sideways by ${o}`)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${width}-problems.png` })
    }
  } finally {
    await browser.close()
  }
})
console.log('graph-editor narrow: all passed')
