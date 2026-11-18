// Aurora-s1t7.3: the canvas corners, as in the Grille mock. Add node top-left,
// View menu bottom-left with the minimap stacked directly above it (the menu
// opens above the map), React Flow's credit bottom-centre, and no corner button
// for Tuning (Aurora-e4bi.12: its grab tab reopens it). A bottom
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
      const [a, v, k] = [await add(), await view(), await credit()]
      assert.ok(a.left < mid && a.top - c.top < 40, `${tag}: Add node top-left (${a.left}, ${a.top})`)
      assert.match(await page.locator('.editor-add-node').innerText(), /Add node/)
      assert.equal(await page.locator('.react-flow__panel.bottom.right').count(), 0, `${tag}: no corner button for Tuning`)
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
      const v3 = await view()
      const m3 = await rect('.react-flow__minimap')
      if (side === 'right') {
        assert.ok(v3.left < mid, `${tag}: zoom stays bottom-left`)
        const tab = await rect('.editor-grab')
        assert.ok(Math.abs(tab.right - dr.left) <= 2, `${tag}: grab tab ${tab.right} on the drawer edge ${dr.left}`)
        step(`${tag}: side drawer, the grab tab on its edge`)
      } else {
        for (const [name, r] of [['View menu', v3], ['minimap', m3]]) assert.ok(r.bottom <= dr.top + 1, `${tag}: ${name} bottom ${r.bottom} above the dock ${dr.top}`)
        const kc = await credit()
        assert.ok(kc.bottom <= dr.top + 1, `${tag}: credit above the dock`)
        await shot(`${tag}-dock`)
        await controlsButton(page).click()
        await page.waitForTimeout(400)
        for (const [name, r] of [['View menu', await view()], ['minimap', await rect('.react-flow__minimap')], ['credit', await credit()]]) assert.equal(r.visible, false, `${tag}: ${name} hidden at full height`)
        await controlsButton(page).click()
        await page.waitForTimeout(400)
        assert.equal((await view()).visible, true, `${tag}: back at half height`)
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
