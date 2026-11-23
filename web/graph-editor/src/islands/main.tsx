import { mountIsland } from '@weblings_things/grille'
import tokensCss from '@weblings_things/grille/tokens.css?url'
import uiCss from '@weblings_things/grille/ui.css?url'
import { NavFooter, type NavFooterProps } from './NavFooter'

// Entry for the main page (web/ui) and the demo. Aurora's own tokens.css is already on those
// pages. Vanilla code reads window.auroraIslands, which exists before app.js runs because
// module scripts execute in document order.
export type AuroraIslands = {
  mountNavFooter: (el: HTMLElement, props: NavFooterProps) => () => void
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
}

;(window as unknown as { auroraIslands?: AuroraIslands }).auroraIslands = islands
