// Aurora-u68h.6: announce-only messages reach the live region and draw nothing; the three lossy
// toasts (Removed N Dashboard controls, Reverted to the saved version, Loaded the saved version)
// carry a real Undo button that works by mouse and by keyboard, does not steal focus, holds its
// timer while hovered and is spent by the next edit; a plain Saved toast keeps no Undo.
// `SHOTS=<dir>` saves each Undo toast.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import {
  addNodeByName, controlCount, currentEffect, fileAction, makeEdit, openTitleMenu, setName, tickFirst, waitAnnounced, waitControlCount, waitToast,
} from '../lib/editorMenu.mjs'

const created = []
const shots = process.env.SHOTS

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const api = (method, path, body) =>
    page.evaluate(async ([method, path, body]) => {
      const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      return { status: res.status, json: await res.json().catch(() => ({})) }
    }, [method, path, body])
  const shot = (name) => shots && page.screenshot({ path: `${shots}/${name}.png` })
  const toast = page.locator('.editor-toast')
  const undoButton = toast.getByRole('button', { name: 'Undo' })
  const shown = async () => (await toast.getAttribute('data-shown')) === 'true'
  const gone = () => page.waitForFunction(() => document.querySelector('.editor-toast')?.getAttribute('data-shown') === 'false', null, { timeout: 12_000 })
  const unsaved = async () => (await page.getByRole('button', { name: /^Effect menu/ }).getAttribute('data-unsaved')) === 'true'
  const gain = () => page.locator('.aurora-node', { hasText: 'Gain' }).first()
  const nodes = () => page.locator('.react-flow__node').count()
  const undoKey = process.platform === 'darwin' ? 'Meta+z' : 'Control+z'
  const prompt = () => page.getByRole('dialog', { name: /has a newer saved version$/ })
  // Keyboard path to the button: Tab from the canvas until focus lands on it (the toast is the last tab
  // stop on the page), then Enter.
  const pressUndoByKeyboard = async () => {
    await page.locator('.react-flow__pane').focus().catch(() => {})
    let tabs = 0
    while (tabs++ < 300 && (await page.evaluate(() => document.activeElement?.textContent)) !== 'Undo') await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement?.closest('.editor-toast') !== null), true, 'Undo is reached with Tab')
    await page.keyboard.press('Enter')
  }
  const keptCopy = () => page.evaluate(() => Object.keys(localStorage).some((k) => k.endsWith('undo-toast-a')))
  const open = async (id) => {
    await page.goto(`${editorUrl}?effect=${encodeURIComponent(id)}`)
    await page.waitForSelector('.aurora-node')
  }

  try {
    await open('builtin.video')

    // Announce only: Added <type> reaches the live region; nothing is drawn.
    const before = await nodes()
    await addNodeByName(page, 'Gain')
    await waitAnnounced(page, 'Added ')
    assert.equal(await shown(), false, 'Added draws no toast')
    assert.equal((await toast.innerText()).trim(), '')
    assert.equal(await nodes(), before + 1)
    step('Added <type> is announced and draws nothing')
    await page.keyboard.press(undoKey)
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n, before)

    // Removed N Dashboard controls: one history entry, Undo is the history's.
    await tickFirst(page, gain())
    const controls = await controlCount(page)
    const removeGain = async () => {
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await gain().locator('.aurora-node-header').click()
      await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
      await page.keyboard.press('Delete')
      await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n, before - 1, { timeout: 4000 }).catch(async (e) => {
        await page.screenshot({ path: '/private/tmp/claude-501/-Users-andrewgwinner-Documents-Coding-Aurora-Aurora/b24e5d21-143c-4735-bce9-5ebb2d31c77d/scratchpad/6g/fail.png' })
        throw new Error(`delete did not land; nodes ${await nodes()} focus ${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 150))}`)
      })
      await page.waitForFunction(() => /Removed \d+ Dashboard controls? with/.test(document.querySelector('.editor-toast')?.textContent ?? ''))
    }
    await removeGain()
    await undoButton.waitFor()
    assert.equal(await page.evaluate(() => document.activeElement?.closest('.editor-toast')), null, 'the toast did not take focus')
    await shot('removed-controls-undo-toast')
    await undoButton.click()
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n, before)
    await gone()
    await gain().locator('.aurora-node-header').click()
    await waitControlCount(page, controls)
    step('Undo on the Removed toast, by mouse, restores the node and its controls and closes the toast')

    await removeGain()
    await pressUndoByKeyboard()
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n, before)
    await gone()
    step('Undo on the Removed toast, by keyboard (Tab, Enter)')

    // Ctrl+Z stays the keyboard path, and spends the toast.
    await removeGain()
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press(undoKey)
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n, before)
    await gone()
    step('Ctrl/Cmd+Z undoes the same edit and the toast goes with it')

    // The next edit spends the Undo: it must not act on a graph the user has moved on from.
    await removeGain()
    await addNodeByName(page, 'Rescale')
    await gone()
    assert.equal(await undoButton.count(), 0, 'another edit spent the Undo')
    step('another edit spends the Undo')

    // Hover holds the clock past the 8 s mark.
    await page.keyboard.press(undoKey)
    await page.keyboard.press(undoKey)
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length >= n, before)
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 300 } })
    if (await gain().count()) {
      await removeGain()
      await toast.hover()
      await page.waitForTimeout(9500)
      assert.equal(await shown(), true, 'hover holds the timer past 8 s')
      await page.mouse.move(5, 5)
      await gone()
      step('the Undo toast outlasts 8 s while hovered and then leaves')
    }

    // A plain Saved toast has no Undo, and its text is unchanged.
    await api('DELETE', '/api/effects/undo-toast-a').catch(() => {})
    await page.evaluate(() => localStorage.clear())
    await open('builtin.video')
    await setName(page, 'Undo toast a')
    await fileAction(page, 'Save')
    await page.waitForFunction(() => document.querySelector('[data-effect]')?.dataset.effect === 'undo-toast-a')
    created.push('undo-toast-a')
    await page.waitForSelector('.aurora-node')
    await waitToast(page, 'Saved as Undo toast a')
    assert.equal(await toast.getAttribute('data-undo'), 'false')
    assert.equal(await undoButton.count(), 0)
    step('a Saved toast is unchanged and has no Undo')

    // Revert to saved: one history entry; Undo runs it and the kept copy comes back.
    const saved = await controlCount(page)
    const revert = async () => {
      await makeEdit(page)
      await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.endsWith('undo-toast-a')))
      await openTitleMenu(page)
      await page.getByRole('menuitem', { name: 'Revert to saved', exact: true }).click()
      await waitToast(page, 'Reverted to the saved version')
      assert.equal(await unsaved(), false)
      assert.equal(await keptCopy(), false, 'the revert dropped the kept copy')
    }
    await revert()
    await undoButton.waitFor()
    await shot('reverted-undo-toast')
    await undoButton.click()
    await waitControlCount(page, saved + 1)
    assert.equal(await unsaved(), true)
    await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.endsWith('undo-toast-a')))
    assert.equal(await keptCopy(), true, 'Undo brought the kept copy back')
    await gone()
    step('Undo on Reverted, by mouse, restores the edits and the kept copy')

    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'Revert to saved', exact: true }).click()
    await waitToast(page, 'Reverted to the saved version')
    await pressUndoByKeyboard()
    await waitControlCount(page, saved + 1)
    assert.equal(await keptCopy() || (await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.endsWith('undo-toast-a'))), true), true)
    step('Undo on Reverted, by keyboard')

    // Another edit spends it.
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'Revert to saved', exact: true }).click()
    await waitToast(page, 'Reverted to the saved version')
    await makeEdit(page)
    await gone()
    await makeEdit(page)
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'Revert to saved', exact: true }).click()
    await waitToast(page, 'Reverted to the saved version')
    await page.keyboard.press(undoKey)
    await waitControlCount(page, saved + 1)
    await gone()
    step('Ctrl/Cmd+Z undoes a revert too')

    // Load saved (newer-saved-version prompt): not a history entry; Undo puts the kept edits back.
    const changeSaved = async (title) => {
      const graph = (await api('GET', '/api/effects/undo-toast-a')).json.graph
      assert.equal((await api('PUT', '/api/graph/drafts/undo-toast-ext', { graph: { ...graph, title } })).status, 200)
      assert.equal((await api('POST', '/api/graph/save', { session: 'undo-toast-ext', id: 'undo-toast-a' })).status, 200)
      await api('DELETE', '/api/graph/drafts/undo-toast-ext')
    }
    const loadSaved = async (title) => {
      await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.endsWith('undo-toast-a')))
      await changeSaved(title)
      await page.reload()
      await prompt().waitFor()
      await prompt().getByRole('button', { name: 'Load saved', exact: true }).click()
      await waitToast(page, 'Loaded the saved version')
      assert.equal(await unsaved(), false)
    }
    await open('undo-toast-a')
    assert.equal(await unsaved(), true)
    const kept = await controlCount(page)
    await loadSaved('Undo toast a v2')
    await undoButton.waitFor()
    await shot('loaded-undo-toast')
    await undoButton.click()
    await waitControlCount(page, kept)
    assert.equal(await unsaved(), true)
    await gone()
    await page.reload()
    await page.waitForSelector('.aurora-node')
    assert.equal(await prompt().count(), 0, 'no second prompt: the restored edits are based on the new saved version')
    assert.equal(await unsaved(), true)
    step('Undo on Loaded the saved version, by mouse, restores the kept edits')

    await loadSaved('Undo toast a v3')
    await pressUndoByKeyboard()
    await waitControlCount(page, kept)
    assert.equal(await unsaved(), true)
    step('Undo on Loaded the saved version, by keyboard')
  } finally {
    for (const id of created) await api('DELETE', `/api/effects/${id}`).catch(() => {})
    await api('DELETE', '/api/graph/drafts/undo-toast-ext').catch(() => {})
    await browser.close()
  }
})
console.log('graph-editor undo-toast: all passed')
