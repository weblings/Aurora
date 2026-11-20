import type { DOMAttributes, ReactElement, ReactNode } from 'react'
import type { FocusableElement } from '@react-types/shared'
import { Focusable } from 'react-aria-components'
import { Tooltip, TooltipTrigger } from '@weblings/grille'

// Grille's Tooltip around any element (Aurora-w6zq.8). The element becomes a
// tab stop, because a tooltip on something that cannot take focus is never
// read out; real buttons use Grille's Button as the trigger instead. `text`
// of null or empty renders the child bare. Several lines become a short list.
export function Hint({ text, children, placement }: { text: ReactNode | readonly string[] | null | undefined; children: ReactNode; placement?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (text === null || text === undefined || text === '' || (Array.isArray(text) && text.length === 0)) return <>{children}</>
  return (
    <TooltipTrigger>
      <Focusable>{children as ReactElement<DOMAttributes<FocusableElement>, string>}</Focusable>
      <Tooltip placement={placement}>{Array.isArray(text) ? text.length === 1 ? text[0] : <ul className="hint-list">{text.map((t) => <li key={t}>{t}</li>)}</ul> : text}</Tooltip>
    </TooltipTrigger>
  )
}
