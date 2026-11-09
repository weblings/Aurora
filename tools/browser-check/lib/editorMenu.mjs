// The graph editor's title menu (Aurora-daaa.10): Save, Save as new and Save
// and apply live in it, not on the bar.
export const titleMenuButton = (page) => page.getByRole('button', { name: 'Effect menu' })
export const titleMenu = (page) => page.getByRole('menu', { name: 'Effect actions' })

export async function openTitleMenu(page) {
  await titleMenuButton(page).click()
  await titleMenu(page).waitFor()
}

// Opens the title menu and picks `name` by mouse.
export async function fileAction(page, name) {
  await openTitleMenu(page)
  await page.getByRole('menuitem', { name, exact: true }).click()
}

// The effect id the editor has open (the title menu button carries it).
export const currentEffect = (page) => titleMenuButton(page).getAttribute('data-effect')
export const waitEffect = (page, id) =>
  page.waitForFunction((want) => document.querySelector('[data-effect]')?.dataset.effect === want, id)

// Name lives in the title menu: open it, type, close it with Esc.
export async function setName(page, name) {
  await openTitleMenu(page)
  await page.getByLabel('Name', { exact: true }).fill(name)
  await page.keyboard.press('Escape')
  await titleMenu(page).waitFor({ state: 'detached' })
}

export async function readName(page) {
  await openTitleMenu(page)
  const name = await page.getByLabel('Name', { exact: true }).inputValue()
  await page.keyboard.press('Escape')
  await titleMenu(page).waitFor({ state: 'detached' })
  return name
}

// Toasts last 3 s: wait for one by its text.
export const waitToast = (page, text, timeout = 5000) =>
  page.waitForFunction((t) => document.querySelector('.editor-toast')?.textContent.includes(t), text, { timeout })
