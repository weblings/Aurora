// The graph editor's title menu (Aurora-daaa.10): Save, Save as new and Save
// and apply live in it, not on the bar.
export const titleMenuButton = (page) => page.getByRole('button', { name: 'Effect menu' })
export const titleMenu = (page) => page.getByRole('menu', { name: 'Effect actions' })

export async function openTitleMenu(page) {
  await titleMenuButton(page).click()
  await titleMenu(page).waitFor()
}

// The naming dialog (Aurora-daaa.19): a modal over a scrim.
export const nameDialog = (page) => page.getByRole('dialog', { name: /^(Name the new effect|Rename effect)$/ })

// Names typed before a save, for a built-in: it has no Rename, so the name is
// held here and entered in the dialog the save opens.
const pendingName = new WeakMap()

// Opens the title menu and picks `name` by mouse, leaving any dialog it opens.
export async function pickAction(page, name) {
  await openTitleMenu(page)
  await page.getByRole('menuitem', { name, exact: true }).click()
}

// pickAction, then, for a save that creates a new effect, the naming dialog. A save that creates a new
// effect opens the naming dialog: it is filled from setName and confirmed.
export async function fileAction(page, name) {
  await pickAction(page, name)
  if (!['Save', 'Save as new', 'Save and apply'].includes(name)) return
  const dialog = nameDialog(page)
  const opened = await dialog.waitFor({ timeout: 1500 }).then(() => true, () => false)
  if (!opened) return
  const wanted = pendingName.get(page)
  if (wanted !== undefined) await dialog.getByLabel('Name', { exact: true }).fill(wanted)
  pendingName.delete(page)
  await dialog.getByRole('button', { name: /^(Save|Save and apply)$/ }).click()
  await dialog.waitFor({ state: 'detached' })
}

// The effect id the editor has open (the title menu button carries it).
export const currentEffect = (page) => titleMenuButton(page).getAttribute('data-effect')
export const waitEffect = (page, id) =>
  page.waitForFunction((want) => document.querySelector('[data-effect]')?.dataset.effect === want, id)

// Sets the effect's name. A custom effect has Rename...: its dialog edits the
// title (unsaved). A built-in cannot be renamed; its name is entered when the
// save opens the naming dialog.
export async function setName(page, name) {
  const id = await currentEffect(page)
  if (id.startsWith('builtin.') || id === '@empty') {
    pendingName.set(page, name)
    return
  }
  await openTitleMenu(page)
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  const dialog = nameDialog(page)
  await dialog.getByLabel('Name', { exact: true }).fill(name)
  await dialog.getByRole('button', { name: 'Rename', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

// The name shown on the title button.
export async function readName(page) {
  return (await titleMenuButton(page).locator('.editor-title-label').innerText()).trim()
}

// Toasts last 3 s: wait for one by its text.
export const waitToast = (page, text, timeout = 5000) =>
  page.waitForFunction((t) => document.querySelector('.editor-toast')?.textContent.includes(t), text, { timeout })

// The Dashboard controls button on the canvas, and the count it shows.
export const controlsButton = (page) => page.getByRole('button', { name: /^Dashboard controls \d+$/ })
export async function controlCount(page) {
  return Number(/(\d+)$/.exec(await controlsButton(page).innerText())[1])
}
export const waitControlCount = (page, n) =>
  controlsButton(page).filter({ hasText: new RegExp(`${n}$`) }).waitFor()

// The Details drawer's "Show on the Dashboard" ticks, for the node it follows.
export const detailsChecks = (page) => page.locator('.drawer-details input[type="checkbox"]')

// Opens Details for a node by its right-click menu. The drawer then follows the selection.
export async function openDetails(page, node) {
  await node.locator('.aurora-node-header').click({ button: 'right' })
  await page.getByRole('menu', { name: 'Node actions' }).waitFor()
  await page.getByRole('menuitem', { name: 'Details', exact: true }).click()
  await page.locator('.drawer-details').waitFor()
}

// Ticks the first param of `node` onto the Dashboard through "Show on the Dashboard".
export async function tickFirst(page, node, want = true) {
  await node.locator('.aurora-node-header').click({ button: 'right' })
  await page.getByRole('menu', { name: 'Node actions' }).waitFor()
  await page.getByRole('menuitem', { name: 'Show on the Dashboard', exact: true }).click()
  const box = detailsChecks(page).first()
  await box.waitFor()
  if (want) await box.check()
  else await box.uncheck()
}

// An unsaved edit that works on a built-in (which cannot be renamed): tick a
// Dashboard control on the first Gain node.
export async function makeEdit(page) {
  await tickFirst(page, page.locator('.aurora-node', { hasText: 'Gain' }).first())
}

// Adds a node through the cascade Add node menu: + button, search, first match.
export async function addNodeByName(page, name) {
  await page.getByRole('button', { name: 'Add node' }).click()
  await page.getByRole('searchbox', { name: 'Search nodes' }).fill(name)
  await page.getByRole('dialog', { name: 'Add node' }).getByRole('option', { name }).first().click()
  await page.getByRole('dialog', { name: 'Add node' }).waitFor({ state: 'detached' })
}
