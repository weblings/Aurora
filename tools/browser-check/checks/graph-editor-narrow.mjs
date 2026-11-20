// Narrow windows (Aurora-daaa.27.4): no horizontal page scroll and every bar control inside the
// viewport, with each drawer open, at 1100, 900, 700, 520 and 400 px (Aurora-daaa.29.1). Undo and
// Redo must stay reachable by keyboard at every width (icon buttons at every width, Aurora-s1t7.5).
// SHOTS=<dir> saves screenshots.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { settle } from '../lib/waits.mjs'
import { controlsButton } from '../lib/editorMenu.mjs'

const SHOTS = process.env.SHOTS
const check = (width, what, p) => {
  assert.ok(p.scroll <= 0 && p.out.length === 0, `${width} px, ${what}: ${JSON.stringify(p)}`)
}
// Tab from the Dashboard link until focus is on the Edit button, which holds Undo and Redo at every width.
async function keyboardReachesUndoRedo(page, width) {
  await page.locator('.editor-back').focus()
  const seen = []
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    const name = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim() || '')
    seen.push(name)
    if (name === 'Edit') return
  }
  assert.fail(`${width} px: Undo/Redo not reachable by keyboard; tabbed through ${JSON.stringify(seen)}`)
}

// Aurora-z5y5: the bar collapses in stages (barStage.ts): 1 Dashboard to its arrow, 2 idle Test to its icon,
// 3 the chip to its count. A stage is right when the title keeps min(100, what it wants) at it and would
// not at the stage before (a control that is absent gives nothing back, so it is skipped by the same rule).
const TITLE_MIN = 100
const ATTRS = ['data-back-icon', 'data-test-icon', 'data-chip-compact']
const readForm = (page) => page.evaluate((attrs) => ({
  title: Math.round(document.querySelector('.editor-title-menu').getBoundingClientRect().width),
  spare: Math.round(document.querySelector('.editor-bar-end').getBoundingClientRect().width),
  test: Math.round(document.querySelector('.editor-split-main').getBoundingClientRect().width),
  bar: Math.round(document.querySelector('.editor-header').getBoundingClientRect().width),
  stage: attrs.filter((a) => document.querySelector('.editor-header').hasAttribute(a)).length,
}), ATTRS)
const assertForm = async (page, width, what) => {
  const r = await page.evaluate((attrs) => {
    const bar = document.querySelector('.editor-header')
    const title = document.querySelector('.editor-title-menu')
    const set = (s) => attrs.forEach((a, i) => (s > i ? bar.setAttribute(a, 'true') : bar.removeAttribute(a)))
    const size = (s) => {
      set(s)
      const text = title.querySelector('.editor-title-label')
      const cap = parseFloat(getComputedStyle(title).maxWidth)
      const actual = title.getBoundingClientRect().width
      const want = Math.min(actual + Math.max(0, text.scrollWidth - text.clientWidth), Number.isFinite(cap) ? cap : Infinity)
      return { actual, want }
    }
    const cur = attrs.filter((a) => bar.hasAttribute(a)).length
    const at = size(cur)
    const before = cur > 0 ? size(cur - 1) : null
    set(cur)
    return { cur, at, before }
  }, ATTRS)
  if (r.cur < ATTRS.length) assert.ok(r.at.actual >= Math.min(TITLE_MIN, r.at.want) - 0.5, `${width} px, ${what}: stage ${r.cur} leaves the title ${r.at.actual} px: ${JSON.stringify(r)}`)
  if (r.before) assert.ok(r.before.actual < Math.min(TITLE_MIN, r.before.want), `${width} px, ${what}: stage ${r.cur} is too early, stage ${r.cur - 1} keeps the title at ${r.before.actual} px: ${JSON.stringify(r)}`)
  return r.cur
}
// Sweep the width down and back up: the stage is the same at a fixed width, only goes up while narrowing, and the
// way back up retraces the way down exactly (no hysteresis to carry).
async function sweep(page, what, widths) {
  const seen = []
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 })
    await settle(page)
    const a = await readForm(page)
    await settle(page)
    const b = await readForm(page)
    assert.equal(a.stage, b.stage, `${width} px, ${what}: the stage changed at a fixed width: ${JSON.stringify([a, b])}`)
    await assertForm(page, width, what)
    seen.push([width, b.stage])
  }
  console.log('sweep', what, seen.map(([w, s]) => `${w}:${s}`).join(' '))
  const turn = widths.indexOf(Math.min(...widths))
  const down = seen.slice(0, turn + 1)
  for (let i = 1; i < down.length; i++) assert.ok(down[i][1] >= down[i - 1][1], `${what}: the stage fell while narrowing: ${JSON.stringify(down)}`)
  for (let i = 0; i < turn; i++) assert.equal(seen[seen.length - 1 - i][1], seen[i][1], `${what}: ${seen[i][0]} px gave stage ${seen[i][1]} going down and ${seen[seen.length - 1 - i][1]} coming back`)
}
const SWEEP = [700, 640, 600, 560, 520, 480, 460, 440, 420, 400, 380, 360, 380, 400, 420, 440, 460, 480, 520, 560, 600, 640, 700]

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
      await settle(page)
      const probe = () => page.evaluate(() => {
        const vw = innerWidth
        const out = [...document.querySelectorAll('button, input, select, [role=menuitem]')]
          // The closed grab tab's outer 2 px border sits past the window edge by design.
          .filter((el) => !el.closest('.react-flow__node') && !el.closest('.react-flow__minimap') && !el.closest('.editor-grab'))
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
      await settle(page)
      p = await probe()
      console.log(width, 'controls drawer:', JSON.stringify(p))
      check(width, 'controls drawer', p)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${width}-controls.png` })
      // Aurora-daaa.29.2: the drawer is clamp(280, 40vw, 350) wide.
      const geo = await page.evaluate(() => {
        const d = document.querySelector('.ui-drawer')
        return { side: d.dataset.side, drawerW: Math.round(d.getBoundingClientRect().width) }
      })
      const want = Math.min(350, Math.max(280, Math.round(width * 0.4)))
      // Below 650 px the drawer docks at the bottom instead; the dock block below checks that.
      if (geo.side === 'right') assert.ok(Math.abs(geo.drawerW - want) <= 1, `${width} px: drawer ${geo.drawerW} px, want ${want}`)
      await page.keyboard.press('Escape')
    }
    // Aurora-daaa.29.4: bottom dock below 650 px wide only (Aurora-daaa.37), else the side, even in wide portrait.
    for (const [w, h, side] of [[400, 800, 'bottom'], [700, 900, 'right'], [1000, 600, 'right'], [1470, 700, 'right'], [900, 1400, 'right']]) {
      await page.setViewportSize({ width: w, height: h })
      await settle(page)
      await controlsButton(page).click()
      await settle(page)
      const dock = () => page.evaluate(() => {
        const d = document.querySelector('.ui-drawer')
        const r = d.getBoundingClientRect()
        return { side: d.dataset.side, expanded: d.hasAttribute('data-expanded'), top: r.top, h: Math.round(r.height), scroll: [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight] }
      })
      let g = await dock()
      console.log(`${w}x${h} dock:`, JSON.stringify(g))
      assert.equal(g.side, side, `${w}x${h}: drawer side ${g.side}`)
      assert.ok(g.scroll[0] <= 0 && g.scroll[1] <= 0, `${w}x${h}: page scrolls ${g.scroll}`)
      // Aurora-daaa.35: the zone preview stays visible, left of a side drawer.
      const thumb = await page.evaluate(() => {
        const t = document.querySelector('.preview-island')?.getBoundingClientRect()
        const d = document.querySelector('.ui-drawer').getBoundingClientRect()
        return t ? { right: t.right, left: t.left, top: t.top, bottom: t.bottom, drawerLeft: d.left, drawerTop: d.top } : null
      })
      assert.ok(thumb, `${w}x${h}: no zone preview`)
      if (side === 'right') assert.ok(thumb.right <= thumb.drawerLeft + 1 && thumb.left >= 0, `${w}x${h}: zone preview under the drawer: ${JSON.stringify(thumb)}`)
      else assert.ok(thumb.bottom <= thumb.drawerTop + 1, `${w}x${h}: zone preview under the dock: ${JSON.stringify(thumb)}`)
      if (side === 'bottom') {
        assert.ok(!g.expanded && Math.abs(g.h - h / 2) < h * 0.15, `${w}x${h}: not half height: ${JSON.stringify(g)}`)
        const toggle = controlsButton(page)
        await toggle.focus()
        await page.keyboard.press('Enter')
        await settle(page)
        g = await dock()
        assert.ok(g.expanded, `${w}x${h}: grab tab did not expand`)
        if (SHOTS) await page.screenshot({ path: `${SHOTS}/${w}x${h}-dock-full.png` })
        await page.keyboard.press('Enter')
        await settle(page)
        g = await dock()
        assert.ok(!g.expanded, `${w}x${h}: grab tab did not return to half`)
      }
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${w}x${h}-dock.png` })
      // A hover tooltip left under the pointer takes the first Esc, so park the pointer first.
      await page.mouse.move(2, h - 2)
      await page.waitForTimeout(300) // the tooltip's own hide delay
      await page.keyboard.press('Escape')
      await page.locator('.ui-drawer').waitFor({ state: 'detached', timeout: 2_000 }).catch(() => {})
      assert.equal(await page.locator('.ui-drawer').count(), 0, `${w}x${h}: Esc left the drawer open`)
    }
    // Aurora-s1t7.2: with a problem showing, the chip sits in the right group just before Test, and the bar still never wraps or overflows at every width.
    const fresh = await browser.newContext({ viewport: { width: 1470, height: 900 } })
    await page.close()
    page = await fresh.newPage()
    page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    await settle(page)
    const barHeight = await page.evaluate(() => document.querySelector('.editor-header').getBoundingClientRect().height)
    for (const width of [520, 450, 420, 400, 360]) {
      await page.setViewportSize({ width, height: 800 })
      await settle(page)
      const f = await readForm(page)
      console.log(width, 'title/test (no problem):', JSON.stringify(f))
      await assertForm(page, width, 'no problem')
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/bar-${width}-clean.png`, clip: { x: 0, y: 0, width, height: 70 } })
    }
    await sweep(page, 'no problem', SWEEP)
    await page.setViewportSize({ width: 1470, height: 900 })
    await settle(page)
    const mid = await page.locator('.react-flow__edge[data-id*="ease_hue.frame"][data-id*="gain_hue.frame"] path.react-flow__edge-path').first().evaluate((p) => {
      const m = p.getPointAtLength(p.getTotalLength() / 2)
      const pt = new DOMPoint(m.x, m.y).matrixTransform(p.getScreenCTM())
      return { x: pt.x, y: pt.y }
    })
    await page.mouse.click(mid.x, mid.y)
    await page.keyboard.press('Backspace')
    await page.locator('.editor-problems-chip', { hasText: /\d+ problems?/ }).waitFor()
    for (const width of [1470, 1100, 900, 700, 520, 450, 420, 400, 360]) {
      await page.setViewportSize({ width, height: 800 })
      await settle(page)
      const g = await page.evaluate(() => {
        const bar = document.querySelector('.editor-header').getBoundingClientRect()
        const chip = document.querySelector('.editor-problems-chip').getBoundingClientRect()
        const next = document.querySelector('.editor-header .editor-split')?.getBoundingClientRect()
        const split = document.querySelector('.editor-split')?.getBoundingClientRect()
        return { barH: bar.height, chipLeft: chip.left, chipRight: chip.right, chipTop: chip.top, nextLeft: next?.left, nextTop: next?.top, splitLeft: split?.left, splitRight: split?.right, vw: innerWidth }
      })
      console.log(width, 'problems chip:', JSON.stringify(g))
      // Aurora-u8jx.9: per-control widths of the bar's direct children, to plan which controls fold.
      const parts = await page.evaluate(() => [...document.querySelector('.editor-header').children].map((el) => `${(el.getAttribute('aria-label') || el.className.toString().split(' ').find((c) => c.startsWith('editor-')) || el.tagName)}=${Math.round(el.getBoundingClientRect().width)}`))
      console.log(width, 'bar widths:', parts.join(' '))
      assert.ok(g.nextLeft !== undefined, `${width} px: no Test split button`)
      assert.ok(Math.abs(g.barH - barHeight) < 1, `${width} px: bar wrapped (${g.barH} px, was ${barHeight})`)
      assert.ok(g.chipLeft >= -1 && g.chipRight <= g.vw + 1, `${width} px: chip outside the window: ${JSON.stringify(g)}`)
      assert.ok(g.chipRight <= g.nextLeft + 1 && Math.abs(g.chipTop - g.nextTop) < 20, `${width} px: chip is not just before Test: ${JSON.stringify(g)}`)
      assert.ok(g.splitRight <= g.vw + 1, `${width} px: Test split button is not inside the window: ${JSON.stringify(g)}`)
      const form = await readForm(page)
      console.log(width, 'title/test (with a problem):', JSON.stringify(form))
      await assertForm(page, width, 'with a problem')
      const icon = form.stage >= 2
      if (SHOTS && [520, 450, 420, 400, 360].includes(width)) await page.screenshot({ path: `${SHOTS}/bar-${width}-problem.png`, clip: { x: 0, y: 0, width, height: 70 } })
      const main = page.locator('.editor-split-main')
      assert.equal(await main.getAttribute('aria-label'), icon ? 'Test (15s)' : 'Test on lights', `${width} px: Test's name`)
      if (!icon) assert.equal(await main.innerText(), 'Test (15s)', `${width} px: the label`)
      assert.equal(await page.locator('.editor-problems-chip .ui-icon[data-chevron]').count(), 1, `${width} px: the chip has no chevron`)
      assert.equal(await page.locator('.editor-split-main').isDisabled(), true, `${width} px: Test is not disabled with problems`)
      await page.mouse.move(700, 400)
    await page.locator('.editor-split').hover({ force: true })
      assert.match(await page.locator('.ui-tooltip').first().innerText(), /Fix the problems/)
      const o = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      assert.ok(o <= 0, `${width} px: page scrolls sideways by ${o}`)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${width}-problems.png` })
      if (SHOTS && width === 400) await page.screenshot({ path: `${SHOTS}/400-icon-test.png`, clip: { x: 0, y: 0, width, height: 120 } })
    }
    await sweep(page, 'with a problem', SWEEP)
    // Aurora-u8jx.9.1: with the problem undone, enabled Test in its icon form keeps its name and tooltip.
    // Without a chip the title keeps its room down to 360 px, so this goes below the targets to reach the icon form.
    for (const width of [340, 320]) {
      await page.setViewportSize({ width, height: 800 })
      await page.keyboard.press('Control+z')
      await page.locator('.editor-problems-chip').waitFor({ state: 'detached' })
      await settle(page)
      assert.ok((await readForm(page)).stage >= 2, `${width} px: expected the icon form`)
      const main = page.locator('.editor-split-main')
      assert.equal(await main.getAttribute('aria-label'), 'Test (15s)', `${width} px: enabled icon Test's name`)
      assert.equal(await page.getByRole('button', { name: 'Test (15s)' }).count(), 1, `${width} px: Test is not reachable by name`)
      assert.equal(await main.isDisabled(), false, `${width} px: Test is disabled with no problems`)
      await main.hover()
      await page.locator('.ui-tooltip').first().waitFor()
      assert.match(await page.locator('.ui-tooltip').first().innerText(), /^Test \(15s\)\./, `${width} px: tooltip in icon form`)
      console.log(width, 'icon Test tooltip:', JSON.stringify(await page.locator('.ui-tooltip').first().innerText()))
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${width}-icon-test.png` })
      await page.keyboard.press('Control+Shift+z')
      await page.locator('.editor-problems-chip').waitFor()
    }
    // Aurora-eu0r: the Problems list fits its panel at each width, so it never scrolls sideways.
    for (const width of [1100, 700, 400, 360]) {
      await page.setViewportSize({ width, height: 800 })
      await settle(page)
      await page.locator('.editor-problems-chip').click()
      const list = page.locator('.editor-problem-list')
      await list.waitFor()
      await settle(page)
      const fit = await list.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, right: el.getBoundingClientRect().right, vw: innerWidth }))
      assert.ok(fit.sw <= fit.cw && fit.right <= fit.vw + 1, `${width} px: Problems list scrolls sideways or leaves the window: ${JSON.stringify(fit)}`)
      await page.keyboard.press('Escape')
      await list.waitFor({ state: 'detached' })
    }
  } finally {
    await browser.close()
  }
})
console.log('graph-editor narrow: all passed')
