// Aurora-e4bi.12: the Tuning drawer's chrome. No x, no full-height button and no corner button; the
// grab tab on the drawer's inner edge (mouse, keyboard and touch), Hide Tuning in the ... menu, the bare
// T key on the canvas and not in a field, and a toast above the open dock. 1100, 700, 400 and 360 px.
// SHOTS=<dir> saves screenshots.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { controlCount, controlsButton } from '../lib/editorMenu.mjs'

const SHOTS = process.env.SHOTS
const SIZES = [[1100, 800], [700, 900], [400, 800], [360, 740]]

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const step = (label) => console.log(`ok  ${label}`)
  const open = async (page) => {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
  }
  const drawer = (page) => page.locator('.ui-drawer')
  const box = (page, sel) => page.locator(sel).first().evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
  })
  const gone = (page) => drawer(page).waitFor({ state: 'detached' })
  const readState = () => {
    const d = document.querySelector('.ui-drawer')
    return d ? (d.dataset.side === 'right' ? 'open' : d.hasAttribute('data-expanded') ? 'full' : 'half') : 'closed'
  }
  const state = (page) => page.evaluate(readState)
  const waitState = (page, want) => page.waitForFunction(([fn, w]) => new Function(`return (${fn})()`)() === w, [readState.toString(), want], { timeout: 5000 })
  // Focus the tab and press a key: opening moves focus into the drawer, so each step starts over.
  const key = async (page, k) => {
    await controlsButton(page).focus()
    await page.keyboard.press(k)
  }
  const park = (page, h) => page.mouse.move(2, h - 2)
  const mid = (b) => [(b.left + b.right) / 2, (b.top + b.bottom) / 2]

  try {
    for (const [w, h] of SIZES) {
      const tag = `${w}x${h}`
      const page = await browser.newPage({ viewport: { width: w, height: h } })
      page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
      await open(page)
      const dock = w < 650
      const shot = async (name) => SHOTS && (await page.screenshot({ path: `${SHOTS}/chrome-${tag}-${name}.png` }))

      // No corner button, and the tab is there with the count while the drawer is closed.
      assert.equal(await page.locator('.react-flow__panel.bottom.right').count(), 0, `${tag}: no corner button`)
      const total = await controlCount(page)
      assert.ok(total > 0, `${tag}: the video effect has Tuning controls`)
      assert.match(await controlsButton(page).getAttribute('aria-label'), new RegExp(`^Show Tuning, ${total} controls$`))
      await shot('closed')

      // Tooltip with the shortcut.
      await page.mouse.move(2, 300)
      await page.mouse.move(2, 310)
      await controlsButton(page).hover()
      await page.locator('.ui-tooltip').first().waitFor({ timeout: 3000 })
      assert.match(await page.locator('.ui-tooltip').first().innerText(), /Show Tuning \(T\)/)
      await park(page, h)
      step(`${tag}: no corner button, closed tab "${await controlsButton(page).getAttribute('aria-label')}", tooltip names T`)

      // Mouse.
      await controlsButton(page).click()
      await drawer(page).waitFor()
      await park(page, h)
      await page.waitForTimeout(300)
      assert.equal(await page.locator('.ui-drawer-close, .ui-drawer-toggle').count(), 0, `${tag}: no x and no full-height button`)
      assert.match(await page.locator('.ui-drawer-title').innerText(), new RegExp(`^Tuning \\(${total}\\)$`))
      const edge = async () => ({ t: await box(page, '.editor-grab'), d: await box(page, '.ui-drawer') })
      let { t, d } = await edge()
      if (dock) {
        assert.equal(await state(page), 'half')
        assert.ok(Math.abs(t.bottom - d.top) <= 2.5, `${tag}: tab bottom ${t.bottom} on the dock top ${d.top}`)
        assert.ok(Math.abs((t.left + t.right) / 2 - w / 2) <= 2, `${tag}: tab centred`)
        assert.ok(t.height >= 24, `${tag}: tab at least 24 px tall (${t.height})`)
      } else {
        assert.equal(await state(page), 'open')
        assert.ok(Math.abs(t.right - d.left) <= 2.5, `${tag}: tab right ${t.right} on the drawer edge ${d.left}`)
        assert.ok(t.width >= 24, `${tag}: tab at least 24 px wide (${t.width})`)
      }
      const borders = await page.evaluate(() => {
        const s = getComputedStyle(document.querySelector('.ui-drawer'))
        return [s.borderTopWidth, s.borderLeftWidth]
      })
      assert.equal(borders[dock ? 0 : 1], '2px', `${tag}: 2 px drawer edge`)
      await shot('open')
      if (dock) {
        await controlsButton(page).click()
        await waitState(page, 'full')
        await park(page, h)
        const cv = await box(page, '.editor-canvas')
        ;({ t, d } = await edge())
        assert.ok(Math.abs(d.top - (cv.top + 24)) <= 1.5, `${tag}: full dock stops 24 px below the bar (${d.top} vs ${cv.top})`)
        assert.ok(t.top >= cv.top - 0.5 && t.bottom <= d.top + 2.5, `${tag}: tab in the gap`)
        await shot('full')
        await controlsButton(page).click()
        await waitState(page, 'half')
        step(`${tag}: mouse click on the tab toggles half and full, full stops 24 px below the bar`)
      } else {
        await controlsButton(page).click()
        await gone(page)
        assert.match(await controlsButton(page).getAttribute('aria-label'), /^Show Tuning/)
        await controlsButton(page).click()
        await drawer(page).waitFor()
        step(`${tag}: mouse click on the tab hides and shows the side drawer`)
      }
      await park(page, h)

      // Mouse drag: the tab drags like a touch.
      const mouseDrag = async (dx, dy) => {
        const [x, y] = mid(await box(page, '.editor-grab-tab'))
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x + dx, y + dy, { steps: 6 })
        await page.mouse.up()
        await park(page, h)
      }
      if (dock) {
        await mouseDrag(0, -80)
        await waitState(page, 'full')
        await mouseDrag(0, 80)
        await waitState(page, 'half')
        await mouseDrag(0, 80)
        await waitState(page, 'closed')
        await mouseDrag(0, -80)
        await waitState(page, 'half')
      } else {
        await mouseDrag(80, 0)
        await waitState(page, 'closed')
        await mouseDrag(-80, 0)
        await waitState(page, 'open')
      }
      step(`${tag}: a drag ${dock ? 'up and down steps full, half, closed' : 'right hides and left shows'}`)

      // Keyboard.
      if (dock) {
        await key(page, 'ArrowUp')
        await waitState(page, 'full')
        await key(page, 'ArrowDown')
        await waitState(page, 'half')
        await key(page, 'ArrowDown')
        await waitState(page, 'closed')
        await key(page, 'ArrowUp')
        await waitState(page, 'half')
        step(`${tag}: Up and Down step closed, half, full`)
      } else {
        await key(page, 'ArrowRight')
        await waitState(page, 'closed')
        await key(page, 'ArrowLeft')
        await waitState(page, 'open')
        step(`${tag}: Right hides and Left shows the side drawer`)
      }

      // Hide Tuning: one click from the ... menu.
      await page.locator('.ui-drawer').getByRole('button', { name: 'Tuning actions' }).click()
      const hide = page.getByRole('menuitem', { name: 'Hide Tuning', exact: true })
      assert.match(await hide.innerText(), /Hide Tuning\s+T/)
      await shot('menu')
      await hide.click()
      await gone(page)
      step(`${tag}: Hide Tuning in the ... menu closes the drawer, showing its key`)

      // The T key: from the canvas, not from a field.
      await page.evaluate(() => document.activeElement?.blur())
      await page.keyboard.press('t')
      await drawer(page).waitFor()
      await park(page, h)
      await page.keyboard.press('Escape')
      await gone(page)
      await page.evaluate(() => document.activeElement?.blur())
      await page.keyboard.press('t')
      await drawer(page).waitFor()
      await page.locator('.ui-drawer').getByRole('button', { name: 'Tuning actions' }).click()
      await page.getByRole('menuitem', { name: 'Hide Tuning', exact: true }).click()
      await gone(page)
      await page.getByRole('button', { name: 'Add node' }).click()
      const search = page.getByRole('searchbox', { name: 'Search nodes' })
      await search.fill('')
      await search.press('t')
      assert.equal(await search.inputValue(), 't', `${tag}: the key typed into the field`)
      assert.equal(await drawer(page).count(), 0, `${tag}: T in a field did not open Tuning`)
      // Esc clears typed text first, then closes.
      await search.fill('')
      await page.keyboard.press('Escape')
      await page.getByRole('dialog', { name: 'Add node' }).waitFor({ state: 'detached' })
      await page.evaluate(() => document.activeElement?.blur())
      await page.keyboard.press('Control+t')
      assert.equal(await drawer(page).count(), 0, `${tag}: Ctrl+T is left alone`)
      step(`${tag}: T opens Tuning from the canvas, not from a field or with a modifier`)

      // A toast with the dock open sits above it, or beside a side drawer, and its Undo is clickable.
      await controlsButton(page).click()
      await drawer(page).waitFor()
      await park(page, h)
      const card = page.locator('.cp-item-card').first()
      await card.hover()
      await card.getByRole('button', { name: /actions$/ }).click()
      await page.getByRole('menuitem', { name: /^Remove/ }).click()
      await page.waitForFunction(() => /^Removed/.test(document.querySelector('.editor-toast')?.textContent ?? ''))
      await page.waitForTimeout(300)
      const geo = await page.evaluate(() => {
        const to = document.querySelector('.editor-toast').getBoundingClientRect()
        const dr = document.querySelector('.ui-drawer').getBoundingClientRect()
        const un = document.querySelector('.editor-toast button')?.getBoundingClientRect()
        const hit = un && document.elementFromPoint((un.left + un.right) / 2, (un.top + un.bottom) / 2)
        return { to: { left: to.left, right: to.right, top: to.top, bottom: to.bottom }, dr: { left: dr.left, top: dr.top }, hit: !!hit?.closest('.editor-toast') }
      })
      if (dock) assert.ok(geo.to.bottom <= geo.dr.top, `${tag}: toast bottom ${geo.to.bottom} above the dock ${geo.dr.top}`)
      else assert.ok(geo.to.right <= geo.dr.left + 0.5 && geo.to.left >= 0, `${tag}: toast ${JSON.stringify(geo.to)} beside the drawer at ${geo.dr.left}`)
      assert.ok(geo.hit, `${tag}: the toast's Undo is not under another element`)
      await shot('toast')
      step(`${tag}: the toast sits ${dock ? 'above the dock' : 'beside the side drawer'} with a clickable Undo`)
      await page.close()
    }

    // Touch: tap and drag on the tab (a touch context).
    for (const [w, h] of [[400, 800], [1100, 800]]) {
      const tag = `${w}x${h}`
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true })
      const page = await ctx.newPage()
      page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
      await open(page)
      const dock = w < 650
      const cdp = await ctx.newCDPSession(page)
      const drag = async (dx, dy) => {
        const [x, y] = mid(await box(page, '.editor-grab-tab'))
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
        for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 6, y: y + (dy * i) / 6 }] })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      }
      const tapTab = async () => {
        const [x, y] = mid(await box(page, '.editor-grab-tab'))
        await page.touchscreen.tap(x, y)
      }
      await tapTab()
      await waitState(page, dock ? 'half' : 'open')
      await tapTab()
      await waitState(page, dock ? 'full' : 'closed')
      await tapTab()
      await waitState(page, dock ? 'half' : 'open')
      if (dock) {
        await drag(0, 80)
        await waitState(page, 'closed')
        await drag(0, -80)
        await waitState(page, 'half')
        await drag(0, -80)
        await waitState(page, 'full')
      } else {
        await drag(80, 0)
        await waitState(page, 'closed')
        await drag(-80, 0)
        await waitState(page, 'open')
      }
      step(`${tag}: touch taps and drags on the tab step the drawer`)
      await ctx.close()
    }
  } finally {
    await browser.close()
  }
})
console.log('graph-editor drawer chrome: all passed')
