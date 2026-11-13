// Aurora-u68h.4 (stage 6d) and Aurora-u68h.8: a Save, Save as new or Save and apply with problems
// writes nothing and points at the problems chip (callout, then a ping, popover closed, focus on
// the chip); a problems row moves focus to its node; Enter on the chip lands on the first row; the
// unsaved dot (Grille's dotIcon) on the title, on Open items and on the "Not saved yet" heading,
// each with its screen-reader text. SHOTS=<dir> saves the callout, the ping, the title dot and Open.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { addNodeByName, currentEffect, fileAction, makeEdit, openTitleMenu, setName, titleMenu, waitEffect } from '../lib/editorMenu.mjs'

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
  const writes = []
  page.on('request', (r) => r.method() === 'POST' && /\/api\/graph\/(save|apply)$/.test(r.url()) && writes.push(r.url()))
  const chip = page.locator('.editor-problems-chip')
  const callout = page.locator('[data-refused]')
  const status = page.locator('.editor-refused-status')
  const effectIds = async () => (await api('GET', '/api/effects')).json.effects?.map((e) => e.id).sort() ?? []
  const open = async (id) => {
    await page.goto(`${editorUrl}?effect=${encodeURIComponent(id)}`)
    if (id.startsWith('@')) await waitEffect(page, id)
    else await page.waitForSelector('.aurora-node')
  }
  const unsavedTitle = page.locator('.editor-title-menu[data-unsaved="true"]')
  // Records when the callout and the chip's ping appear and go, from inside the page.
  const watch = () =>
    page.evaluate(() => {
      window.__t = []
      const t0 = performance.now()
      const seen = { callout: false, ping: false }
      const note = (name) => window.__t.push([name, Math.round(performance.now() - t0)])
      const tick = () => {
        const c = !!document.querySelector('[data-refused]')
        const p = !!document.querySelector('.editor-problems-chip[data-pinging]')
        if (c !== seen.callout) note(c ? 'callout on' : 'callout off')
        if (p !== seen.ping) note(p ? 'ping on' : 'ping off')
        seen.callout = c
        seen.ping = p
        window.__raf = requestAnimationFrame(tick)
      }
      tick()
    })
  const timeline = async () => {
    await page.waitForFunction(() => window.__t.some(([n]) => n === 'callout off'), null, { timeout: 8000 })
    await page.evaluate(() => cancelAnimationFrame(window.__raf))
    return page.evaluate(() => Object.fromEntries(window.__t))
  }

  try {
    // A custom effect with a problem: an unwired Gain node.
    await open('builtin.video')
    await setName(page, 'Refused save a')
    await fileAction(page, 'Save')
    await waitEffect(page, 'refused-save-a')
    created.push('refused-save-a')
    await page.waitForSelector('.aurora-node')
    assert.equal(await unsavedTitle.count(), 0)
    const savedGraph = JSON.stringify((await api('GET', '/api/effects/refused-save-a')).json.graph)
    await addNodeByName(page, 'Gain')
    await chip.waitFor()
    const problemCount = Number(/^(\d+)/.exec(await chip.innerText())[1])
    assert.ok(problemCount > 0)
    const idsBefore = await effectIds()
    writes.length = 0
    const expectText = (plain) =>
      `Couldn't save. Fix ${problemCount} ${problemCount === 1 ? 'problem' : 'problems'} first.${plain ? ' Your changes are kept in this browser.' : ''}`

    const refused = async (how, name, plain, shotName) => {
      const modality = how === 'keyboard'
      await watch()
      if (modality) {
        await page.locator('.editor-title-menu').focus()
        await page.keyboard.press('Enter')
        await titleMenu(page).waitFor()
        await page.waitForTimeout(300)
        const order = ['Save', 'Save as new', 'Save and apply']
        const want = order.indexOf(name)
        const seen = []
        for (let i = 0; i < 6; i++) {
          const now = await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className}:${document.activeElement?.textContent?.slice(0, 20)}`)
          seen.push(now)
          if (now.endsWith(`:${name}`)) break
          await page.keyboard.press('ArrowDown')
        }
        assert.ok(want >= 0)
        await page.keyboard.press('Enter')
      } else {
        await openTitleMenu(page)
        await page.getByRole('menuitem', { name, exact: true }).click()
      }
      await titleMenu(page).waitFor({ state: 'detached' })
      await callout.waitFor()
      assert.equal(await callout.innerText(), expectText(plain), `${how} ${name}: callout text`)
      assert.equal(await status.getAttribute('role'), 'status')
      assert.equal(await page.getByRole('dialog', { name: 'Problems' }).count(), 0, 'the popover stays closed')
      assert.equal(await chip.getAttribute('aria-expanded'), 'false')
      assert.equal(await page.getByRole('dialog', { name: /Name the new effect/ }).count(), 0, 'no naming dialog')
      // Focus is on the chip (after the menu's own restore), and its ring shows after keyboard use only.
      await page.waitForFunction(() => document.activeElement?.classList.contains('editor-problems-chip'))
      await page.waitForTimeout(150)
      assert.equal(await chip.evaluate((el) => el === document.activeElement), true, 'focus stays on the chip')
      assert.equal(await chip.evaluate((el) => el.matches(':focus-visible')), modality, `${how}: focus ring ${modality ? 'shows' : 'stays hidden'}`)
      if (shotName) await shot(`${shotName}-callout`)
      assert.equal(await chip.getAttribute('data-pinging'), null, 'the ping comes after the callout')
      if (shotName) {
        await page.locator('.editor-problems-chip[data-pinging]').waitFor()
        await page.waitForTimeout(200)
        await shot(`${shotName}-ping`)
      }
      const t = await timeline()
      assert.ok(t['callout on'] < t['ping on'], 'the callout comes before the ping')
      assert.ok(t['ping on'] - t['callout on'] >= 1200 && t['ping on'] - t['callout on'] <= 1900, `ping after a beat: ${t['ping on'] - t['callout on']} ms`)
      const shown = t['callout off'] - t['callout on']
      assert.ok(shown >= 3900 && shown <= 4700, `callout lasts about 4.2 s: ${shown} ms`)
      assert.ok(Math.abs(t['ping off'] - t['callout off']) <= 120, `the ping ends as the callout closes (${t['ping off']} vs ${t['callout off']})`)
      assert.equal(await effectIds().then((ids) => JSON.stringify(ids)), JSON.stringify(idsBefore), 'no effect file written')
      assert.equal(JSON.stringify((await api('GET', '/api/effects/refused-save-a')).json.graph), savedGraph, 'the saved graph is untouched')
      assert.equal(writes.length, 0, `no save or apply request: ${writes}`)
      await page.mouse.click(700, 600) // leave the chip focused-less for the next round
    }
    await refused('mouse', 'Save', true, shots ? 'a' : null)
    step('Save by mouse: callout with the kept-copy line, then the ping, popover closed, no ring, nothing written')
    await refused('mouse', 'Save as new', false)
    step('Save as new by mouse: callout without the kept-copy line, then the ping, nothing written')
    await refused('mouse', 'Save and apply', false)
    step('Save and apply by mouse: callout, then the ping, nothing written')
    await refused('keyboard', 'Save', true)
    step('Save by keyboard: focus on the chip with the ring')
    await refused('keyboard', 'Save as new', false)
    await refused('keyboard', 'Save and apply', false)
    step('Save as new and Save and apply by keyboard refuse the same way')

    // The items stay enabled and in the arrow-key order.
    await openTitleMenu(page)
    for (const name of ['Save', 'Save as new', 'Save and apply']) {
      assert.equal(await page.getByRole('menuitem', { name, exact: true }).isDisabled(), false, `${name} is never disabled`)
    }
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.editor-banner').count(), 0)
    await page.waitForFunction(() => !document.querySelector('[data-refused]'))

    // Reduced motion holds the border without the pulse.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await watch()
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'Save', exact: true }).click()
    await page.locator('.editor-problems-chip[data-pinging]').waitFor()
    const animation = await chip.evaluate((el) => getComputedStyle(el, '::after').animationName)
    const border = await chip.evaluate((el) => getComputedStyle(el, '::after').borderTopStyle)
    assert.equal(animation, 'none', 'no pulse under reduced motion')
    assert.equal(border, 'dashed', 'the border holds')
    await timeline()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    step('reduced motion: the border holds, no pulse')

    // Enter on the chip lands on the first row; picking a row moves focus to its node.
    await chip.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Problems' })
    await dialog.waitFor()
    await page.waitForFunction(() => document.activeElement?.classList.contains('editor-problem-row'))
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.editor-problem-row')), true, 'the first row has focus')
    const nodeId = await dialog.locator('.editor-problem-row strong').first().innerText()
    await page.keyboard.press('Enter')
    await dialog.waitFor({ state: 'detached' })
    const nodeSel = `.react-flow__node[data-id="${nodeId}"]`
    await page.waitForFunction((sel) => document.activeElement === document.querySelector(sel), nodeSel)
    await page.waitForTimeout(300)
    assert.equal(await page.evaluate((sel) => document.activeElement === document.querySelector(sel), nodeSel), true, 'keyboard focus stays on the node')
    assert.equal(await page.locator(nodeSel).evaluate((el) => el.matches(':focus-visible')), true, 'ring after keyboard use')
    assert.equal(await page.locator(nodeSel).evaluate((el) => el.classList.contains('selected')), true, 'node selected')
    step('Enter on the chip focuses the first row; a row pick selects the node and focuses it with the ring')
    // By mouse: focus lands on the node, with no ring.
    await page.mouse.click(700, 700)
    await chip.click()
    await dialog.waitFor()
    await dialog.locator('.editor-problem-row').first().click()
    await page.waitForFunction((sel) => document.activeElement === document.querySelector(sel), nodeSel)
    await page.waitForTimeout(300)
    assert.equal(await page.locator(nodeSel).evaluate((el) => el === document.activeElement && !el.matches(':focus-visible')), true, 'mouse: focus on the node, no ring')
    step('a row picked by mouse focuses the node without a ring')

    // The dot: title, with the screen-reader text, none of the old word.
    await page.getByRole('button', { name: 'Effect menu, unsaved changes' }).waitFor()
    assert.equal(await unsavedTitle.locator('svg').count(), 2, 'the dot and the chevron are Grille icons')
    assert.equal(await page.locator('.editor-dirty, .editor-dirty-mark').count(), 0, 'no old word or CSS dot')
    assert.equal(await page.getByText('Unsaved', { exact: true }).count(), 0)
    await shot('title-dot')
    step('the title shows Grille\'s dotIcon with the name "Effect menu, unsaved changes"')

    // Open: a Custom item with a kept copy gets the dot; the New effect's group ends with it.
    await page.evaluate(() => localStorage.clear())
    await open('builtin.video')
    await setName(page, 'Refused save b')
    await fileAction(page, 'Save')
    await waitEffect(page, 'refused-save-b')
    created.push('refused-save-b')
    await page.waitForSelector('.aurora-node')
    assert.equal(await unsavedTitle.count(), 0)
    // An edit on A, kept when B opens.
    await open('refused-save-a')
    await makeEdit(page)
    await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.endsWith('refused-save-a')))
    // A new effect with a node: Not saved yet.
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'New', exact: true }).hover()
    await page.getByRole('menu', { name: 'New', exact: true }).getByRole('menuitem', { name: 'Empty', exact: true }).click()
    await page.waitForFunction(() => /^@new-/.test(document.querySelector('[data-effect]')?.dataset.effect ?? ''))
    const fresh = await currentEffect(page)
    await addNodeByName(page, 'Gain')
    await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('@new-')))
    await open('refused-save-b')
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: 'Open', exact: true }).hover()
    const flyout = page.getByRole('menu', { name: 'Open', exact: true })
    await flyout.waitFor()
    const groups = await flyout.getByRole('group').evaluateAll((els) => els.map((g) => g.querySelector('.ui-menu-section-header')?.textContent.replace(/\s+/g, ' ').trim()))
    assert.deepEqual(groups.slice(0, 2), ['Not saved yet, unsaved changes', 'Custom'])
    const heading = flyout.getByRole('group', { name: /^Not saved yet.*unsaved changes$/ })
    assert.equal(await heading.locator('.ui-menu-section-header svg').count(), 1, 'the heading ends with the dot')
    assert.equal((await heading.getByRole('menuitem').count()) > 0, true)
    assert.equal(await heading.getByRole('menuitem').first().locator('svg').count(), 0, 'no dot on Not saved yet items')
    assert.equal(await heading.getByRole('menuitem').first().locator('[slot=description], .ui-visually-hidden').count(), 0, 'no description on Not saved yet items')
    const itemA = flyout.getByRole('menuitem', { name: /Refused save a/ })
    assert.equal(await itemA.locator('svg').count(), 1, 'the Custom item with a kept copy has a dot')
    const described = await itemA.evaluate((el) => (el.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent).join(' ').trim())
    assert.equal(described, 'unsaved changes', 'screen-reader text on the item')
    assert.equal(await flyout.getByRole('menuitem', { name: /Candle|Screen colors|Music pulse/ }).first().locator('svg').count(), 0, 'a saved Built-in has no dot')
    assert.equal(await flyout.locator('.problem-badge, .problem-mark').count(), 0, 'no problem counts in Open')
    await shot('open-dots')
    step('Open: Custom item with the dot and "unsaved changes"; "Not saved yet" heading ends with the dot, its items have none')
    // Opening a kept copy is silent: dot and chip, no toast, no callout.
    await itemA.click()
    await waitEffect(page, 'refused-save-a')
    await unsavedTitle.waitFor()
    assert.equal(await page.locator('.editor-toast[data-shown="true"]').count(), 0, 'no toast')
    assert.equal(await callout.count(), 0, 'no callout')
    step('opening an effect with a kept copy is silent: the dot, no toast or callout')
    void fresh
  } finally {
    for (const id of created) await api('DELETE', `/api/effects/${id}`).catch(() => {})
    await browser.close()
  }
})
console.log('graph-editor refused-save: all passed')
