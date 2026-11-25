import { useSyncExternalStore, type ComponentType } from 'react'
import { mountIsland } from '@weblings_things/grille'

// An island with state of its own is mounted once and fed new props, so a re-render keeps its
// focus, open popup and drag. The caller passes the same handler functions on every update.
export type Live<P> = { update: (props: P) => void; unmount: () => void }

export function mountLive<P extends object>(el: HTMLElement, Component: ComponentType<P>, initial: P): Live<P> {
  let current = initial
  const listeners = new Set<() => void>()
  const subscribe = (fn: () => void) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }
  const Host = () => <Component {...useSyncExternalStore(subscribe, () => current)} />
  const unmount = mountIsland(el, <Host />)
  return {
    update: (props) => {
      current = props
      listeners.forEach((fn) => fn())
    },
    unmount,
  }
}
