import { useCallback, useEffect, useRef, useState } from 'react'

const CLEAR_MS = 10_000

// Screen-reader announcements with nothing drawn (Aurora-u68h.3, reused by 6g). Call
// `announce(text)` for a message the screen already shows or a state that is not drawn;
// render `<Announcer text={text} />` once, anywhere. The same text twice in a row is
// spoken twice. It is not a toast: use Toast for a message people should see.
export function useAnnouncer() {
  const [text, setText] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const announce = useCallback((message: string) => {
    window.clearTimeout(timer.current)
    // Empty first so an identical message is a change the reader notices.
    setText('')
    timer.current = window.setTimeout(() => {
      setText(message)
      timer.current = window.setTimeout(() => setText(''), CLEAR_MS)
    }, 50)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { text, announce }
}

export function Announcer({ text }: { text: string }) {
  // Mounted for the whole session: a live region added with its text is often missed.
  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-announcer="">
      {text}
    </div>
  )
}
