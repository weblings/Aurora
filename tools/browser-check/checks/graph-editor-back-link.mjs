// Aurora-daaa.1: the editor header links back to the Dashboard.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'

await withEditorStack(async ({ editorUrl, aurora }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    const link = page.locator('.editor-header a', { hasText: 'Dashboard' })
    assert.equal(await link.count(), 1)
    assert.equal(await link.getAttribute('href'), '/')
    assert.ok(await link.locator('svg').count() === 1, 'back arrow present')
    assert.equal(await page.locator('.editor-header > img').count(), 0, 'placeholder dot is gone')
    console.log('ok  Dashboard link with the back arrow; no placeholder dot')

    // The dev server only proxies /api, so a dev run follows the link on the
    // app's own origin; an embedded run (same origin) clicks it.
    if (process.env.AURORA_EDITOR === 'embedded') {
      await link.click()
      await page.waitForURL(`${aurora}/`)
    } else {
      await page.goto(`${aurora}/`)
    }
    assert.equal(await page.title(), 'Aurora')
    console.log('ok  the link target is the Dashboard')
  } finally {
    await browser.close()
  }
})
console.log('graph-editor back link: all passed')
