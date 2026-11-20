// Which menu a right-click or Shift+F10 on a param row opens: the browser's own on a number or text field.
export function isNativeField(t: Element): boolean {
  return t.matches('input[type="number"], input[type="text"]')
}

export const isMenuKey = (e: { key: string; shiftKey: boolean }) => (e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu'

// Windows raises a native contextmenu when Shift+F10 or the Menu key is released, after our popup took focus.
// Swallow it until the key is up so the browser menu does not open on top.
export function swallowKeyContextMenu() {
  const stop = (e: Event) => e.preventDefault()
  const done = () => document.removeEventListener('contextmenu', stop, true)
  document.addEventListener('contextmenu', stop, true)
  document.addEventListener('keyup', () => window.setTimeout(done, 150), { capture: true, once: true })
  window.setTimeout(done, 3000)
}
