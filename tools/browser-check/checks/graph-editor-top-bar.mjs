// Aurora-daaa.11: the top bar, the title menu's Name and effect list, the view
// menu, and the status rule's places (the Test button, the shell's rows and the toast; the bar has no status text).
//
// Status cases (docs/planning/WebUI/GraphEditorCleanup.md, Status priority rule):
//   checked here:       rank 1 shell rows (404, 422, 500; no Retry), kept copy restores silently (kept-copy check has the rest),
//                       rank 7 default, Edited since the test, Stop-only bar
//   checked elsewhere:  draft refusals and the takeover (error-shell), rank 4 Reconnect (gate),
//                       rank 5 Take over and test outcomes (test-outcome), failed Save row (failed-save), problems
//                       chip and Preview paused (gate), draft would not load
//                       as a Whole graph row (gate), Saved toast (edit loop)
//   unit tests:         every rank and the priority order (graph/status.test.ts)
//   manual:             `Whole graph` row in the problems popover, the Wire refused toast
//                       (a failed reload after a Save is the error shell's: /api/state)
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { currentEffect, makeEdit, nameDialog, openTitleMenu, titleMenu, waitAnnounced, waitEffect, waitToast } from '../lib/editorMenu.mjs'

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const button = (name) => page.getByRole('button', { name, exact: true })
  const status = () => page.locator('.editor-header')
  const live = () => page.waitForFunction(() => document.querySelector('.editor-header')?.dataset.preview.includes('Live'), null, { timeout: 10_000 })
  const closed = () => titleMenu(page).waitFor({ state: 'detached' })

  try {
    // The bar: old chrome is gone.
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    await live()
    assert.equal(await page.locator('.editor-actions, .editor-header select, .editor-name').count(), 0)
    assert.equal(await page.locator('.react-flow__controls').count(), 0)
    assert.equal(await page.locator('.react-flow__minimap').count(), 0)
    assert.equal(await page.locator('.editor-header').getByRole('link', { name: 'Dashboard' }).count(), 1)
    for (const name of ['Effect menu', 'Undo', 'Redo', 'Test on lights']) assert.equal(await page.locator('.editor-header').getByRole('button', { name }).count(), 1, name)
    step('one bar: Dashboard, title menu, status, Undo, Redo, Test on lights; no controls, minimap off')

    // Grille bar (Aurora-s1t7.1): every bar control is a ui-button, 31 px tall (Grille's default size, no data-size), two dividers.
    const bar = await page.locator('.editor-header > .ui-button, .editor-header > .editor-split > .ui-button').evaluateAll((els) => els.map((e) => ({ h: e.getBoundingClientRect().height, size: e.dataset.size, legacy: e.classList.contains('btn') })))
    assert.ok(bar.length >= 5, `bar buttons: ${bar.length}`)
    // Icon-only Undo and Redo are Grille's 31 px square (data-icon, dev.16), like the text buttons.
    for (const b of bar) assert.deepEqual(b, { h: 31, size: undefined, legacy: false }, JSON.stringify(bar))
    assert.equal(await page.locator('.editor-header > .btn').count(), 0)
    assert.equal(await page.locator('.editor-header > .editor-sep').count(), 2)
    step('bar controls are Grille ui-buttons, 31 px tall, with two dividers')

    // Title menu: file actions, then New and Open submenus; no Name field, no second menu.
    await openTitleMenu(page)
    assert.equal(await page.getByLabel('Name', { exact: true }).count(), 0)
    assert.equal(await page.getByRole('menu', { name: 'Open', exact: true }).count(), 0, 'the Open list is closed until asked for')
    const menuWidth = (await titleMenu(page).boundingBox()).width
    assert.ok(menuWidth < 280, `menu is narrower than the old 280 px (${menuWidth})`)
    // Menu items pad like the bar's buttons (Aurora-u8jx.4.3): Grille's item is 12px wide, its default button 8px; editor.css sets the item to 8px.
    const sidePad = (loc) => loc.first().evaluate((e) => getComputedStyle(e).paddingLeft + ' ' + getComputedStyle(e).paddingRight)
    assert.equal(await sidePad(titleMenu(page).getByRole('menuitem')), await sidePad(page.locator('.editor-back')), 'menu item side padding equals the bar button')
    const open = page.getByRole('menuitem', { name: 'Open', exact: true })
    await open.hover()
    const list = page.getByRole('menu', { name: 'Open', exact: true })
    await list.waitFor()
    assert.ok((await list.getByRole('menuitem').count()) > 0, 'other effects listed')
    assert.equal(await list.getByRole('menuitem', { name: 'Screen colors', exact: true }).count(), 0, 'the open effect is not listed')
    const headings = await list.locator('.ui-menu-section-header').evaluateAll((els) => els.map((e) => e.textContent))
    assert.deepEqual(headings.filter((h) => h === 'Custom' || h === 'Built-in').slice(-1), ['Built-in'], 'Built-in group comes last')
    if (headings.includes('Custom')) assert.ok(headings.indexOf('Custom') < headings.indexOf('Built-in'), 'Custom before Built-in')
    step('the title menu holds the file actions, New and Open submenus; Open groups Custom then Built-in')

    // Arrow keys move focus in the list; they open nothing.
    await list.getByRole('menuitem').first().focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    assert.equal(await currentEffect(page), 'builtin.video')
    await page.keyboard.press('Escape') // closes the submenu level
    await page.keyboard.press('Escape')
    await closed()
    step('arrow keys in the effect list do not switch effects')

    // Right arrow opens Open from the keyboard; Enter opens the focused one.
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'Open', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    const target = page.getByRole('menu', { name: 'Open', exact: true }).getByRole('menuitem').first()
    await target.waitFor()
    await target.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('[data-effect]')?.dataset.effect !== 'builtin.video')
    await page.waitForSelector('.aurora-node')
    const other = await currentEffect(page)
    assert.notEqual(other, 'builtin.video')
    step('Right arrow opens the Open submenu and Enter on an effect opens it')

    // New: Start from, then Empty and the built-ins; Empty is a blank graph.
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'New', exact: true }).hover()
    const starts = page.getByRole('menu', { name: 'New', exact: true })
    await starts.waitFor()
    assert.deepEqual(await starts.locator('.ui-menu-section-header').evaluateAll((els) => els.map((e) => e.textContent)), ['Start from'])
    const startNames = await starts.getByRole('menuitem').allInnerTexts()
    assert.equal(startNames[0], 'Empty')
    assert.ok(startNames.includes('Screen colors'), 'built-ins follow Empty')
    await starts.getByRole('menuitem', { name: 'Empty', exact: true }).click()
    await page.waitForFunction(() => /^@new-[a-z0-9]{6}$/.test(document.querySelector('[data-effect]')?.dataset.effect ?? ''))
    step('New offers Start from, Empty then the built-ins; Empty opens a blank graph')

    // View menu.
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    await live()
    const view = page.getByRole('button', { name: 'View menu' })
    const zoom = async () => Number(/(\d+)%/.exec(await view.innerText())[1])
    const z0 = await zoom()
    // A zoom animates; a menu opened mid-animation is closed by the moving view.
    const settled = async () => {
      for (let last = -1, same = 0; same < 3; ) {
        const z = await zoom()
        same = z === last ? same + 1 : 0
        last = z
        await page.waitForTimeout(100)
      }
    }
    await view.click()
    await page.getByRole('menuitem', { name: 'Zoom in', exact: true }).click()
    await page.waitForFunction((z) => Number(/(\d+)%/.exec(document.querySelector('[aria-label="View menu"]').textContent)[1]) > z, z0)
    await settled()
    await view.click()
    await page.getByRole('menuitem', { name: 'Fit view', exact: true }).click()
    await page.waitForFunction((z) => Number(/(\d+)%/.exec(document.querySelector('[aria-label="View menu"]').textContent)[1]) === z, z0)
    await settled()
    await view.click()
    await page.getByRole('menuitem', { name: 'Show minimap', exact: true }).click()
    await page.locator('.react-flow__minimap').waitFor()
    // Aurora-w6zq.3: the open menu covers the minimap and shares its left edge and width.
    await view.click()
    const popup = page.locator('.ui-popover').filter({ has: page.getByRole('menu') })
    await popup.waitFor()
    await page.waitForTimeout(150)
    const mm = await page.locator('.react-flow__minimap').boundingBox()
    const pb = await popup.boundingBox()
    assert.ok(Math.abs(pb.x - mm.x) <= 1, `menu left ${pb.x} vs minimap ${mm.x}`)
    assert.ok(Math.abs(pb.width - mm.width) <= 1, `menu width ${pb.width} vs minimap ${mm.width}`)
    assert.ok(pb.y <= mm.y + 1 && pb.y + pb.height >= mm.y + mm.height - 1, `menu covers the minimap: menu ${pb.y}+${pb.height}, map ${mm.y}+${mm.height}`)
    await page.screenshot({ path: process.env.VIEW_SHOT ?? '/tmp/view-menu.png' })
    await page.keyboard.press('Escape')
    await view.click()
    await page.getByRole('menuitem', { name: 'Hide minimap', exact: true }).click()
    await page.locator('.react-flow__minimap').waitFor({ state: 'detached' })
    step('the view menu zooms, fits, and toggles the minimap (off by default)')

    // Naming (Aurora-daaa.19): Save on a built-in opens a modal dialog; Cancel,
    // Escape and a scrim click write nothing and return focus to the title button.
    const effectCount = async () => (await page.evaluate(() => fetch('/api/effects').then((r) => r.json()))).effects.length
    const before = await effectCount()
    const dialog = nameDialog(page)
    for (const how of ['Cancel', 'Escape', 'scrim']) {
      await openTitleMenu(page)
      await page.getByRole('menuitem', { name: 'Save', exact: true }).click()
      await dialog.waitFor()
      const confirm = dialog.getByRole('button', { name: 'Save', exact: true })
      assert.equal(await confirm.isDisabled(), true, 'confirm is off while the name is empty')
      await dialog.getByText('Name the new effect first').waitFor()
      if (how === 'Cancel') await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      else if (how === 'Escape') await page.keyboard.press('Escape')
      else await page.mouse.click(5, 5)
      await dialog.waitFor({ state: 'detached' })
      await page.waitForFunction(() => document.activeElement?.classList.contains('editor-title-menu'), null, { timeout: 3000 })
    }
    assert.equal(await effectCount(), before, 'a cancelled dialog writes nothing')
    await openTitleMenu(page)
    assert.equal(await page.getByRole('menuitem', { name: 'Rename' }).count(), 0, 'no Rename on a built-in')
    await page.keyboard.press('Escape')
    step('Save on a built-in opens a naming dialog; Cancel, Escape and a scrim click write nothing')

    // A kept copy from an earlier visit comes back without asking (Aurora-u68h.2): no banner, no buttons.
    await makeEdit(page)
    await page.locator('.editor-title-menu[data-unsaved="true"]').waitFor()
    await page.reload()
    await page.waitForSelector('.aurora-node')
    await page.locator('.editor-title-menu[data-unsaved="true"]').waitFor()
    assert.equal(await button('Restore').count() + (await button('Discard').count()), 0, 'no Restore or Discard')
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'Revert to saved', exact: true }).click()
    await waitToast(page, 'Reverted to the saved version')
    await page.reload()
    await page.waitForSelector('.aurora-node')
    assert.equal(await page.locator('.editor-title-menu[data-unsaved="true"]').count(), 0, 'the reverted copy is gone')
    step('a kept copy restores silently and Revert to saved drops it')

    // Edited since the test: the bar says so and the title menu warns.
    await live()
    await button('Test on lights').click()
    await button('Stop the test').waitFor()
    assert.equal(await page.locator('.editor-edited').count(), 0)
    await makeEdit(page)
    await page.locator('.editor-edited', { hasText: 'Edited since the test' }).waitFor()
    await openTitleMenu(page)
    await page.getByText('Save and apply puts the edited graph live and ends the test').waitFor()
    await page.keyboard.press('Escape')
    await closed()
    await button('Stop the test').click()
    await waitAnnounced(page, 'Reverted')
    assert.equal(await page.locator('.editor-toast').getAttribute('data-shown'), 'false', 'Stop draws no toast')
    await page.locator('.editor-edited').waitFor({ state: 'detached' })
    step('Edited since the test shows in the bar and the title menu; Stop is the only way out')

    // The Test split button (Aurora-qjqy.3): Test at rest, the caret picks Once or Live
    // and starts it, Stop (no countdown) is the Live label, and the current mode is the checked item.
    await live()
    assert.equal(await page.locator('.editor-split-main').innerText(), 'Test (15s)')
    await button('Test mode').click()
    // At rest the current mode is the checked item, not a ', default' suffix (Aurora-w6zq.7).
    await page.getByRole('menuitemradio', { name: 'Once (15 s)', checked: true }).waitFor()
    assert.equal(await page.getByRole('menuitemradio', { name: 'Live (until stopped)' }).getAttribute('aria-checked'), 'false')
    await page.getByRole('menuitemradio', { name: 'Live (until stopped)' }).click()
    await button('Stop the test').waitFor()
    assert.equal(await button('Stop the test').innerText(), 'Stop')
    assert.equal(await button('Test mode').isDisabled(), true, 'the mode menu is shut while a test runs')
    await page.waitForTimeout(3000)
    assert.equal(await button('Stop the test').innerText(), 'Stop', 'Live has no countdown')
    await button('Stop the test').click()
    await waitAnnounced(page, 'Reverted')
    assert.equal(await page.locator('.editor-toast').getAttribute('data-shown'), 'false', 'Stop draws no toast')
    assert.equal(await page.locator('.editor-split-main').innerText(), 'Test (Live)')
    await button('Test mode').click()
    await page.getByRole('menuitemradio', { name: 'Live (until stopped)', checked: true }).waitFor()
    await page.keyboard.press('Escape')
    step('the split button: Live from the menu runs untimed under a bare Stop; the current mode is the checked item')

    // Rank 1: the effect cannot be opened although Aurora answers (Aurora-u68h.9). An error-shell row worded by
    // cause, no Retry and no action, Test off with its own tooltip, and Open still leaves.
    const shots = process.env.SHOTS ?? ''
    const row = page.locator('#shell-banner-slot .shell-banner-row')
    const testTip = async () => {
      await page.mouse.move(700, 400)
      await page.locator('.editor-split').hover({ force: true })
      return page.locator('.ui-tooltip').first()
    }
    const leaveThroughOpen = async (id) => {
      await openTitleMenu(page)
      for (const item of ['Save', 'Save and apply']) assert.equal(await page.getByRole('menuitem', { name: item, exact: true }).isDisabled(), true, `${item} is off with nothing open`)
      await page.getByRole('menuitem', { name: 'Open', exact: true }).click()
      await page.getByRole('menu', { name: 'Open', exact: true }).getByRole('menuitem', { name: /^Screen colors/ }).click()
      await waitEffect(page, id)
      await page.waitForSelector('.aurora-node')
      await row.waitFor({ state: 'detached' })
      await page.waitForFunction(() => document.querySelector('.editor-header')?.dataset.preview !== 'No effect is open')
    }
    const { effects } = await (await fetch(new URL('/api/effects', editorUrl))).json()
    const audio = effects.find((e) => e.id === 'builtin.audio').title

    await page.route('**/api/effects/builtin.audio', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'unknown_effect' }) }),
    )
    await page.goto(`${editorUrl}?effect=builtin.audio`)
    await row.first().waitFor()
    // The title is the effects list's, which arrives with the catalog: the row words itself again when it does.
    await row.filter({ hasText: `${audio} no longer exists.` }).waitFor()
    assert.equal(await row.count(), 1)
    assert.equal(await page.locator('#shell-banner-slot .shell-banner-row').getByRole('button').count(), 0, 'no Retry, no action on the row')
    assert.equal(await status().getAttribute('data-preview'), 'No effect is open')
    assert.equal(await button('Test on lights').isDisabled(), true)
    assert.equal(await (await testTip()).innerText(), 'No effect is open')
    if (shots) await page.screenshot({ path: `${shots}/404-row-test-tooltip.png` })
    await page.unroute('**/api/effects/builtin.audio')
    await leaveThroughOpen('builtin.video')
    step('an effect that is gone (404 unknown_effect): shell row, no Retry, Test off with its tooltip; Open leaves and the row clears')

    await page.route('**/api/effects/builtin.audio', (route) =>
      route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: 'unreadable_effect', message: 'bad json' }) }),
    )
    await page.goto(`${editorUrl}?effect=builtin.audio`)
    await row.first().waitFor()
    await row.filter({ hasText: `${audio}'s file can't be read.` }).waitFor()
    assert.equal(await page.locator('#shell-banner-slot .shell-banner-row').getByRole('button').count(), 0)
    assert.equal(await button('Test on lights').isDisabled(), true)
    if (shots) await page.screenshot({ path: `${shots}/422-row.png` })
    await page.unroute('**/api/effects/builtin.audio')

    // Anything else (a 500, or the catalog failing) is the generic row.
    await page.route('**/api/effects/builtin.audio', (route) => route.fulfill({ status: 500, body: 'oops' }))
    await page.goto(`${editorUrl}?effect=builtin.audio`)
    await row.first().waitFor()
    assert.equal((await row.innerText()).trim(), "Couldn't open the editor.")
    await page.unroute('**/api/effects/builtin.audio')
    step('an unreadable file (422) and any other failure (500): their own shell rows, no Retry')
  } finally {
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await browser.close()
  }
})
console.log('graph-editor top bar: all passed')
