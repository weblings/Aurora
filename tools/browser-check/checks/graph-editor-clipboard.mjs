// Aurora-ge1i.2.1: copy, cut, paste and Select all. The Edit menu (Undo, Redo, Cut, Copy, Paste, Select all,
// Delete), the canvas and node right-click menus, Ctrl+A/C/X/V on the canvas and not in a text box, one Undo
// per paste or cut, a singleton skipped with a toast, and a paste in a second tab. The bar's Edit menu opens
// inside the window at 1470, 900, 700, 520 and 400 px. `SHOTS=<dir>` saves the menus.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { editAction, editMenu, editMenuButton, openEditMenu } from '../lib/editorMenu.mjs'

const SHOTS = process.env.SHOTS
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const context = await browser.newContext({ viewport: { width: 1470, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage()
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const count = (p = page) => p.locator('.react-flow__node').count()
  const selected = () => page.locator('.react-flow__node.selected').count()
  const waitCount = (n, p = page) => p.waitForFunction((k) => document.querySelectorAll('.react-flow__node').length === k, n)
  const waitSelected = (n) => page.waitForFunction((k) => document.querySelectorAll('.react-flow__node.selected').length === k, n)
  const toast = page.locator('.editor-toast')
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText())
  const pick = async (title, additive = false) => {
    await page.locator('.aurora-node', { hasText: title }).first().locator('.aurora-node-header').click({ modifiers: additive ? [MOD] : [] })
  }
  const pane = () => page.locator('.react-flow__pane')

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    const nodes0 = await count()

    // The menu, in the decided order, with nothing selected.
    await openEditMenu(page)
    const names = await editMenu(page).getByRole('menuitem').evaluateAll((els) => els.map((e) => e.textContent.replace(/(Ctrl|Cmd|Shift)[+\w]+$|Del$/, '').trim()))
    assert.deepEqual(names, ['Undo', 'Redo', 'Cut', 'Copy', 'Paste', 'Select all', 'Delete'])
    for (const name of ['Undo', 'Redo', 'Cut', 'Copy', 'Delete']) {
      assert.equal(await editMenu(page).getByRole('menuitem', { name }).getAttribute('aria-disabled'), 'true', `${name} is disabled with nothing to act on`)
    }
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/edit-menu.png`, clip: { x: 0, y: 0, width: 700, height: 360 } })
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('button', { name: 'Undo', exact: true }).count(), 0, 'no Undo button on the bar')
    step('Edit menu lists Undo, Redo, Cut, Copy, Paste, Select all, Delete; acting items start disabled; the bar has no Undo or Redo')

    // Select all by key and by menu.
    await pane().click({ position: { x: 5, y: 300 } })
    await page.keyboard.press(`${MOD}+a`)
    await waitSelected(nodes0)
    await pane().click({ position: { x: 5, y: 300 } })
    await waitSelected(0)
    await editAction(page, 'Select all')
    await waitSelected(nodes0)
    step(`Select all selects all ${nodes0} nodes, by key and from the Edit menu`)

    // Ctrl+A in a text box keeps the text box's own select all.
    await pane().click({ position: { x: 5, y: 300 } })
    const field = page.locator('.aurora-node input').first()
    await field.focus()
    await page.keyboard.press(`${MOD}+a`)
    assert.equal(await selected(), 0, 'Ctrl+A in a field selects no nodes')
    await field.blur()
    step('Ctrl+A in a field leaves the nodes alone')

    // Copy two connected nodes, paste with the key: fresh ids, one Undo.
    await pick('Gain')
    await pick('Smooth frames', true)
    const picked = await selected()
    assert.equal(picked, 2, 'two nodes are selected')
    await page.keyboard.press(`${MOD}+c`)
    await page.waitForFunction(() => navigator.clipboard.readText().then((t) => t.includes('aurora-graph-clip')))
    assert.equal(await count(), nodes0, 'copy changes nothing')
    await pane().hover({ position: { x: 700, y: 650 } })
    await page.keyboard.press(`${MOD}+v`)
    await waitCount(nodes0 + picked)
    await waitSelected(picked)
    const ids = await page.locator('.react-flow__node').evaluateAll((els) => els.map((e) => e.dataset.id))
    assert.equal(new Set(ids).size, ids.length, 'ids are unique')
    await page.keyboard.press(`${MOD}+z`)
    await waitCount(nodes0)
    step(`Ctrl+C then Ctrl+V pastes ${picked} node(s) selected, with unique ids; one Undo reverts the paste`)

    // Paste again from the menu at the right-click point.
    await pane().click({ button: 'right', position: { x: 600, y: 700 } })
    const canvasMenu = page.getByRole('menu', { name: 'Canvas actions' })
    await canvasMenu.waitFor()
    assert.deepEqual(
      await canvasMenu.getByRole('menuitem').evaluateAll((els) => els.map((e) => e.textContent.replace(/(Ctrl|Cmd|Shift)[+\w]+$/, '').trim())),
      ['Add node', 'Undo', 'Redo', 'Fit view', 'Paste', 'Select all'],
    )
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/canvas-menu.png` })
    await canvasMenu.getByRole('menuitem', { name: 'Paste' }).click()
    await waitCount(nodes0 + picked)
    const box = await pane().boundingBox()
    const last = await page.locator('.react-flow__node.selected').first().boundingBox()
    assert.ok(Math.abs(last.x - (box.x + 600)) < 400 && Math.abs(last.y - (box.y + 700)) < 400, 'pasted near the right-click')
    await page.keyboard.press(`${MOD}+z`)
    await waitCount(nodes0)
    step('canvas menu Paste pastes at the right-click point')

    // Node menu: Cut and Copy act on the selection, Delete is plain.
    await pick('Gain')
    await page.locator('.aurora-node', { hasText: 'Gain' }).first().locator('.aurora-node-header').click({ button: 'right' })
    const nodeMenu = page.getByRole('menu', { name: 'Node actions' })
    await nodeMenu.waitFor()
    assert.deepEqual(
      await nodeMenu.getByRole('menuitem').evaluateAll((els) => els.map((e) => e.textContent.replace(/(Ctrl|Cmd|Shift)[+\w]+$|Del$/, '').trim())),
      ['Details', 'Tuning controls…', 'Cut', 'Copy', 'Delete'],
    )
    await nodeMenu.getByRole('menuitem', { name: 'Cut' }).click()
    await waitCount(nodes0 - 1)
    assert.match(await clipboard(), /aurora-graph-clip/)
    await editAction(page, 'Paste')
    await waitCount(nodes0)
    await editAction(page, 'Undo')
    await waitCount(nodes0 - 1)
    await editAction(page, 'Undo')
    await waitCount(nodes0)
    step('node menu Cut removes the selection and keeps it on the clipboard; Edit Paste brings it back; each is one Undo')

    // Everything copied: the output node is a singleton and is skipped with a count.
    await pane().click({ position: { x: 5, y: 300 } })
    await page.keyboard.press(`${MOD}+a`)
    await waitSelected(nodes0)
    await page.keyboard.press(`${MOD}+c`)
    await page.waitForFunction(() => navigator.clipboard.readText().then((t) => t.includes('aurora-graph-clip')))
    await page.keyboard.press(`${MOD}+v`)
    await toast.waitFor()
    const note = await toast.innerText()
    assert.match(note, /^Pasted \d+ nodes?, skipped \d+ \(.*(allows only one|only one of each allowed)\)/, note)
    assert.equal(await count(), nodes0 + Number(/Pasted (\d+)/.exec(note)[1]))
    await page.keyboard.press(`${MOD}+z`)
    await waitCount(nodes0)
    step(`a singleton is skipped and counted: ${note}`)

    // A second paste of the same clip steps down and right.
    await pane().click({ position: { x: 5, y: 300 } })
    await pick('Gain')
    await page.keyboard.press(`${MOD}+c`)
    await page.waitForFunction(() => navigator.clipboard.readText().then((t) => t.includes('aurora-graph-clip')))
    await pane().hover({ position: { x: 700, y: 650 } })
    await page.keyboard.press(`${MOD}+v`)
    await waitCount(nodes0 + 1)
    const first = await page.locator('.react-flow__node.selected').boundingBox()
    await page.keyboard.press(`${MOD}+v`)
    await waitCount(nodes0 + 2)
    const second = await page.locator('.react-flow__node.selected').boundingBox()
    assert.ok(second.x > first.x && second.y > first.y, `repeat paste steps down and right: ${JSON.stringify([first, second])}`)
    step('pasting the same clip again offsets it down and right')

    // Another tab pastes the same clip (system clipboard).
    const other = await context.newPage()
    other.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
    await other.goto(`${editorUrl}?effect=builtin.video`)
    await other.waitForSelector('.aurora-node')
    const otherCount = await count(other)
    await other.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
    await other.keyboard.press(`${MOD}+v`)
    await waitCount(otherCount + 1, other)
    await other.close()
    await page.bringToFront()
    step('a second tab pastes the clip')

    // Text on the clipboard is not an Aurora clip: nothing happens, and the menu Paste says so.
    await page.evaluate(() => navigator.clipboard.writeText('just words'))
    const before = await count()
    await pane().click({ position: { x: 5, y: 300 } })
    await page.keyboard.press(`${MOD}+v`)
    assert.equal(await count(), before)
    await openEditMenu(page)
    await page.waitForFunction(() => [...document.querySelectorAll('[role=menuitem]')].find((e) => e.textContent.startsWith('Paste'))?.getAttribute('aria-disabled') === 'true')
    await page.keyboard.press('Escape')
    step('other text on the clipboard pastes nothing and disables Paste')

    // The Edit button fits at every width.
    for (const width of [1470, 900, 700, 520, 400]) {
      await page.setViewportSize({ width, height: 800 })
      await page.waitForTimeout(300)
      const g = await page.evaluate(() => {
        const bar = document.querySelector('.editor-header').getBoundingClientRect()
        const b = [...document.querySelectorAll('.editor-header button')].find((x) => x.textContent.trim() === 'Edit').getBoundingClientRect()
        return { barH: bar.height, left: b.left, right: b.right, vw: innerWidth }
      })
      assert.ok(g.left >= 0 && g.right <= g.vw, `${width} px: Edit is outside the window: ${JSON.stringify(g)}`)
      await editMenuButton(page).click()
      await editMenu(page).waitFor()
      const m = await editMenu(page).boundingBox()
      assert.ok(m.x >= 0 && m.x + m.width <= width, `${width} px: the Edit menu is outside the window`)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/edit-${width}.png`, clip: { x: 0, y: 0, width, height: 360 } })
      await page.keyboard.press('Escape')
    }
    step('Edit and its menu sit inside the window at 1470, 900, 700, 520 and 400 px')
  } finally {
    await browser.close()
  }
})
