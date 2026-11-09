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
