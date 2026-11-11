// Aurora-s1t7.3: the canvas corners, as in the Grille mock. Add node top-left,
// View menu bottom-left with the minimap stacked directly above it (the menu
// opens above the map), Dashboard controls bottom-right, React Flow's credit
// bottom-centre. A side drawer: Dashboard controls steps left of it. A bottom
// dock at half height: the bottom corners and the minimap lift above it; at
// full height they hide. Frames: 1280x800, 1000x600, 700x900, 400x800.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { controlsButton } from '../lib/editorMenu.mjs'

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const SHOTS = process.env.SHOTS
  const rect = (sel) => page.locator(sel).first().evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, visible: getComputedStyle(el).visibility !== 'hidden' }
  })
  const canvas = () => rect('.editor-canvas')
  const add = () => rect('.editor-add-node')
  const dash = () => page.locator('.react-flow__panel.bottom.right button').evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, visible: getComputedStyle(el.closest('.react-flow__panel')).visibility !== 'hidden' }
  })
  const view = () => rect('.editor-view-menu')
  const credit = () => rect('.react-flow__attribution')
  const shot = async (name) => SHOTS && (await page.screenshot({ path: `${SHOTS}/corners-${name}.png` }))

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    assert.equal(await page.locator('.editor-header .editor-add-node').count(), 0, 'Add node is out of the bar')

    for (const [w, h] of [[1280, 800], [1000, 600], [700, 900], [400, 800]]) {
      await page.setViewportSize({ width: w, height: h })
      await page.waitForTimeout(300)
      const tag = `${w}x${h}`
      const c = await canvas()
      const mid = (c.left + c.right) / 2

      // At rest.
      const [a, d, v, k] = [await add(), await dash(), await view(), await credit()]
      assert.ok(a.left < mid && a.top - c.top < 40, `${tag}: Add node top-left (${a.left}, ${a.top})`)
      assert.match(await page.locator('.editor-add-node').innerText(), /Add node/)
      assert.ok(d.right > mid && c.bottom - d.bottom < 40, `${tag}: Dashboard controls bottom-right`)
      assert.ok(v.left < mid && c.bottom - v.bottom < 40, `${tag}: View menu bottom-left`)
      assert.ok(Math.abs((k.left + k.right) / 2 - mid) < 4 && c.bottom - k.bottom < 20, `${tag}: credit bottom-centre ${JSON.stringify({ k, c })}`)
      await shot(`${tag}-rest`)
      step(`${tag}: corners at rest`)

      // Minimap on: stacked directly above the zoom button; the menu opens over it (Aurora-w6zq.3).
      await page.getByRole('button', { name: 'View menu' }).click()
      await page.getByRole('menuitem', { name: 'Show minimap', exact: true }).click()
      await page.locator('.react-flow__minimap').waitFor()
      const m = await rect('.react-flow__minimap')
      const v2 = await view()
      assert.ok(m.bottom <= v2.top && v2.top - m.bottom < 16, `${tag}: minimap ${m.bottom} directly above zoom button ${v2.top}`)
      assert.ok(Math.abs(m.left - v2.left) < 2, `${tag}: minimap left-aligned with the zoom button`)
      await page.getByRole('button', { name: 'View menu' }).click()
      const menu = await rect('.ui-popover:has([role=menu])')
      assert.ok(menu.top <= m.top + 1 && menu.bottom >= m.bottom - 1 && Math.abs(menu.left - m.left) < 2, `${tag}: View menu ${JSON.stringify(menu)} covers the minimap ${JSON.stringify(m)}`)
      await shot(`${tag}-minimap`)
      await page.keyboard.press('Escape')
      step(`${tag}: minimap above zoom, View menu over the minimap`)

      // Drawer open.
      await controlsButton(page).click()
      await page.locator('.ui-drawer').waitFor()
      await page.waitForTimeout(400)
      const dr = await rect('.ui-drawer')
      const side = await page.locator('.ui-drawer').getAttribute('data-side')
      const d3 = await dash()
      const v3 = await view()
      const m3 = await rect('.react-flow__minimap')
      if (side === 'right') {
        assert.ok(d3.right <= dr.left, `${tag}: Dashboard controls ${d3.right} left of the drawer ${dr.left}`)
        assert.ok(v3.left < mid, `${tag}: zoom stays bottom-left`)
        // Aurora-w6zq.1: where the button and the credit overlap, the button is what a click hits.
        const hit = await page.evaluate(() => {
          const b = document.querySelector('.react-flow__panel.bottom.right button').getBoundingClientRect()
          const k = document.querySelector('.react-flow__attribution').getBoundingClientRect()
          const ox = [Math.max(b.left, k.left), Math.min(b.right, k.right)]
          const oy = [Math.max(b.top, k.top), Math.min(b.bottom, k.bottom)]
          const overlaps = ox[0] < ox[1] && oy[0] < oy[1]
          const pts = overlaps ? [[(ox[0] + ox[1]) / 2, (oy[0] + oy[1]) / 2]] : []
          pts.push([(b.left + b.right) / 2, (b.top + b.bottom) / 2])
          return { overlaps, ok: pts.every(([x, y]) => document.elementFromPoint(x, y)?.closest('.react-flow__panel.bottom.right button')) }
        })
        assert.ok(hit.ok, `${tag}: Dashboard controls is under another element (overlaps the credit: ${hit.overlaps})`)
        step(`${tag}: side drawer, Dashboard controls steps left of it${hit.overlaps ? ' and draws over the credit' : ''}`)
      } else {
        for (const [name, r] of [['Dashboard controls', d3], ['View menu', v3], ['minimap', m3]]) assert.ok(r.bottom <= dr.top + 1, `${tag}: ${name} bottom ${r.bottom} above the dock ${dr.top}`)
        const kc = await credit()
        assert.ok(kc.bottom <= dr.top + 1, `${tag}: credit above the dock`)
        await shot(`${tag}-dock`)
        await page.locator('.ui-drawer-toggle').click()
        await page.waitForTimeout(400)
        for (const [name, r] of [['Dashboard controls', await dash()], ['View menu', await view()], ['minimap', await rect('.react-flow__minimap')], ['credit', await credit()]]) assert.equal(r.visible, false, `${tag}: ${name} hidden at full height`)
        await page.locator('.ui-drawer-toggle').click()
        await page.waitForTimeout(400)
        assert.equal((await dash()).visible, true, `${tag}: back at half height`)
        step(`${tag}: dock lifts the corners and hides them at full height`)
      }
      await page.keyboard.press('Escape')
      await page.locator('.ui-drawer').waitFor({ state: 'detached' })
      // Back to the minimap off for the next frame.
      await page.getByRole('button', { name: 'View menu' }).click()
      await page.getByRole('menuitem', { name: 'Hide minimap', exact: true }).click()
    }
  } finally {
    await browser.close()
  }
})
