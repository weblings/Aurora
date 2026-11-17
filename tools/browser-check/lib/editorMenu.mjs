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
  if (wanted !== undefined) await dialog.getByLabel('Effect name', { exact: true }).fill(wanted)
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
  if (id.startsWith('builtin.') || id.startsWith('@')) {
    pendingName.set(page, name)
    return
  }
  await openTitleMenu(page)
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click()
  const dialog = nameDialog(page)
  await dialog.getByLabel('Effect name', { exact: true }).fill(name)
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

// The Tuning button on the canvas, and the count it shows.
export const controlsButton = (page) => page.getByRole('button', { name: /^Tuning \d+$/ })
export async function controlCount(page) {
  return Number(/(\d+)$/.exec(await controlsButton(page).innerText())[1])
}
export const waitControlCount = (page, n) =>
  controlsButton(page).filter({ hasText: new RegExp(`${n}$`) }).waitFor()

// The "Tuning controls…" picker beside a node (Aurora-e4bi.9) and its switches.
export const tuningPicker = (page) => page.locator('.tuning-pick')
export const pickerSwitches = (page) => tuningPicker(page).locator('input[type="checkbox"]')
// The visible switch (the input itself is hidden by forms.css).
export const pickerKnobs = (page) => tuningPicker(page).locator('.toggle-switch')

// Opens the picker for a node by its right-click menu.
export async function openPicker(page, node) {
  await node.locator('.aurora-node-header').click({ button: 'right' })
  await page.getByRole('menu', { name: 'Node actions' }).waitFor()
  await page.getByRole('menuitem', { name: 'Tuning controls…', exact: true }).click()
  await tuningPicker(page).waitFor()
}

// Switches the first param of `node` on or off in Tuning through "Tuning controls…", then closes the picker.
export async function tickFirst(page, node, want = true) {
  await openPicker(page, node)
  if ((await pickerSwitches(page).first().isChecked()) !== want) await pickerKnobs(page).first().click()
  await page.waitForFunction((w) => document.querySelector('.tuning-pick input')?.checked === w, want)
  await page.keyboard.press('Escape')
  await tuningPicker(page).waitFor({ state: 'detached' })
}

// An unsaved edit that works on a built-in (which cannot be renamed): switch a
// Tuning control on for the first Gain node.
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

// The editor's announce-only live region (web/graph-editor/src/Announcer.tsx): what a screen
// reader was last told. Outcomes of a test the user did not cause go here, not on the button.
export const announced = (page) => page.locator('[data-announcer]').innerText()
export const waitAnnounced = (page, text, timeout = 15_000) =>
  page.waitForFunction((t) => document.querySelector('[data-announcer]')?.textContent.includes(t), text, { timeout })

// The Edit dropdown (Aurora-ge1i.2): Undo, Redo, Cut, Copy, Paste, Select all and Delete.
export const editMenuButton = (page) => page.getByRole('button', { name: 'Edit', exact: true })
export const editMenu = (page) => page.getByRole('menu', { name: 'Edit actions' })

export async function openEditMenu(page) {
  await editMenuButton(page).click()
  await editMenu(page).waitFor()
}

// Opens the Edit menu and picks `name` by mouse.
export async function editAction(page, name) {
  await openEditMenu(page)
  await page.getByRole('menuitem', { name, exact: true }).click()
}
