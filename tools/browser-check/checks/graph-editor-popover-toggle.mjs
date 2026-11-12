// Aurora-w6zq.6 (Grille dev.10): clicking an open menu's trigger closes it
// (Add node, View, title, Test caret), the Add node search field fits the 340 px
// menu, and the View button, Test caret and title chevrons flip via Grille's
// aria-expanded rule (rotate 180deg) with no local icon swap.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const rotate = (trigger) => trigger.locator('.ui-icon[data-chevron]').evaluate((el) => getComputedStyle(el).rotate)

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')

    const triggers = [
      { name: 'Add node', trigger: page.getByRole('button', { name: 'Add node' }), popup: page.getByRole('dialog', { name: 'Add node' }), chevron: false },
      { name: 'View', trigger: page.getByRole('button', { name: 'View menu' }), popup: page.getByRole('dialog', { name: 'View menu' }), chevron: true },
      { name: 'title', trigger: page.getByRole('button', { name: /^Effect menu/ }), popup: page.getByRole('dialog', { name: /Effect/ }).first(), chevron: true },
      { name: 'Test caret', trigger: page.getByRole('button', { name: 'Test mode' }), popup: page.getByRole('dialog', { name: 'Test mode' }), chevron: true },
    ]
    for (const { name, trigger, popup, chevron } of triggers) {
      await trigger.click()
      await popup.waitFor()
      assert.equal(await trigger.getAttribute('aria-expanded'), 'true', `${name}: aria-expanded while open`)
      if (chevron) {
        await page.waitForTimeout(200)
        assert.match(await rotate(trigger), /^(180deg|3\.14)/, `${name}: chevron flips while open`)
      }
      await trigger.click()
      await popup.waitFor({ state: 'detached' })
      assert.equal(await trigger.getAttribute('aria-expanded'), 'false', `${name}: aria-expanded after toggle`)
      if (chevron) {
        await page.waitForTimeout(200)
        assert.match(await rotate(trigger), /^(0deg|none|0)/, `${name}: chevron back when closed`)
      }
      step(`${name}: clicking the trigger again closes it${chevron ? ' and the chevron flips and returns' : ''}`)
    }

    // The Add node search field fits the menu.
    await page.getByRole('button', { name: 'Add node' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add node' })
    const search = page.getByRole('searchbox', { name: 'Search nodes' })
    await search.waitFor()
    const d = await dialog.boundingBox()
    const s = await search.boundingBox()
    assert.ok(s.x >= d.x - 0.5 && s.x + s.width <= d.x + d.width + 0.5, `search field inside the menu: ${JSON.stringify({ d, s })}`)
    assert.ok(d.width <= 341, `menu width ${d.width}`)
    step('the Add node search field fits the menu')
  } finally {
    await browser.close()
  }
})
console.log('graph-editor popover toggle: all passed')
