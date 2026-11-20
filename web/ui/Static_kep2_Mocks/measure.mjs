// Prints computed type, color and box metrics for selectors in one frame at 390px,
// to line elements up by numbers instead of by eye.
// Usage: node measure.mjs frame4.html "#g-custom" ".mk-new"
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launch } from '../../../tools/browser-check/lib/browser.mjs'

const dir = fileURLToPath(new URL('.', import.meta.url))
const [frame, ...sels] = process.argv.slice(2)
if (!frame || !sels.length) { console.error('usage: node measure.mjs <frame.html> <selector>...'); process.exit(1) }

const b = await launch()
const p = await b.newPage({ viewport: { width: 390, height: 640 } })
await p.goto(pathToFileURL(join(dir, frame)).href)
const r = await p.evaluate((sels) => Object.fromEntries(sels.map((s) => {
  const e = document.querySelector(s)
  if (!e) return [s, null]
  const c = getComputedStyle(e), box = e.getBoundingClientRect()
  return [s, { fs: c.fontSize, fw: c.fontWeight, ls: c.letterSpacing, tt: c.textTransform, color: c.color, opacity: c.opacity, h: Math.round(box.height), left: Math.round(box.left), pad: c.padding }]
})), sels)
console.log(JSON.stringify(r, null, 1))
await b.close()
