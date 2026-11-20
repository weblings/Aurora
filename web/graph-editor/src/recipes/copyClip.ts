// Puts the clip on the clipboard for Ctrl+V in the editor. writeText needs a secure context and a user
// gesture: GitHub Pages is HTTPS, anywhere else it can refuse, and the caller then shows the text to select.
export async function copyClip(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
