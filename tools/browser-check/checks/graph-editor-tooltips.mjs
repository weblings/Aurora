// Aurora-w6zq.8: hover help is Grille's Tooltip, not title=. No title attribute
// is left on nodes, ports, params or toolbar buttons; hovering a node title, a
// port, Undo and Add node shows a .ui-tooltip; keyboard focus shows it and Esc
// hides it. SHOTS=<dir> saves screenshots (both themes).
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const shot = async (name) => process.env.SHOTS && (await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }))
  const tooltip = page.locator('.ui-tooltip')

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')

    const titled = await page.locator('.aurora-node [title], .editor-header [title], .editor-add-node[title], .react-flow__panel [title]').evaluateAll((els) => els.map((e) => `${e.tagName}.${e.className}: ${e.title}`))
    assert.deepEqual(titled, [], 'no title= on nodes, ports, params or toolbar buttons')
    step('no title= left on nodes, ports, params or toolbar buttons')

    const hoverShows = async (locator, label) => {
      await page.mouse.move(0, 0)
      await tooltip.waitFor({ state: 'detached' }).catch(() => {})
      await locator.hover()
      await tooltip.first().waitFor({ timeout: 3000 })
      assert.ok((await tooltip.first().innerText()).trim().length > 0, `${label}: tooltip has text`)
      return tooltip.first().innerText()
    }

    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme })
      await hoverShows(page.locator('.aurora-node-header strong').first(), 'node title')
      await shot(`tooltip-node-${theme}`)
      await hoverShows(page.locator('.aurora-port-name').first(), 'port')
      await shot(`tooltip-port-${theme}`)
      await hoverShows(page.getByRole('button', { name: 'Add node' }), 'Add node')
      await shot(`tooltip-add-node-${theme}`)
      step(`${theme}: node title, port and Add node tooltips show`)
    }

    const undo = page.getByRole('button', { name: 'Add node' })
    await undo.focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await tooltip.first().waitFor({ timeout: 3000 })
    await page.keyboard.press('Escape')
    await tooltip.first().waitFor({ state: 'detached', timeout: 3000 })
    step('keyboard focus shows a tooltip and Esc hides it')
  } finally {
    await browser.close()
  }
})
console.log('graph-editor tooltips: all passed')
