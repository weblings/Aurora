// Frame 9 only: the panel as an ARIA tree. Group headers and rows are one arrow sequence,
// rows commit on Enter/Space/click, and Right (or Shift+F10/Menu key) opens a row's actions.
const panel = document.getElementById('effects-panel')
const tree = panel.querySelector('[role="tree"]')
const trigger = document.getElementById('effects-trigger')
const live = document.getElementById('mk-live')
const logEl = document.getElementById('mk-log')

const MENUS = {
  'g-builtin': ['Duplicate', 'Hide'],
  'g-custom': ['Edit graph', 'Rename', 'Duplicate', 'Move up', 'Move down', 'Hide', 'Delete'],
  'g-hidden': ['Unhide', 'Duplicate'],
}
const isGroup = (el) => el.classList.contains('mk-section')
const sectionOf = (row) => row.closest('.mk-section')
const listOf = (section) => section.querySelector('[role="group"]')
const nameOf = (el) => isGroup(el) ? el.querySelector('.mk-head > span').textContent : el.querySelector('.mk-opt-name').firstChild.textContent

function log(msg, announce = true) {
  logEl.textContent = msg
  if (announce) live.textContent = msg
}

const items = () => [...tree.querySelectorAll('[role="treeitem"]')].filter((el) => !el.closest('[hidden]'))

// One tab stop for the whole tree, following focus.
function rove(to) {
  for (const el of tree.querySelectorAll('[role="treeitem"]')) el.tabIndex = el === to ? 0 : -1
  to.focus()
}

// A collapsed group holding the running effect shows a check on its header.
function syncCues() {
  for (const s of tree.querySelectorAll('.mk-section')) {
    const show = s.getAttribute('aria-expanded') === 'false' && !!s.querySelector('.mk-pick[aria-selected="true"]')
    s.querySelector('.mk-cue').hidden = !show
    s.querySelector('.mk-head .sr-only').hidden = !show
  }
}

function setExpanded(section, open) {
  section.setAttribute('aria-expanded', String(open))
  listOf(section).hidden = !open
  syncCues()
}

// A group renders only when it holds an effect.
function syncSections() {
  for (const s of tree.querySelectorAll('.mk-section')) s.hidden = !listOf(s).querySelector('.mk-pick')
}

function commit(row) {
  const name = nameOf(row)
  if (row.getAttribute('aria-disabled') === 'true') {
    log(`${name} needs a video input. In the app the shell banner explains and offers the fix.`)
    return
  }
  for (const p of tree.querySelectorAll('.mk-pick')) {
    p.setAttribute('aria-selected', 'false')
    p.closest('.mk-opt').classList.remove('selected')
    p.querySelector('.mk-check').textContent = ''
  }
  row.setAttribute('aria-selected', 'true')
  row.closest('.mk-opt').classList.add('selected')
  row.querySelector('.mk-check').textContent = '✓'
  trigger.querySelector('.dropdown-label').textContent = name
  syncCues()
  log(`Switched to ${name}.`)
}

// Hide/Unhide: move the row, then put focus on the next row, else the previous, else the group.
function moveRow(row, toSection, verb) {
  const from = sectionOf(row)
  const siblings = [...listOf(from).querySelectorAll('.mk-pick')]
  const i = siblings.indexOf(row)
  const dest = siblings[i + 1] || siblings[i - 1] || null
  listOf(toSection).appendChild(row.closest('.mk-opt'))
  syncSections()
  syncCues()
  const focus = dest || (from.hidden ? items()[0] : from)
  rove(focus)
  log(`${nameOf(row)} ${verb} ${nameOf(toSection)}. Focus on ${nameOf(focus)}.`)
}

let openMenu = null

function closeMenu(refocus = true) {
  if (!openMenu) return
  const { menu, row } = openMenu
  menu.remove()
  row.closest('.mk-opt').classList.remove('menu-open')
  const more = row.parentElement.querySelector('.mk-more')
  more.classList.remove('open')
  more.setAttribute('aria-expanded', 'false')
  openMenu = null
  if (refocus) rove(row)
}

function showMenu(row) {
  closeMenu(false)
  const kind = listOf(sectionOf(row)).id.replace('-list', '')
  const menu = document.createElement('div')
  menu.className = 'mk-rowmenu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', `Actions for ${nameOf(row)}`)
  for (const label of MENUS[kind]) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'dropdown-option' + (label === 'Delete' ? ' dropdown-option-divided' : '')
    b.setAttribute('role', 'menuitem')
    b.tabIndex = -1
    b.textContent = label
    if (label === 'Hide' && row.getAttribute('aria-selected') === 'true') b.setAttribute('aria-disabled', 'true')
    menu.appendChild(b)
  }
  // Rendered outside the tree (a treeitem cannot own it), positioned under the row.
  const opt = row.closest('.mk-opt'), pr = panel.getBoundingClientRect()
  const rr = opt.getBoundingClientRect()
  menu.style.top = `${rr.bottom - pr.top}px`
  panel.appendChild(menu)
  // Flip above the row when it would run off the bottom and there is room above.
  const mh = menu.offsetHeight
  if (rr.bottom + mh > window.innerHeight && rr.top - mh >= 0) menu.style.top = `${rr.top - pr.top - mh}px`
  opt.classList.add('menu-open')
  const more = row.parentElement.querySelector('.mk-more')
  more.classList.add('open')
  more.setAttribute('aria-expanded', 'true')
  openMenu = { menu, row }
  menu.firstChild.focus()
}

function runAction(label, item) {
  const { row } = openMenu
  if (item.getAttribute('aria-disabled') === 'true') {
    log(`The running effect cannot be hidden.`)
    return
  }
  closeMenu(false)
  if (label === 'Hide') return moveRow(row, document.getElementById('g-hidden-list').closest('.mk-section'), 'moved to')
  if (label === 'Unhide') return moveRow(row, document.getElementById(row.closest('.mk-opt').dataset.origin + '-list').closest('.mk-section'), 'moved back to')
  rove(row)
  log(`${label} ${nameOf(row)} (not built in this frame).`)
}

// Remember where each row started so Unhide returns it there. Strobe and Plasma are customs.
for (const opt of tree.querySelectorAll('.mk-opt')) {
  const id = listOf(sectionOf(opt)).id.replace('-list', '')
  opt.dataset.origin = id === 'g-hidden' ? 'g-custom' : id
}

let typed = '', typedAt = 0

panel.addEventListener('keydown', (e) => {
  const menuItem = e.target.closest('.mk-rowmenu [role="menuitem"]')
  if (menuItem) {
    const all = [...openMenu.menu.children], i = all.indexOf(menuItem)
    const to = { ArrowDown: all[(i + 1) % all.length], ArrowUp: all[(i - 1 + all.length) % all.length], Home: all[0], End: all[all.length - 1] }[e.key]
    if (to) { e.preventDefault(); to.focus() }
    else if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); closeMenu() }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); runAction(menuItem.textContent, menuItem) }
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    trigger.focus()
    log('Esc: the panel would close and focus is back on the trigger.')
    return
  }
  const node = e.target.closest('[role="treeitem"]')
  if (!node) return
  const list = items(), i = list.indexOf(node)
  const group = isGroup(node), open = group && node.getAttribute('aria-expanded') === 'true'
  let to = null
  switch (e.key) {
    case 'ArrowDown': to = list[i + 1]; break
    case 'ArrowUp': to = list[i - 1]; break
    case 'Home': to = list[0]; break
    case 'End': to = list[list.length - 1]; break
    case 'ArrowRight':
      if (group && !open) setExpanded(node, true)
      else if (group) to = listOf(node).querySelector('.mk-pick')
      else showMenu(node)
      break
    case 'ArrowLeft':
      if (group && open) setExpanded(node, false)
      else if (!group) to = sectionOf(node)
      break
    case 'Enter': case ' ':
      if (group) setExpanded(node, !open)
      else commit(node)
      break
    case 'F10': if (!e.shiftKey) return
    // falls through
    case 'ContextMenu':
      if (!group) showMenu(node)
      break
    default:
      // Type-ahead: jump to the next item starting with the typed letters.
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return
      typed = (e.timeStamp - typedAt < 600 ? typed : '') + e.key.toLowerCase()
      typedAt = e.timeStamp
      to = [...list.slice(i + 1), ...list.slice(0, i + 1)].find((el) => nameOf(el).toLowerCase().startsWith(typed))
  }
  e.preventDefault()
  if (to) rove(to)
})

panel.addEventListener('click', (e) => {
  const item = e.target.closest('.mk-rowmenu [role="menuitem"]')
  if (item) { runAction(item.textContent, item); return }
  const more = e.target.closest('.mk-more')
  if (more) { showMenu(more.parentElement.querySelector('.mk-pick')); return }
  if (openMenu) closeMenu(false)
  const head = e.target.closest('.mk-head')
  if (head) { const s = head.closest('.mk-section'); setExpanded(s, s.getAttribute('aria-expanded') !== 'true'); rove(s); return }
  const row = e.target.closest('.mk-pick')
  if (row) { rove(row); commit(row); return }
  if (e.target.closest('.mk-new')) log('New effect would open the editor.', false)
})

document.addEventListener('click', (e) => {
  if (openMenu && !panel.contains(e.target)) closeMenu(false)
})

// The panel is non-modal, so Tab out of it is where it would close.
panel.addEventListener('focusout', (e) => {
  if (!panel.contains(e.relatedTarget)) log('Focus left the panel: it would close here.', false)
})

syncCues()
tree.querySelector('.mk-pick[aria-selected="true"]').focus()
