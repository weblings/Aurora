import { useSyncExternalStore } from 'react'

// A media query as React state. The editor's bar shrinks in steps (Aurora-daaa.29.1), and
// the steps change which controls exist, so CSS alone cannot do it.
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

// Thresholds (web/ui breaks at 649 px; the others are the cleanup plan's "narrow windows").
export const COMPACT_BAR = '(max-width: 649px)' // Unsaved as a mark on the title
export const TIGHT_BAR = '(max-width: 519px)' // arrow-only back link, Test
export const DOCK_BOTTOM = '(max-width: 649px), (max-aspect-ratio: 3/4)' // drawers dock at the bottom (Aurora-daaa.29.4)
