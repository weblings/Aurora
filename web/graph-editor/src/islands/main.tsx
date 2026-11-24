import { useSyncExternalStore } from 'react'
import { mountIsland } from '@weblings_things/grille'
import tokensCss from '@weblings_things/grille/tokens.css?url'
import uiCss from '@weblings_things/grille/ui.css?url'
import { ErrorShell, type ErrorShellProps } from '../ErrorShell'
import { NavFooter, type NavFooterProps } from './NavFooter'

// Entry for the main page (web/ui) and the demo. Aurora's own tokens.css is already on those
// pages. Vanilla code reads window.auroraIslands, which exists before app.js runs because
// module scripts execute in document order.
export type ErrorShellHandle = { update: (props: ErrorShellProps) => void; unmount: () => void }
export type AuroraIslands = {
  mountNavFooter: (el: HTMLElement, props: NavFooterProps) => () => void
  mountErrorShell: (el: HTMLElement, props: ErrorShellProps) => ErrorShellHandle
}

// The shell keeps its collapse and pulse state, so it is mounted once and fed new props.
function mountErrorShell(el: HTMLElement, initial: ErrorShellProps): ErrorShellHandle {
  let current = initial
  const listeners = new Set<() => void>()
  const subscribe = (fn: () => void) => {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }
  const Host = () => <ErrorShell {...useSyncExternalStore(subscribe, () => current)} />
  const unmount = mountIsland(el, <Host />)
  return {
    update: (props) => {
      current = props
      listeners.forEach((fn) => fn())
    },
    unmount,
  }
}

// The entry has no HTML page to link stylesheets, so it adds its own.
for (const href of [tokensCss, uiCss]) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.append(link)
}

const islands: AuroraIslands = {
  mountNavFooter: (el, props) => mountIsland(el, <NavFooter {...props} />),
  mountErrorShell,
}

;(window as unknown as { auroraIslands?: AuroraIslands }).auroraIslands = islands
