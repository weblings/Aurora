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
  if (pick.getAttribute('aria-disabled') === 'true') {
    log(`${name} needs a video input. In the app the shell banner explains and offers the fix.`)
    return
  }
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

panel.addEventListener('keydown', (e) => {
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
  const pick = e.target.closest('.mk-pick')
  if (pick) { rove(pick); commit(pick); return }
  const more = e.target.closest('.mk-more')
  if (more) { log(`Row menu for ${nameOf(more.parentElement.querySelector('.mk-pick'))} (menus are shown in frames 1 and 2).`, false); return }
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
