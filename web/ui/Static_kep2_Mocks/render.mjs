// Screenshots index.html and every frame at 390px into <out_dir>.
// Usage: node render.mjs <out_dir>  (needs `npm install` in tools/browser-check)
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launch } from '../../../tools/browser-check/lib/browser.mjs'

const dir = fileURLToPath(new URL('.', import.meta.url))
const out = process.argv[2]
if (!out) { console.error('usage: node render.mjs <out_dir>'); process.exit(1) }
mkdirSync(out, { recursive: true })
const url = (f) => pathToFileURL(join(dir, f)).href

const b = await launch()
const p = await b.newPage({ viewport: { width: 1800, height: 3200 } })
await p.goto(url('index.html'))
await p.waitForTimeout(800)
await p.screenshot({ path: join(out, 'index.png'), fullPage: true })
for (const f of ['frame1', 'frame2', 'frame3', 'frame4','frame5', 'frame6', 'frame7', 'frame8', 'frame9', 'frame1-both', 'frame10', 'frame11', 'frame11b', 'frame12', 'frame13', 'frame13b', 'frame14', 'frame14b', 'frame15', 'frame15b', 'frame16', 'frame17', 'frame18', 'frame18b', 'frame18c', 'frame19', 'frame19b', 'frame20']) {
  const q = await b.newPage({ viewport: { width: 390, height: 640 } })
  await q.goto(url(f + '.html')); await q.waitForTimeout(500)
  await q.screenshot({ path: join(out, f + '.png') }); await q.close()
}
await b.close()
