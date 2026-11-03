// Tree frames: tooltips and row menus live in the panel, outside the tree and its scroll region,
// and are placed against their row here. frame9.js uses window.mkLayers for its live menu.
const layerPanel = document.getElementById('effects-panel')

// Under the row, else above it, else pinned to the viewport bottom.
function place(el, opt, overlap = 0) {
  const pr = layerPanel.getBoundingClientRect(), rr = opt.getBoundingClientRect(), h = el.offsetHeight
  let top = rr.bottom - overlap
  if (top + h > innerHeight) top = rr.top - h + overlap >= 0 ? rr.top - h + overlap : innerHeight - h
  el.style.top = `${top - pr.top}px`
}

const rowOf = (el) => layerPanel.querySelector(`.mk-opt[data-id="${el.dataset.row}"]`)
let shownTip = null

function showTip(opt) {
  hideTip()
  const tip = layerPanel.querySelector(`.mk-tip[data-row="${opt.dataset.id}"]`)
  if (!tip) return
  tip.hidden = false
  place(tip, opt, 4)
  shownTip = tip
}

function hideTip() {
  if (shownTip) shownTip.hidden = true
  shownTip = null
}

if (layerPanel) {
  window.mkLayers = { place, showTip, hideTip }
  layerPanel.addEventListener('mouseover', (e) => {
    const opt = e.target.closest('.mk-opt')
    if (opt && !opt.classList.contains('menu-open')) showTip(opt)
  })
  layerPanel.addEventListener('mouseleave', hideTip)
  layerPanel.querySelector('.mk-scroll').addEventListener('scroll', hideTip)
  // Static frames ship a tooltip or menu already open: place it once layout (and any scroll) is set.
  addEventListener('load', () => {
    for (const el of layerPanel.querySelectorAll('.mk-rowmenu[data-row], .mk-tip:not([hidden])')) {
      place(el, rowOf(el), el.classList.contains('mk-tip') ? 4 : 0)
      if (el.classList.contains('mk-tip')) shownTip = el
    }
  })
}
