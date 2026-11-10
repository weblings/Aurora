import { useEffect, useState } from 'react'

// A text box that applies its value when it loses focus or Enter is pressed,
// so typing a label is one undo step, not one per key.
export function CommitInput({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const apply = () => text !== value && onCommit(text)
  return (
    <label className="drawer-field">
      <span>{label}</span>
      <input
        type="text"
        className="text-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  )
}
