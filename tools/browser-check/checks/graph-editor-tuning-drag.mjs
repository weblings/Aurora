// Aurora-e4bi.5: drag handles in Tuning. A card to another section (mouse), a section reorder (mouse), keyboard
// drag of a card and a section with its announcements, headings refuse cards-only spots, a drop onto an empty
// section, save and reload, and Undo. At 1100 and 400 px. The graph is seeded through the API.
// Touch drag is not scripted here: Chromium does not start a native drag from synthetic touch input.
import assert from 'node:assert/strict'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { controlsButton, fileAction } from '../lib/editorMenu.mjs'

const created = []

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const step = (label) => console.log(`ok  ${label}`)

  async function run(width) {
    const tag = `${width} px`
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 1800 : 900 } })
    const page = await context.newPage()
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
      // The 400 px dock is half the window, so the window is tall enough to show every row without scrolling.
      // Seed: A (c0, c1), Void (empty), B (c2), General (c3, c4). Labels make the cards' names unique.
      await page.goto(`${editorUrl}?effect=builtin.audio`)
      await page.waitForSelector('.aurora-node')
      const graph = (await api('GET', '/api/effects/builtin.audio')).json.graph
      const sections = ['A', 'A', 'B']
      const picked = graph.controls.slice(0, 5).map(({ node, param }, i) => ({ node, param, label: `c${i}`, ...(i < 3 ? { section: sections[i] } : {}) }))
      const id = `tuning-drag-${width}`
      created.push(id)
      const seeded = { ...graph, title: `Tuning drag ${width}`, controls: picked, ui: { '#sections': ['A', 'Void', 'B'] } }
      assert.equal((await api('PUT', '/api/graph/drafts/tuning-drag', { graph: seeded })).status, 200)
      assert.equal((await api('POST', '/api/graph/save', { session: 'tuning-drag', id })).status, 200)
      await api('DELETE', '/api/graph/drafts/tuning-drag')
      await page.goto(`${editorUrl}?effect=${id}`)
      await page.waitForSelector('.aurora-node')

      const drawer = page.locator('.ui-drawer')
      // The rows in order: a heading is '#name', a card its label.
      const readLayout = () =>
        [...document.querySelectorAll('.cp-item')]
          .map((e) => (e.classList.contains('cp-item-sec') ? `#${e.querySelector('.cp-sec-name').textContent}` : e.querySelector('.cp-label').textContent))
          .join(' ')
      const layout = () => page.evaluate(readLayout)
      const waitLayout = (want) =>
        page
          .waitForFunction(([fn, w]) => new Function(`return (${fn})()`)() === w, [readLayout.toString(), want], { timeout: 5000 })
          .catch(async () => assert.equal(await layout(), want))
      const sec = (name) => drawer.locator('.cp-item-sec', { has: page.locator('.cp-sec-name', { hasText: new RegExp(`^${name}$`) }) })
      const card = (name) => drawer.locator('.cp-item-card', { has: page.locator('.cp-label', { hasText: new RegExp(`^${name}$`) }) })
      const grip = (label) => drawer.getByRole('button', { name: label, exact: true })
      const BASE = '#A c0 c1 #Void #B c2 #General c3 c4'

      // Announcements are collected from the live regions.
      const watch = () => page.evaluate(() => {
        window.__said = []
        new MutationObserver(() => {
          for (const el of document.querySelectorAll('[aria-live]')) {
            const t = el.textContent.trim()
            if (t && window.__said[window.__said.length - 1] !== t) window.__said.push(t)
          }
        }).observe(document.body, { subtree: true, childList: true, characterData: true })
      })
      await watch()

      await controlsButton(page).click()
      await card('c0').waitFor()
      await waitLayout(BASE)
      assert.equal(await grip('Drag the General section').count(), 0, 'General has no grip')
      assert.equal(await grip('Drag the A section').count(), 1)
      step(`${tag}: ${BASE}, a grip on each card and named section, none on General`)

      const drag = async (from, to, where) => {
        const b = await to.boundingBox()
        const y = where === 'before' ? 3 : where === 'after' ? b.height - 3 : b.height / 2
        // React Aria sets pointer-events none on the grip, so a mouse drag starts on the row beside it.
        const row = from.locator('xpath=ancestor::*[@role="row"][1]')
        await row.dragTo(to, { sourcePosition: { x: 40, y: 12 }, targetPosition: { x: Math.min(60, b.width / 2), y } })
      }
      // A section drag folds every section once it starts, so the target is measured after the fold.
      const dragSection = async (name, target, where) => {
        const b = await grip(`Drag the ${name} section`).locator('xpath=ancestor::*[@role="row"][1]').boundingBox()
        await page.mouse.move(b.x + 40, b.y + 12)
        await page.mouse.down()
        await page.mouse.move(b.x + 45, b.y + 20, { steps: 3 })
        await page.waitForFunction(() => document.querySelectorAll('.cp-item-card').length === 0)
        const t = await sec(target).boundingBox()
        const y = where === 'before' ? 3 : where === 'after' ? t.height - 3 : t.height / 2
        await page.mouse.move(t.x + 60, t.y + y, { steps: 6 })
        await page.mouse.up()
      }

      await drag(grip('Drag c0'), sec('B'), 'on')
      await waitLayout('#A c1 #Void #B c2 c0 #General c3 c4')
      step(`${tag}: a card dropped on a section heading goes to its end`)
      await drag(grip('Drag c4'), card('c1'), 'before')
      await waitLayout('#A c4 c1 #Void #B c2 c0 #General c3')
      step(`${tag}: a card dropped between cards joins that section there`)

      await dragSection('B', 'A', 'before')
      await waitLayout('#B c2 c0 #A c4 c1 #Void #General c3')
      step(`${tag}: a section dragged before another reorders, and the sections unfold again`)

      await drag(grip('Drag c4'), sec('Void'), 'on')
      await waitLayout('#B c2 c0 #A c1 #Void c4 #General c3')
      await drag(grip('Drag c4'), card('c1'), 'before')
      await waitLayout('#B c2 c0 #A c4 c1 #Void #General c3')
      step(`${tag}: an empty section takes a card, and the one it left stays`)

      await dragSection('Void', 'B', 'before')
      await waitLayout('#B c2 c0 #A c4 c1 #Void #General c3')
      step(`${tag}: an empty section dropped first is refused (as the menu's Move up)`)

      await fileAction(page, 'Save')
      await page.reload()
      await page.waitForSelector('.aurora-node')
      await controlsButton(page).click()
      await card('c0').waitFor()
      await watch()
      await waitLayout('#B c2 c0 #A c4 c1 #Void #General c3')
      step(`${tag}: the dragged order persists across save and reload`)

      await drag(grip('Drag c2'), sec('A'), 'on')
      await waitLayout('#B c0 #A c4 c1 c2 #Void #General c3')
      await page.mouse.click(width - 5, 5)
      await page.keyboard.press('Control+z')
      await waitLayout('#B c2 c0 #A c4 c1 #Void #General c3')
      step(`${tag}: Undo reverses a drag in one step`)

      // Keyboard: the grip is one Right arrow from a card row (two from a section row). Each stop is announced.
      const label = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '')
      const inDrag = () => page.waitForFunction(() => /^(Insert|Drop on)/.test(document.activeElement?.getAttribute('aria-label') ?? ''))
      const visit = async (until, max = 14) => {
        const seen = []
        for (let i = 0; i < max; i++) {
          const l = await label()
          seen.push(l)
          if (until.test(l)) return seen
          await page.keyboard.press('ArrowDown')
        }
        assert.fail(`no drop target matched ${until}: ${JSON.stringify(seen)}`)
      }
      const HEADING = '(A|B|Void|General)'
      await card('c3').focus()
      await page.keyboard.press('ArrowRight')
      assert.equal(await label(), 'Drag c3')
      await page.keyboard.press('Enter')
      await inDrag()
      let seen = await visit(/^Drop on B$/)
      const againstHeading = new RegExp(`^Insert (before|after) ${HEADING}$|^Insert between ${HEADING} and|and ${HEADING}$`)
      for (const l of seen) assert.equal(againstHeading.test(l), false, `a card is never placed against a heading: ${l}`)
      await page.keyboard.press('Enter')
      await waitLayout('#B c2 c0 c3 #A c4 c1 #Void')
      step(`${tag}: keyboard drag of a card (Right, Enter, arrows, Enter) drops it on a heading`)

      await card('c4').focus()
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Enter')
      await inDrag()
      await page.keyboard.press('Escape')
      await waitLayout('#B c2 c0 c3 #A c4 c1 #Void')
      step(`${tag}: Escape cancels a keyboard drag of a card`)

      await sec('B').focus()
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      assert.equal(await label(), 'Drag the B section')
      await page.keyboard.press('Enter')
      await inDrag()
      assert.equal(await drawer.locator('.cp-item-card').count(), 0, 'sections fold for a section drag')
      seen = await visit(/^Insert (after A|between A and Void)$/)
      for (const l of seen) assert.equal(/\bc\d\b|^Drop on/.test(l), false, `a section only targets gaps between headings: ${l}`)
      await page.keyboard.press('Enter')
      await waitLayout('#A c4 c1 #B c2 c0 c3 #Void')
      step(`${tag}: keyboard drag of a section targets only gaps between headings, folds, and unfolds on drop`)

      await sec('A').focus()
      await page.keyboard.press('ArrowLeft')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Enter')
      await inDrag()
      await page.keyboard.press('Escape')
      await waitLayout('#A c4 c1 #B c2 c0 c3 #Void')
      step(`${tag}: Escape cancels a keyboard drag of a section and unfolds`)

      const said = await page.evaluate(() => window.__said.join(' || '))
      assert.match(said, /Started dragging/, 'the start is announced')
      assert.match(said, /Insert (between|after|before) /, 'drop targets are announced')
      assert.match(said, /Drop on \w+/, 'a heading target is announced')
      assert.match(said, /Drop complete/, 'the drop is announced')
      assert.match(said, /cancel/i, 'the cancel is announced')
      step(`${tag}: start, targets, drop and cancel are announced`)
    } finally {
      await context.close()
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
console.log('graph-editor tuning drag: all passed')
