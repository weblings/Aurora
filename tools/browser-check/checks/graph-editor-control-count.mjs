// Aurora-daaa.4: the baseline for the graph editor cleanup stages.
//
// Rule: count every <button>, <input>, <select>, <textarea> and <a href> that
// is rendered (non-empty box, not display:none or visibility:hidden), enabled
// or disabled, anywhere in the page EXCEPT inside a canvas node
// (.react-flow__node). That is the "chrome" the cleanup sets out to shrink:
// header, action row, and (until Aurora-daaa.27.4) the inspector.
// The viewport is 1470x900. Each stage lowers CEILING to the new measurement;
// a count above it fails, a count below it prints a reminder to lower it.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'

// Stage 1 baseline (Aurora-daaa.4: 84 and 132), lowered by Aurora-daaa.11 (top bar, title and view menus), measured on the fake-Hue stack.
// Aurora-daaa.24 replaced the 53-button Add node list with the + button and cascade menu (video 79 -> 26, audio 126 -> 74).
// Aurora-daaa.27.4 removed the inspector (menus and drawers replace it); mock target 11.
// Aurora-s1t7.4 raised both to 10: the Zones island header is a button (the mock's hide chevron); the old thumbnail was a canvas.
// Aurora-qjqy.3 raised video to 11, the mock's target: the Test split button's caret (Test mode) is its own button. Audio measures 10.
const CEILING = { 'builtin.video': 11, 'builtin.audio': 10 }

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const page = await browser.newPage({ viewport: { width: 1470, height: 900 } })
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  try {
    for (const [effect, ceiling] of Object.entries(CEILING)) {
      await page.goto(`${editorUrl}?effect=${effect}`)
      await page.waitForSelector('.aurora-node')
      await page.waitForTimeout(500)
      const n = await page.evaluate(() => [...document.querySelectorAll('button, input, select, textarea, a[href]')]
        .filter((el) => !el.closest('.react-flow__node'))
        .filter((el) => {
          const r = el.getBoundingClientRect()
          const s = getComputedStyle(el)
          return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
        }).length)
      console.log(`${effect}: ${n} chrome controls (ceiling ${ceiling})`)
      assert.ok(n <= ceiling, `${effect}: ${n} controls exceeds the ceiling ${ceiling}`)
      if (n < ceiling) console.log(`note  ${effect}: below the ceiling, lower CEILING to ${n}`)
    }
  } finally {
    await browser.close()
  }
})
console.log('graph-editor control count: all passed')
