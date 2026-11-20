// Aurora-daaa.27.1: right-click and ⋯ menus. Canvas (Add node cascade placing at
// the pointer, Undo, Redo, Fit view), node (Tuning controls…, Delete with the selection count)
// and wire (Delete connection); ⋯ and Shift+F10 open the node menu; Delete/Backspace inside a
// menu do not delete. Aurora-e4bi.9: the Tuning controls picker (no Details item, inside the
// window at 1100, 700, 400 and 360 px, stays open across switches, keyboard from Shift+F10) and
// touch hints. Aurora-e4bi.15: the param-row menu at 1100 and 400 px.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { controlCount, pickerKnobs, pickerSwitches, tuningPicker, waitControlCount, waitToast } from '../lib/editorMenu.mjs'

const inWindow = (box, vp) => box.x >= -0.5 && box.y >= -0.5 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5
const popoverBox = (loc) => loc.locator('xpath=ancestor::*[contains(@class,"ui-popover")][1]').boundingBox()
const gainOf = (page) => page.locator('.aurora-node', { hasText: 'Gain' }).first()

async function freshPage(browser, editorUrl, viewport, options = {}) {
  const page = await browser.newPage({ viewport, ...options })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  await page.goto(`${editorUrl}?effect=builtin.video`)
  await page.waitForSelector('.aurora-node')
  await page.waitForTimeout(600)
  return page
}

// The picker at one window size: opened from the node menu, inside the window, open across switches.
async function pickerAt(browser, editorUrl, [width, height], step) {
  const page = await freshPage(browser, editorUrl, { width, height })
  try {
    const gain = gainOf(page)
    const total = await controlCount(page)
    await gain.locator('.aurora-node-header').click({ button: 'right' })
    await page.getByRole('menu', { name: 'Node actions' }).waitFor()
    assert.equal(await page.getByRole('menuitem', { name: 'Details' }).count(), 0, 'no Details item')
    await page.getByRole('menuitem', { name: 'Tuning controls…', exact: true }).click()
    await tuningPicker(page).waitFor()
    await page.waitForTimeout(300)
    const box = await popoverBox(tuningPicker(page))
    const dbg = await page.evaluate(() => ({ iw: innerWidth, sw: document.documentElement.scrollWidth, anchor: document.querySelector('.tuning-pick')?.dataset.placement + ' ' + document.querySelector('.tuning-pick')?.dataset.point, style: document.querySelector('.ui-popover')?.getAttribute('style') }))
    assert.ok(inWindow(box, { width, height }), `${width}x${height}: picker outside the window: ${JSON.stringify(box)} ${JSON.stringify(dbg)}`)
    assert.equal(await tuningPicker(page).locator('.tuning-pick-title').innerText(), 'Tuning controls')
    const switches = pickerSwitches(page)
    const n = await switches.count()
    assert.ok(n > 0, 'the picker lists the params')
    // Beside the node, not over it, where the window has room.
    const node = await gain.boundingBox()
    const overlaps = box.x < node.x + node.width && box.x + box.width > node.x && box.y < node.y + node.height && box.y + box.height > node.y
    if (width >= 700) assert.ok(!overlaps, `${width} px: picker over the node`)
    // Stays open across several switches.
    await pickerKnobs(page).first().click()
    await waitControlCount(page, total + 1)
    if (n > 1) {
      await pickerKnobs(page).nth(1).click()
      await waitControlCount(page, total + 2)
    }
    await page.waitForTimeout(200)
    assert.ok(await tuningPicker(page).isVisible(), 'the picker stays open across switches')
    assert.ok(inWindow(await popoverBox(tuningPicker(page)), { width, height }), `${width}x${height}: picker left the window after a switch`)
    // Switching off is Remove with the undo toast.
    await pickerKnobs(page).first().click()
    await waitToast(page, 'from Tuning.')
    assert.ok(await tuningPicker(page).isVisible(), 'the picker stays open after a switch off')
    // Esc closes it.
    await page.mouse.move(2, 2)
    await page.keyboard.press('Escape')
    await tuningPicker(page).waitFor({ state: 'detached' })
    // An outside press closes it.
    await gain.locator('.aurora-node-header').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Tuning controls…', exact: true }).click()
    await tuningPicker(page).waitFor()
    await page.locator('.react-flow__pane').click({ position: { x: 3, y: 300 } })
    await tuningPicker(page).waitFor({ state: 'detached' })
    step(`${width}x${height}: picker inside the window, open across switches, Esc and an outside press close it`)
  } finally {
    await page.close()
  }
}

// The param-row menu (Aurora-e4bi.15) at one width: right-click and Shift+F10 on a param row.
async function paramMenuAt(browser, editorUrl, width, step) {
  const height = 800
  const page = await freshPage(browser, editorUrl, { width, height })
  try {
    const total = await controlCount(page)
    const gain = gainOf(page)
    const row = gain.locator('.param').first()
    const label = row.locator('.param-label')
    const add = page.getByRole('menuitem', { name: 'Add to Tuning', exact: true })
    // Right-click on the label opens the param menu, not the node menu.
    await label.click({ button: 'right' })
    await add.waitFor()
    assert.equal(await page.getByRole('menu', { name: 'Node actions' }).count(), 0, 'not the node menu')
    assert.ok(inWindow(await popoverBox(add), { width, height }), `${width} px: param menu outside the window`)
    await add.click()
    await waitControlCount(page, total + 1)
    // Now in Tuning: the same row offers Remove, with the undo toast.
    await label.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Remove from Tuning', exact: true }).click()
    await waitControlCount(page, total)
    await waitToast(page, 'from Tuning.')
    // A number field keeps the browser menu: ours does not open.
    await row.locator('input[type="number"]').click({ button: 'right' })
    await page.waitForTimeout(300)
    assert.equal(await page.getByRole('menuitem', { name: /Tuning$/ }).count(), 0, 'a number field opens no menu of ours')
    assert.equal(await page.getByRole('menu', { name: 'Node actions' }).count(), 0, 'nor the node menu')
    // Elsewhere on the node (the header) the node menu.
    await gain.locator('.aurora-node-header').click({ button: 'right' })
    await page.getByRole('menu', { name: 'Node actions' }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('menu', { name: 'Node actions' }).waitFor({ state: 'detached' })
    // Shift+F10 on the focused label opens the param menu with no browser menu on top, and focus returns.
    await page.mouse.move(2, 2)
    await label.focus()
    await page.keyboard.press('Shift+F10')
    await add.waitFor()
    assert.ok(inWindow(await popoverBox(add), { width, height }), `${width} px: keyboard param menu outside the window`)
    await page.waitForTimeout(400)
    assert.ok(await add.isVisible(), 'the menu survives the key release (no browser menu on top)')
    assert.equal(await add.evaluate((el) => el.closest('[role="menu"]').contains(document.activeElement)), true, 'focus is inside the param menu')
    await page.keyboard.press('Escape')
    await add.waitFor({ state: 'detached' })
    await label.evaluate((el) => new Promise((ok, no) => { const t = Date.now(); const poll = () => (document.activeElement === el ? ok() : Date.now() - t > 3000 ? no(new Error('focus did not return to the label')) : setTimeout(poll, 50)); poll() }))
    // The slider opens the same menu by right-click, Shift+F10 and the ContextMenu key.
    const slider = row.locator('input[type="range"]')
    await slider.click({ button: 'right' })
    await add.waitFor()
    assert.equal(await page.getByRole('menu', { name: 'Node actions' }).count(), 0, 'slider: not the node menu')
    await page.keyboard.press('Escape')
    await add.waitFor({ state: 'detached' })
    for (const key of ['Shift+F10', 'ContextMenu']) {
      await page.mouse.move(2, 2)
      await slider.focus()
      await page.keyboard.press(key)
      await add.waitFor()
      await page.waitForTimeout(400)
      assert.ok(await add.isVisible(), `slider ${key}: the menu survives the key release`)
      await page.keyboard.press('Escape')
      await add.waitFor({ state: 'detached' })
      await slider.evaluate((el) => new Promise((ok, no) => { const t = Date.now(); const poll = () => (document.activeElement === el ? ok() : Date.now() - t > 3000 ? no(new Error('focus did not return to the slider')) : setTimeout(poll, 50)); poll() }))
    }
    await page.mouse.move(2, 2)
    await label.focus()
    await page.keyboard.press('ContextMenu')
    await add.waitFor()
    await page.waitForTimeout(400)
    assert.ok(await add.isVisible(), 'label ContextMenu: the menu survives the key release')
    await page.keyboard.press('Escape')
    await add.waitFor({ state: 'detached' })
    step(`${width} px: param menu from right-click and Shift+F10 or ContextMenu on label and slider, Add and Remove, browser menu kept on a number field`)
  } finally {
    await page.close()
  }
}

// Touch: a tap on a port or param name shows its description, starts no wire and does not move the node.
async function touchHints(browser, editorUrl, step) {
  const page = await freshPage(browser, editorUrl, { width: 900, height: 800 }, { hasTouch: true })
  try {
    const gain = gainOf(page)
    const flowNode = page.locator('.react-flow__node', { has: gain })
    const edges0 = await page.locator('.react-flow__edge').count()
    const at = () => flowNode.evaluate((el) => el.style.transform)
    const before = await at()
    const port = gain.locator('.aurora-port .aurora-taphint').first()
    await port.tap()
    const pop = page.locator('.aurora-taphint-pop')
    await pop.waitFor()
    assert.ok((await pop.innerText()).trim().length > 0, 'the port description shows')
    assert.equal(await page.locator('.react-flow__connectionline').count(), 0, 'no wire started')
    assert.equal(await page.locator('.react-flow__edge').count(), edges0, 'no edge added')
    assert.equal(await at(), before, 'the node did not move')
    // Where the pointer is coarse the tap target is padded to about 44 px tall.
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches)
    if (coarse) {
      const h = await port.evaluate((el) => parseFloat(getComputedStyle(el, '::after').height))
      assert.ok(h >= 40, `tap area ${h} px tall`)
    }
    // A second tap hides it.
    await port.tap()
    await pop.waitFor({ state: 'detached' })
    // A param name too.
    await gain.locator('.param .aurora-taphint').first().tap()
    await pop.waitFor()
    await page.keyboard.press('Escape')
    await pop.waitFor({ state: 'detached' })
    assert.equal(await at(), before, 'the node did not move')
    // The ... press by touch starts the menu with the node's short tip.
    await gain.locator('.aurora-node-more').tap()
    await page.getByRole('menu', { name: 'Node actions' }).waitFor()
    assert.ok((await page.locator('.menu-tip').innerText()).trim().length > 0, 'the touch menu starts with the tip')
    step(`touch (coarse pointer: ${coarse}): port and param taps show the description, no wire, no move, ... menu starts with the tip`)
  } finally {
    await page.close()
  }
}

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const nodeCount = () => page.locator('.react-flow__node').count()
  const edgeCount = () => page.locator('.react-flow__edge').count()
  const menu = (name) => page.getByRole('menu', { name })
  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    const nodes0 = await nodeCount()

    // Node accessible names and the ⋯ button.
    const labelled = await page.locator('.react-flow__node').evaluateAll((els) => els.every((e) => e.getAttribute('aria-label')))
    assert.ok(labelled, 'every node has an aria-label')
    const more = page.locator('.aurora-node-more').first()
    assert.equal(await more.getAttribute('aria-haspopup'), 'menu')
    assert.match((await more.getAttribute('aria-label')) ?? '', /^Actions for /)
    step('nodes carry their title; ⋯ is a labelled menu button')

    // ⋯ opens the node menu; Delete inside it does not delete.
    await more.click()
    await menu('Node actions').waitFor()
    await page.keyboard.press('Delete')
    await page.keyboard.press('Backspace')
    assert.equal(await nodeCount(), nodes0)
    step('⋯ opens the node menu; Delete/Backspace in it do nothing')
    await page.keyboard.press('Escape')
    await menu('Node actions').waitFor({ state: 'detached' })

    // Shift+F10 on a focused node.
    await page.locator('.react-flow__node').first().focus()
    await page.keyboard.press('Shift+F10')
    await menu('Node actions').waitFor()
    step('Shift+F10 opens the node menu')
    await page.keyboard.press('Escape')

    // Right-click node: Delete acts on it.
    await page.locator('.aurora-node-header').first().click({ button: 'right' })
    await menu('Node actions').waitFor()
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
    assert.equal(await nodeCount(), nodes0 - 1)
    step('node menu Delete removes the node')

    // Undo from the canvas menu.
    await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 600, y: 700 } })
    await menu('Canvas actions').waitFor()
    await page.getByRole('menuitem', { name: 'Undo' }).click()
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n, nodes0)
    step('canvas menu Undo restores it')

    // Add node at the pointer.
    await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 600, y: 700 } })
    await page.getByRole('menuitem', { name: 'Add node' }).hover()
    await page.getByRole('menuitem', { name: /^Lights/ }).hover()
    const flyout = page.locator('[role=menu][aria-label="Lights nodes"]')
    await flyout.waitFor()
    await flyout.getByRole('menuitem').first().click()
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n + 1, nodes0)
    const pane = await page.locator('.react-flow__pane').boundingBox()
    const added = await page.locator('.react-flow__node').last().boundingBox()
    const at = { x: pane.x + 600, y: pane.y + 700 }
    assert.ok(Math.abs(added.x - at.x) < 200 && Math.abs(added.y - at.y) < 200,
      `new node at (${Math.round(added.x)}, ${Math.round(added.y)}), right-click at (${Math.round(at.x)}, ${Math.round(at.y)})`)
    step('canvas menu Add node adds a node at the right-click position')

    // Wire menu.
    const edges0 = await edgeCount()
    const mid = await page.locator('.react-flow__edge-interaction').first().evaluate((p) => {
      const m = p.getPointAtLength(p.getTotalLength() / 2)
      const pt = new DOMPoint(m.x, m.y).matrixTransform(p.getScreenCTM())
      return { x: pt.x, y: pt.y }
    })
    await page.mouse.click(mid.x, mid.y, { button: 'right' })
    await menu('Connection actions').waitFor()
    await page.getByRole('menuitem', { name: 'Delete connection' }).click()
    assert.equal(await edgeCount(), edges0 - 1)
    step('wire menu Delete connection removes the wire')

    // The node menu has no Details, and no Tuning controls… on a node without params.
    const plain = page.locator('.aurora-node').filter({ hasNot: page.locator('.param') }).first()
    if (await plain.count()) {
      await plain.locator('.aurora-node-header').click({ button: 'right' })
      await menu('Node actions').waitFor()
      assert.equal(await page.getByRole('menuitem', { name: 'Tuning controls…' }).count(), 0, 'hidden on a node without params')
      assert.equal(await page.getByRole('menuitem', { name: 'Details' }).count(), 0)
      await page.keyboard.press('Escape')
      step('a node without params has no Tuning controls… item')
    } else {
      step('(no node without params in this graph: the hidden item is not exercised)')
    }

    // Keyboard: Shift+F10 on a focused node, Tuning controls…, the first switch, Space, Esc.
    const gainNode = page.locator('.react-flow__node', { has: gainOf(page) }).first()
    await page.mouse.move(2, 2)
    await gainNode.focus()
    await page.keyboard.press('Shift+F10')
    await menu('Node actions').waitFor()
    await page.waitForTimeout(300)
    assert.ok(await menu('Node actions').isVisible(), 'no browser menu on top of the node menu')
    await page.getByRole('menuitem', { name: 'Tuning controls…', exact: true }).focus()
    await page.keyboard.press('Enter')
    await tuningPicker(page).waitFor()
    await page.waitForFunction(() => document.activeElement?.closest('.tuning-pick') && document.activeElement.type === 'checkbox')
    const total = await controlCount(page)
    await page.keyboard.press('Space')
    await waitControlCount(page, total + 1)
    await page.keyboard.press('Escape')
    await tuningPicker(page).waitFor({ state: 'detached' })
    step('keyboard: Shift+F10, Tuning controls…, the first switch has focus, Space switches, Esc closes')

    for (const size of [[1100, 800], [700, 800], [400, 800], [360, 740]]) await pickerAt(browser, editorUrl, size, step)
    for (const width of [1100, 400]) await paramMenuAt(browser, editorUrl, width, step)
    await touchHints(browser, editorUrl, step)
  } finally {
    await browser.close()
  }
})
console.log("graph-editor context menus: all passed")
