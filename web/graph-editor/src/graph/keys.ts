// Platform-aware key hints for the Edit and right-click menus (Aurora-ge1i.2).
const platform = typeof navigator === 'undefined' ? '' : navigator.platform
export const isMac = /Mac|iPhone|iPad/.test(platform)
const isWindows = /Win/.test(platform)
export const mod = isMac ? 'Cmd' : 'Ctrl'

export const hints = {
  undo: `${mod}+Z`,
  // Ctrl+Y on Windows, Shift+Ctrl+Z on Linux, Shift+Cmd+Z on macOS.
  redo: isWindows ? 'Ctrl+Y' : `Shift+${mod}+Z`,
  cut: `${mod}+X`,
  copy: `${mod}+C`,
  paste: `${mod}+V`,
  'select-all': `${mod}+A`,
  delete: 'Del',
}
