// Aurora-daaa.11: the top bar, the title menu's Name and effect list, the view
// menu, and the single status spot with its banner and toast.
//
// Status cases (docs/planning/WebUI/GraphEditorCleanup.md, Status priority rule):
//   checked here:       rank 1 + Retry banner, rank 2 Restore/Discard banner,
//                       rank 7 default, Edited since the test, Revert-only bar
//   checked elsewhere:  rank 3 too_many_drafts (gate), rank 4 Reconnect (gate),
//                       rank 5/6 test outcomes (graph-editor edit loop), problems
//                       chip and Preview paused (gate), draft would not load
//                       (gate), Saved toast (edit loop)
//   unit tests:         every rank and the priority order (graph/status.test.ts)
//   manual:             `Whole graph` row in the problems popover, rank 6
//                       `Reload:` after a Save, the Wire refused toast
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { currentEffect, makeEdit, nameDialog, openTitleMenu, titleMenu, waitEffect, waitToast } from '../lib/editorMenu.mjs'

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const button = (name) => page.getByRole('button', { name, exact: true })
  const status = () => page.locator('.editor-status')
  const live = () => page.waitForFunction(() => document.querySelector('.editor-status')?.textContent.includes('Live'), null, { timeout: 10_000 })
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

    // Title menu: file actions and the effect list; no Name field.
    await openTitleMenu(page)
    assert.equal(await page.getByLabel('Name', { exact: true }).count(), 0)
    const list = page.getByRole('menu', { name: 'Open another effect' })
    assert.ok((await list.getByRole('menuitem').count()) > 0, 'other effects listed')
    assert.equal(await list.getByRole('menuitem', { name: 'Screen colors', exact: true }).count(), 0, 'the open effect is not listed')
    step('the title menu holds Name, the file actions and the other effects')

    // Arrow keys move focus in the list; they open nothing.
    await list.getByRole('menuitem').first().focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowUp')
    assert.equal(await currentEffect(page), 'builtin.video')
    await page.keyboard.press('Escape')
    await closed()
    step('arrow keys in the effect list do not switch effects')

    // Enter opens the focused one.
    await openTitleMenu(page)
    const target = page.getByRole('menu', { name: 'Open another effect' }).getByRole('menuitem').first()
    await target.focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('[data-effect]')?.dataset.effect !== 'builtin.video')
    await page.waitForSelector('.aurora-node')
    const other = await currentEffect(page)
    assert.notEqual(other, 'builtin.video')
    step('Enter on an effect opens it')

    // New empty effect.
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'New empty effect', exact: true }).click()
    await waitEffect(page, '@empty')
    step('New empty effect opens a blank graph')

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
    assert.equal(await page.getByRole('menuitem', { name: 'Rename…' }).count(), 0, 'no Rename on a built-in')
    await page.keyboard.press('Escape')
    step('Save on a built-in opens a naming dialog; Cancel, Escape and a scrim click write nothing')

    // Rank 2: an unsaved copy from an earlier visit asks Restore or Discard.
    await makeEdit(page)
    await page.getByText('Unsaved', { exact: true }).waitFor()
    await page.reload()
    await page.waitForSelector('.aurora-node')
    const banner = page.getByRole('group', { name: 'Unsaved changes from an earlier visit' })
    await banner.waitFor()
    await button('Restore').click()
    await waitToast(page, 'Restored')
    await banner.waitFor({ state: 'detached' })
    await page.getByText('Unsaved', { exact: true }).waitFor()
    await page.reload()
    await banner.waitFor()
    await button('Discard').click()
    await waitToast(page, 'Discarded')
    await page.reload()
    await page.waitForSelector('.aurora-node')
    assert.equal(await banner.count(), 0, 'discarded copy is gone')
    step('the restore banner offers Restore and Discard, each answered with a toast')

    // Edited since the test: the bar says so and the title menu warns.
    await live()
    await button('Test on lights').click()
    await button('Revert').waitFor()
    assert.equal(await page.locator('.editor-edited').count(), 0)
    await makeEdit(page)
    await page.locator('.editor-edited', { hasText: 'Edited since the test' }).waitFor()
    await openTitleMenu(page)
    await page.getByText('Save and apply puts the edited graph live and ends the test').waitFor()
    await page.keyboard.press('Escape')
    await closed()
    await button('Revert').click()
    await waitToast(page, 'Reverted')
    await page.locator('.editor-edited').waitFor({ state: 'detached' })
    step('Edited since the test shows in the bar and the title menu; Revert is the only way out')

    // Rank 1: the effect cannot be opened. Banner with Retry, status says so, Test is off.
    await page.route('**/api/effects/builtin.audio', (route) => route.abort())
    await page.goto(`${editorUrl}?effect=builtin.audio`)
    const alert = page.getByRole('alert')
    await alert.waitFor()
    assert.match(await alert.innerText(), /Cannot open 'builtin.audio'/)
    assert.equal(await status().innerText(), 'Aurora unreachable')
    assert.equal(await button('Test on lights').isDisabled(), true)
    await page.unroute('**/api/effects/builtin.audio')
    await alert.getByRole('button', { name: 'Retry' }).click()
    await page.waitForSelector('.aurora-node')
    await alert.waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.querySelector('.editor-status')?.textContent !== 'Aurora unreachable')
    step('an effect that will not open: banner with Retry, status Aurora unreachable, Test off; Retry recovers')
  } finally {
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await browser.close()
  }
})
console.log('graph-editor top bar: all passed')
