// Aurora-e4bi.4: Tuning sections. The panel menu (Add section, Collapse all, Expand all), the section menu
// (Rename, Move up and down, Delete; none on General), accordions by mouse and keyboard, Move to section >
// New section..., and an empty section that survives a save and reload. At 1100 and 400 px.
// The graph is seeded through the API, not the node menus. `SHOTS=<dir>` saves screenshots.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { controlsButton, fileAction } from '../lib/editorMenu.mjs'

const shots = process.env.SHOTS
const created = []

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const step = (label) => console.log(`ok  ${label}`)

  async function run(width) {
    const tag = `${width} px`
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
    const api = (method, path, body) =>
      page.evaluate(
        async ([method, path, body]) => {
          const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
          return { status: res.status, json: await res.json().catch(() => ({})) }
        },
        [method, path, body],
      )
    try {
      // Seed: five controls of builtin.audio in sections A, A, B and General (two), saved as a user effect.
      await page.goto(`${editorUrl}?effect=builtin.audio`)
      await page.waitForSelector('.aurora-node')
      const graph = (await api('GET', '/api/effects/builtin.audio')).json.graph
      const picked = graph.controls.slice(0, 5).map(({ node, param }, i) => ({ node, param, ...(i < 2 ? { section: 'A' } : i === 2 ? { section: 'B' } : {}) }))
      const id = `tuning-sections-${width}`
      created.push(id)
      const seeded = { ...graph, title: `Tuning sections ${width}`, controls: picked }
      delete seeded.ui
      assert.equal((await api('PUT', '/api/graph/drafts/tuning-sections', { graph: seeded })).status, 200)
      assert.equal((await api('POST', '/api/graph/save', { session: 'tuning-sections', id })).status, 200)
      await api('DELETE', '/api/graph/drafts/tuning-sections')
      await page.goto(`${editorUrl}?effect=${id}`)
      await page.waitForSelector('.aurora-node')

      const drawer = page.locator('.ui-drawer')
      const cards = drawer.locator('.cp-item-card')
      const waitHeadings = (want) =>
        page.waitForFunction((w) => JSON.stringify([...document.querySelectorAll('.cp-item-sec .cp-sec-name')].map((e) => e.textContent)) === JSON.stringify(w), want)
      const waitCards = (n) => page.waitForFunction((n) => document.querySelectorAll('.cp-item-card').length === n, n)
      const sec = (name) => drawer.locator('.cp-item-sec', { has: page.locator('.cp-sec-name', { hasText: new RegExp(`^${name}$`) }) })
      const menuItem = (name) => page.getByRole('menuitem', { name, exact: true })
      const pickFrom = async (button, name) => {
        await button.click()
        await menuItem(name).click()
      }
      const panelMenu = () => drawer.getByRole('button', { name: 'Tuning actions' })
      const secMenu = (name) => sec(name).getByRole('button', { name: `${name} section actions` })
      const dialog = (title) => page.getByRole('dialog', { name: title })
      const field = page.getByRole('textbox', { name: 'Section name' })

      await controlsButton(page).click()
      await cards.first().waitFor()
      await waitHeadings(['A', 'B', 'General'])
      assert.equal(await cards.count(), 5)
      assert.equal(await sec('General').getByRole('button', { name: /section actions$/ }).count(), 0, 'General has no section menu')
      step(`${tag}: headings A, B, General, five cards, no menu on General`)

      // Add section: a duplicate (case-blind) and General are refused, a fresh name appends before General.
      await pickFrom(panelMenu(), 'Add section')
      let d = dialog('New section')
      await field.fill('a')
      await d.getByText('Another section is named "A".').waitFor()
      assert.equal(await d.getByRole('button', { name: 'Create' }).isDisabled(), true)
      await field.fill('General')
      await d.getByText('"General" is the default section.').waitFor()
      assert.equal(await d.getByRole('button', { name: 'Create' }).isDisabled(), true)
      await field.fill('C')
      await d.getByRole('button', { name: 'Create' }).click()
      await d.waitFor({ state: 'detached' })
      await waitHeadings(['A', 'B', 'C', 'General'])
      await sec('C').locator('.cp-empty').waitFor()
      assert.equal(await cards.count(), 5)
      step(`${tag}: Add section refuses a duplicate and General, creates an empty section before General`)
      if (shots) await page.screenshot({ path: `${shots}/sections-${width}.png` })

      // Rename: a taken name is refused, a new one renames in place.
      await pickFrom(secMenu('C'), 'Rename')
      d = dialog('Rename section')
      assert.equal(await field.inputValue(), 'C')
      await field.fill('b')
      await d.getByText('Another section is named "B".').waitFor()
      assert.equal(await d.getByRole('button', { name: 'Rename' }).isDisabled(), true)
      await field.fill('Cee')
      await d.getByRole('button', { name: 'Rename' }).click()
      await d.waitFor({ state: 'detached' })
      await waitHeadings(['A', 'B', 'Cee', 'General'])
      step(`${tag}: Rename refuses a taken name and renames`)

      // Move up and down, with the edges disabled.
      await secMenu('A').click()
      assert.equal(await menuItem('Move up').getAttribute('aria-disabled'), 'true', 'first section cannot move up')
      await page.keyboard.press('Escape')
      await secMenu('Cee').click()
      assert.equal(await menuItem('Move down').getAttribute('aria-disabled'), 'true', 'last named section cannot move down')
      await menuItem('Move up').click()
      await waitHeadings(['A', 'Cee', 'B', 'General'])
      // An empty section cannot lead (the stored order places it after the one it followed), so Move up is off.
      await secMenu('Cee').click()
      assert.equal(await menuItem('Move up').getAttribute('aria-disabled'), 'true', 'an empty section cannot move to the top')
      await page.keyboard.press('Escape')
      await pickFrom(secMenu('Cee'), 'Move down')
      await waitHeadings(['A', 'B', 'Cee', 'General'])
      await pickFrom(secMenu('A'), 'Move down')
      await waitHeadings(['B', 'A', 'Cee', 'General'])
      await pickFrom(secMenu('A'), 'Move up')
      await waitHeadings(['A', 'B', 'Cee', 'General'])
      step(`${tag}: Move up and Move down reorder sections, the ends are disabled`)

      // Move to section > New section...: creates the section and moves the control.
      const last = cards.nth((await cards.count()) - 1)
      const name = (await last.locator('.cp-label').innerText()).trim()
      await last.scrollIntoViewIfNeeded()
      await last.hover()
      await last.getByRole('button', { name: /actions$/ }).click()
      await page.getByRole('menu', { name: /actions$/ }).waitFor()
      await menuItem('Move to section').click()
      await menuItem('New section…').click()
      d = dialog(`New section for ${name}`)
      await field.fill('Fresh')
      await d.getByRole('button', { name: 'Create and move' }).click()
      await d.waitFor({ state: 'detached' })
      await waitHeadings(['A', 'B', 'Cee', 'Fresh', 'General'])
      assert.equal(await sec('Fresh').locator('.cp-empty').count(), 0, 'Fresh is not empty')
      step(`${tag}: Move to section > New section... creates and moves`)

      // Delete: the controls fall back to General.
      const generalCount = async () => Number(await sec('General').locator('.cp-count').innerText())
      const before = await generalCount()
      await pickFrom(secMenu('A'), 'Delete')
      await waitHeadings(['B', 'Cee', 'Fresh', 'General'])
      assert.equal(await generalCount(), before + 2, 'A had two controls')
      assert.equal(await cards.count(), 5)
      step(`${tag}: Delete sends the section's controls to General`)

      // Accordions: by mouse (chevron), by keyboard (arrows), then the panel menu's Collapse all and Expand all.
      const general = await generalCount()
      await sec('General').getByRole('button', { name: 'Collapse General' }).click()
      await waitCards(5 - general)
      await sec('General').getByRole('button', { name: 'Expand General' }).click()
      await waitCards(5)
      await drawer.locator('.cp-item-sec[role="row"]', { has: page.locator('.cp-sec-name', { hasText: /^General$/ }) }).focus()
      await page.keyboard.press('ArrowLeft')
      await waitCards(5 - general)
      await page.keyboard.press('ArrowRight')
      await waitCards(5)
      step(`${tag}: a heading collapses and expands by chevron and by Left and Right`)

      await pickFrom(panelMenu(), 'Collapse all')
      await waitCards(0)
      await panelMenu().click()
      assert.equal(await menuItem('Collapse all').getAttribute('aria-disabled'), 'true')
      await page.keyboard.press('Escape')
      await pickFrom(panelMenu(), 'Expand all')
      await waitCards(5)
      step(`${tag}: Collapse all and Expand all`)

      // An empty section persists in the saved graph and across a reload.
      await fileAction(page, 'Save')
      const saved = (await api('GET', `/api/effects/${id}`)).json.graph
      assert.deepEqual(saved.ui?.['#sections'], ['B', 'Cee', 'Fresh'])
      await page.reload()
      await page.waitForSelector('.aurora-node')
      await controlsButton(page).click()
      await cards.first().waitFor()
      await waitHeadings(['B', 'Cee', 'Fresh', 'General'])
      await sec('Cee').locator('.cp-empty').waitFor()
      step(`${tag}: the empty section Cee survives save and reload`)
    } finally {
      await page.close()
    }
  }

  try {
    await run(1100)
    await run(400)
  } finally {
    const p = await browser.newPage()
    await p.goto(editorUrl)
    for (const id of created) await p.evaluate((id) => fetch(`/api/effects/${id}`, { method: 'DELETE' }), id).catch(() => {})
    await p.close()
    await browser.close()
  }
})
console.log('graph-editor tuning sections: all passed')
