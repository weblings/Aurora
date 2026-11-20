import { useEffect, useRef, useState } from 'react'

const CLEAR_MS = 10_000
const FILL_MS = 50

// The live region's timing, apart from React so it can be tested with fake timers. Each announce
// empties the region first, so an identical message is a change the reader notices, then fills it
// 50 ms later. Messages asked for before that fill are spoken together, in order: a second announce
// inside the 50 ms must not drop the first (a light test ending and the shell's new row arrive in
// the same poll, Aurora-4ccg). web/ui/shell.js gathers its announcements the same way.
export function announceQueue(setText: (text: string) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: string[] = []
  return {
    announce(message: string) {
      clearTimeout(timer)
      pending.push(message)
      setText('')
      timer = setTimeout(() => {
        setText(pending.join(' '))
        pending = []
        timer = setTimeout(() => setText(''), CLEAR_MS)
      }, FILL_MS)
    },
    dispose() {
      clearTimeout(timer)
    },
  }
}

// Screen-reader announcements with nothing drawn (Aurora-u68h.3, reused by 6g). Call
// `announce(text)` for a message the screen already shows or a state that is not drawn;
// render `<Announcer text={text} />` once, anywhere. The same text twice in a row is
// spoken twice. It is not a toast: use Toast for a message people should see.
export function useAnnouncer() {
  const [text, setText] = useState('')
  const queue = useRef<ReturnType<typeof announceQueue> | null>(null)
  if (!queue.current) queue.current = announceQueue(setText)
  useEffect(() => () => queue.current?.dispose(), [])
  return { text, announce: queue.current.announce }
}

export function Announcer({ text }: { text: string }) {
  // Mounted for the whole session: a live region added with its text is often missed.
  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-announcer="">
      {text}
    </div>
  )
}
