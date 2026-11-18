// Host hook: a framing page (the demo) may define window.auroraCloseEditor() to close the iframe.
// Without it the back link is a plain relative '../'.
type Framed = { auroraCloseEditor?: () => void }

export function closeFramedEditor(win: Window = window): boolean {
  try {
    if (win.parent === win) return false
    const close = (win.parent as unknown as Framed).auroraCloseEditor
    if (typeof close !== 'function') return false
    close.call(win.parent)
    return true
  } catch {
    return false
  }
}
