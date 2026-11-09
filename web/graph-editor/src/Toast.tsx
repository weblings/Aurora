import { useCallback, useEffect, useRef, useState } from 'react'

const TOAST_MS = 3000

// One toast at a time, bottom centre, gone after 3 s. Only for a success or a
// minor refusal the user caused a moment ago (status priority rule): an error
// never goes here, because a toast disappears.
export function useToast() {
  const [text, setText] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((message: string) => {
    window.clearTimeout(timer.current)
    setText(message)
    timer.current = window.setTimeout(() => setText(null), TOAST_MS)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return { text, show }
}

export function Toast({ text }: { text: string | null }) {
  // The live region stays mounted so a screen reader hears the change.
  return (
    <div className="editor-toast" role="status" aria-live="polite" data-shown={text ? 'true' : 'false'}>
      {text}
    </div>
  )
}
