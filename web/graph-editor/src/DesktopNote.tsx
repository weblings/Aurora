import { useState } from 'react'
import { DESKTOP_NOTE, useMedia } from './useMedia'

const KEY = 'aurora.graphEditor.desktopNoteDismissed'
const read = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

// Below 600 px the editor still works but is not built for it (Aurora-daaa.29): say so once.
export function DesktopNote() {
  const narrow = useMedia(DESKTOP_NOTE)
  const [gone, setGone] = useState(read)
  if (!narrow || gone) return null
  return (
    <div className="editor-banner" role="group" aria-label="Window size">
      <span>The graph editor is built for a desktop window.</span>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          setGone(true)
          try {
            localStorage.setItem(KEY, '1')
          } catch {
            // Storage blocked: the note returns next visit, which is harmless.
          }
        }}
      >
        Dismiss
      </button>
    </div>
  )
}
