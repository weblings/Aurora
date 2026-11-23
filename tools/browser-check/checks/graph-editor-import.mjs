// Aurora-dzsd: a graph file in. New > From file opens it as a new unsaved effect named from the file, and a file
// dropped on the window merges into the open graph (hint while dragging, one file only, a non-graph file refused
// with the graph unchanged). The file is the editor's own Export graph download. `SHOTS=<dir>` saves the hint.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { launch } from '../lib/browser.mjs'
import { withEditorStack } from '../lib/stack.mjs'
import { currentEffect, pickAction, openTitleMenu, titleMenuButton } from '../lib/editorMenu.mjs'

const SHOTS = process.env.SHOTS

await withEditorStack(async ({ editorUrl }) => {
  const browser = await launch()
  const context = await browser.newContext({ viewport: { width: 1470, height: 900 } })
  const page = await context.newPage()
  page.on('pageerror', (e) => assert.fail(`page error: ${e.message}`))
  const step = (label) => console.log(`ok  ${label}`)
  const count = () => page.locator('.react-flow__node').count()
  const toast = page.locator('.editor-toast')
  const hint = page.locator('.editor-drop')

  // Dispatches one drag event on the body, carrying the given files (none: a drag of text).
  const drag = (type, files = []) =>
    page.evaluate(
      ([kind, list]) => {
        const dt = new DataTransfer()
        if (list.length === 0) dt.setData('text/plain', 'just text')
        for (const f of list) dt.items.add(new File([f.text], f.name, { type: 'application/json' }))
        const e = new DragEvent(kind, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 600, clientY: 400 })
        document.body.dispatchEvent(e)
        return e.defaultPrevented
      },
      [type, files],
    )

  // Opens New or Open and picks From file..., returning the file chooser it raises.
  const fromFile = async (menu) => {
    await openTitleMenu(page)
    await page.getByRole('menuitem', { name: menu, exact: true }).hover()
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('menu', { name: menu, exact: true }).getByRole('menuitem', { name: 'From file...', exact: true }).click(),
    ])
    return chooser
  }

  try {
    await page.goto(`${editorUrl}?effect=builtin.video`)
    await page.waitForSelector('.aurora-node')
    const before = await count()

    // The file under test: this editor's own export of the open graph.
    const [download] = await Promise.all([page.waitForEvent('download'), pickAction(page, 'Export graph')])
    const text = await readFile(await download.path(), 'utf8')
    const file = { name: download.suggestedFilename(), text }
    assert.match(file.name, /\.aurora-graph\.json$/)
    step(`Export graph gives ${file.name}`)

    // New > From file: a new unsaved effect, titled from the file name.
    const first = await fromFile('New')
    await first.setFiles({ name: 'my-test-graph.aurora-graph.json', mimeType: 'application/json', buffer: Buffer.from(text) })
    await page.waitForFunction(() => /^@new-/.test(document.querySelector('[aria-label^="Effect menu"]')?.getAttribute('data-effect') ?? ''))
    await page.waitForSelector('.aurora-node')
    assert.equal(await count(), before, 'the imported graph has the exported nodes')
    assert.match(await titleMenuButton(page).innerText(), /^My test graph\s*\*$/)
    step('New > From file opens the file as an unsaved effect titled from its name')

    // Open > From file reaches the same picker.
    const second = await fromFile('Open')
    await second.setFiles({ name: 'second.aurora-graph.json', mimeType: 'application/json', buffer: Buffer.from(text) })
    await page.waitForFunction(() => /^Second/.test(document.querySelector('[aria-label^="Effect menu"]')?.textContent ?? ''))
    step('Open > From file opens a file the same way')

    // A file that is not a graph: an error line and the open effect stays.
    const effect = await currentEffect(page)
    const bad = await fromFile('New')
    await bad.setFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello": 1}') })
    await toast.getByText('Not an Aurora graph file').waitFor()
    assert.equal(await currentEffect(page), effect)
    step('a non-graph file is refused with a toast and the open effect stays')

    // Drop: the hint shows for files only, and goes away when the drag leaves.
    assert.equal(await hint.count(), 0)
    assert.equal(await drag('dragenter'), false, 'a drag of text is left alone')
    assert.equal(await hint.count(), 0, 'no hint for text')
    assert.equal(await drag('dragenter', [file]), true)
    await hint.getByText('Drop to import').waitFor()
    assert.equal(await drag('dragover', [file]), true, 'dragover is cancelled so the browser does not open the file')
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/drop-hint.png` })
    await drag('dragleave', [file])
    await hint.waitFor({ state: 'detached' })
    step('the drop hint shows for a dragged file, not for text, and goes when the drag leaves')

    // Drop on an open graph merges into it: new nodes added, the output node it already has skipped.
    const open = await count()
    await drag('dragenter', [file])
    await drag('drop', [file])
    await hint.waitFor({ state: 'detached' })
    await page.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length > n, open)
    assert.equal(await count(), open + before - 1, 'every node but the second output node is added')
    await toast.getByText(/allows only one/).waitFor()
    assert.equal(await currentEffect(page), effect, 'a drop merges, it does not open another effect')
    step('a dropped export merges into the open graph and notes the skipped output node')

    // A dropped non-graph file and a second file change nothing.
    const merged = await count()
    await drag('drop', [{ name: 'notes.txt', text: 'hello' }])
    await toast.getByText('Not an Aurora graph file').waitFor()
    await drag('drop', [file, file])
    await toast.getByText('Drop one file at a time').waitFor()
    assert.equal(await count(), merged)
    step('a non-graph drop and a two-file drop leave the graph unchanged')
  } finally {
    await browser.close()
  }
})
console.log('graph-editor import: all passed')
