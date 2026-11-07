// Frame 8 only: a working keyboard model for button rows. Arrows move focus and never commit.
// Enter, Space or click commits. Right/Left hop between a row and its ellipsis.
const panel = document.getElementById('effects-panel')
const trigger = document.getElementById('effects-trigger')
const live = document.getElementById('mk-live')
const logEl = document.getElementById('mk-log')
const nameOf = (pick) => pick.querySelector('.mk-opt-name').firstChild.textContent

function log(msg, announce = true) {
  logEl.textContent = msg
  if (announce) live.textContent = msg
}

const visiblePicks = () => [...panel.querySelectorAll('.mk-pick')].filter((p) => !p.closest('[hidden]'))

// Roving tabindex: the list is one tab stop, and it follows focus.
function rove(to) {
  for (const p of panel.querySelectorAll('.mk-pick')) p.tabIndex = p === to ? 0 : -1
  to.focus()
}

function commit(pick) {
  const name = nameOf(pick)
  for (const p of panel.querySelectorAll('.mk-pick')) {
    p.removeAttribute('aria-current')
    p.closest('.mk-opt').classList.remove('selected')
    p.querySelector('.mk-check').textContent = ''
  }
  pick.setAttribute('aria-current', 'true')
  pick.closest('.mk-opt').classList.add('selected')
  pick.querySelector('.mk-check').textContent = '✓'
  trigger.querySelector('.dropdown-label').textContent = name
  log(`Switched to ${name}.`)
}

const MENUS = {
  'g-builtin-list': ['Edit graph', 'Duplicate', 'Hide'],
  'g-custom-list': ['Edit graph', 'Rename', 'Duplicate', 'Move up', 'Move down', 'Hide', 'Delete'],
  'g-hidden-list': ['Edit graph', 'Unhide', 'Duplicate'],
}

function closeMenu(refocus = true) {
  const menu = panel.querySelector('.mk-rowmenu')
  if (!menu) return
  const more = menu.parentElement.querySelector('.mk-more')
  more.setAttribute('aria-expanded', 'false')
  menu.remove()
  if (refocus) more.focus()
}

// Inline menu so touch screen readers can reach it (frame 9's menu is placed by layers.js).
function showMenu(more) {
  const opt = more.parentElement
  const reopen = more.getAttribute('aria-expanded') !== 'true'
  closeMenu(false)
  if (!reopen) return
  const menu = document.createElement('div')
  menu.className = 'mk-rowmenu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', more.getAttribute('aria-label'))
  const running = opt.querySelector('.mk-pick').hasAttribute('aria-current')
  for (const label of MENUS[opt.parentElement.id].filter((l) => !(running && l === 'Hide'))) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'dropdown-option' + (label === 'Delete' ? ' dropdown-option-divided' : '')
    b.setAttribute('role', 'menuitem')
    b.textContent = label
    menu.appendChild(b)
  }
  opt.appendChild(menu)
  more.setAttribute('aria-expanded', 'true')
  menu.firstChild.focus()
}

panel.addEventListener('keydown', (e) => {
  if (e.target.closest('.mk-rowmenu') && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return }
  const pick = e.target.closest('.mk-pick')
  const more = e.target.closest('.mk-more')
  if (e.key === 'Escape') {
    e.preventDefault()
    trigger.focus()
    log('Esc: the panel would close and focus is back on the trigger.')
    return
  }
  if (pick) {
    const list = visiblePicks(), i = list.indexOf(pick)
    const to = { ArrowDown: list[i + 1], ArrowUp: list[i - 1], Home: list[0], End: list[list.length - 1] }[e.key]
    if (to) { e.preventDefault(); rove(to) }
    if (e.key === 'ArrowRight') { e.preventDefault(); pick.parentElement.querySelector('.mk-more').focus() }
  } else if (more && e.key === 'ArrowLeft') {
    e.preventDefault()
    rove(more.parentElement.querySelector('.mk-pick'))
  }
})

panel.addEventListener('click', (e) => {
  const item = e.target.closest('.mk-rowmenu [role="menuitem"]')
  if (item) {
    const pick = item.closest('.mk-opt').querySelector('.mk-pick')
    closeMenu()
    log(`${item.textContent} ${nameOf(pick)} (not built in this frame).`)
    return
  }
  const more = e.target.closest('.mk-more')
  if (more) { showMenu(more); return }
  closeMenu(false)
  const pick = e.target.closest('.mk-pick')
  if (pick) { rove(pick); commit(pick); return }
  const head = e.target.closest('.mk-group-toggle button')
  if (head) {
    const open = head.getAttribute('aria-expanded') !== 'true'
    head.setAttribute('aria-expanded', String(open))
    document.getElementById(head.getAttribute('aria-controls')).hidden = !open
    // Keep the list's one tab stop on a visible row.
    const list = visiblePicks()
    if (list.length && !list.some((p) => p.tabIndex === 0)) {
      for (const p of panel.querySelectorAll('.mk-pick')) p.tabIndex = -1
      ;(list.find((p) => p.hasAttribute('aria-current')) || list[0]).tabIndex = 0
    }
    return
  }
  if (e.target.closest('.mk-new')) log('New effect would open the editor.', false)
})

panel.querySelector('.mk-pick[aria-current]').focus()
