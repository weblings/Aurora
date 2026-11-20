// Aurora-ge1i.2: clipboard design board (frame #s8-clip). Static, nothing here is wired.
// Menu wording follows web/graph-editor/src/ContextMenu.tsx, not the older live frames above.

// Hints per platform. Ctrl+Shift+Z and Ctrl+Y both redo on Windows and Linux, the hint shows the platform's own.
const KEYS = {
  win: { paste: 'Ctrl+V', all: 'Ctrl+A', undo: 'Ctrl+Z', redo: 'Ctrl+Y', cut: 'Ctrl+X', copy: 'Ctrl+C', del: 'Del' },
  linux: { paste: 'Ctrl+V', all: 'Ctrl+A', undo: 'Ctrl+Z', redo: 'Ctrl+Shift+Z', cut: 'Ctrl+X', copy: 'Ctrl+C', del: 'Del' },
  mac: { paste: 'Cmd+V', all: 'Cmd+A', undo: 'Cmd+Z', redo: 'Cmd+Shift+Z', cut: 'Cmd+X', copy: 'Cmd+C', del: 'Delete' },
}
let CK = KEYS.win

function clipItem(it) {
  if (it === '-') return s6('div', 'ge-rule')
  return el('button', { type: 'button', class: 'ge-item', role: 'menuitem', disabled: it.disabled, 'aria-haspopup': it.sub ? 'menu' : undefined },
    el('span', { class: 'ge-item-main' }, it.label),
    it.sub ? chevron('ge-arrow cc-chev') : it.key ? el('kbd', {}, it.key) : null)
}
const clipMenu = (label, items) => s6('div', 'ge-pop ge-menu cl-static', { role: 'menu', 'aria-label': label }, ...items.map(clipItem))

// Add node stays as it is. Clipboard items sit after the view actions in the canvas menu.
const canvasItems = ({ pasteOff = false } = {}) => [
  { label: 'Add node', sub: true }, '-',
  { label: 'Undo', key: CK.undo }, { label: 'Redo', key: CK.redo, disabled: true }, { label: 'Fit view', key: 'F' }, '-',
  { label: 'Paste', key: CK.paste, disabled: pasteOff }, { label: 'Select all', key: CK.all },
]
const nodeItems = () => [
  { label: 'Details' }, { label: 'Show on the Dashboard', sub: true }, '-',
  { label: 'Cut', key: CK.cut }, { label: 'Copy', key: CK.copy }, '-',
  { label: 'Delete', key: CK.del },
]
const editItems = (n) => [
  { label: 'Undo', key: CK.undo }, { label: 'Redo', key: CK.redo, disabled: true }, '-',
  { label: 'Cut', key: CK.cut, disabled: n === 0 }, { label: 'Copy', key: CK.copy, disabled: n === 0 }, { label: 'Paste', key: CK.paste }, '-',
  { label: 'Select all', key: CK.all }, '-',
  { label: 'Delete', key: CK.del, disabled: n === 0 },
]
const withKeys = (platform, make) => { const prev = CK; CK = KEYS[platform]; try { return make() } finally { CK = prev } }

// Menu panel with its measured width in the caption.
function clipMenuPanel(label, menuLabel, items) {
  const menu = clipMenu(menuLabel, items)
  const panel = s6panel(label, menu)
  requestAnimationFrame(() => panel.querySelector('figcaption').append(` (menu ${Math.round(menu.getBoundingClientRect().width)} px)`))
  return panel
}

// Variant A keeps Undo and Redo as bar buttons. B removes them and puts an Edit dropdown beside the title.
function clipBar(variant, { test = 'label' } = {}) {
  const bar = narrowBar({ test })
  if (variant === 'B') {
    const [undo, redo] = [...bar.querySelectorAll('button')].filter((b) => ['Undo', 'Redo'].includes(b.getAttribute('aria-label')))
    undo.remove(); redo.remove()
    bar.querySelector('.ge-title').after(btn(['Edit', gChev()], { class: 'ui-button cl-edit', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }))
  }
  return bar
}

function clipFrame(w, variant, label, { test = 'label', open = null } = {}) {
  const bar = clipBar(variant, { test })
  const hold = open ? s6('div', 'cl-menuhold', clipMenu('Edit menu', editItems(open.n))) : null
  const panel = s6panel(`${variant} at ${w}px: ${label}`, s6('div', `s7-w${w <= 649 ? ' s7-compact' : ''}`, { style: `width:${w}px` }, bar, hold ?? s6('div', 's6-canvas', 'The graph canvas')))
  requestAnimationFrame(() => {
    const width = (b) => b.getBoundingClientRect().width
    const title = width(bar.querySelector('.ge-title'))
    const own = variant === 'A'
      ? `Undo and Redo ${Math.round([...bar.querySelectorAll('button')].filter((b) => ['Undo', 'Redo'].includes(b.getAttribute('aria-label'))).reduce((s, b) => s + width(b), 0))} px`
      : `Edit ${Math.round(width(bar.querySelector('.cl-edit')))} px`
    panel.querySelector('figcaption').append(` (title ${Math.round(title)} px, ${own})`)
    // Clamped inside the window as a real popup is (React Aria places it).
    if (hold) {
      const want = bar.querySelector('.cl-edit').getBoundingClientRect().left - hold.getBoundingClientRect().left
      const room = hold.getBoundingClientRect().width - hold.firstChild.getBoundingClientRect().width - 16
      hold.firstChild.style.marginLeft = `${Math.max(0, Math.round(Math.min(want, room)))}px`
    }
  })
  return panel
}

const clipToast = (text) => s6panel(text, s6('span', 's6-static-toast', text))

function clipSection() {
  const menus = s6section('s8-clip-menus', 'Aurora-ge1i.2', 'Clipboard: the right-click menus',
    'Add node is untouched. The canvas menu gets Paste and Select all in a group after the view actions. The node menu gets Cut and Copy above Delete. The wire menu is unchanged. Labels are plain Cut, Copy and Delete, acting on the selection. Shortcut hints are right-aligned as in the title menu.',
    s6('div', 'cl-row',
      clipMenuPanel('Canvas menu', 'Canvas actions', canvasItems()),
      clipMenuPanel('Canvas menu, nothing to paste (clipboard has no Aurora payload)', 'Canvas actions', canvasItems({ pasteOff: true })),
      clipMenuPanel('Node menu', 'Node actions', nodeItems())),
    s6panel('Narrow check: node menu in a 360 px window',
      s6('div', 's7-w cl-narrow', { style: 'width:360px' }, s6('div', 'cl-menuhold', clipMenu('Node actions', nodeItems())))),
    s6note('Paste is not in the node menu, since a paste lands on the canvas and not on a node. A right-click on an unselected node still selects it alone first, so Cut, Copy and Delete are always about the selection. Canvas menu Paste reads the system clipboard when the menu opens and shows disabled when no marked Aurora payload is there. A denied read keeps Paste enabled and answers with the toast below.'))

  const keys = s6section('s8-clip-keys', 'Aurora-ge1i.2', 'Clipboard: platform hints',
    'Ctrl+Shift+Z and Ctrl+Y both redo on Windows and Linux. The hint shows the platform\'s own: Windows Ctrl+Y, Linux Ctrl+Shift+Z (GNOME HIG, and KDE\'s default per a feature request), macOS Cmd+Shift+Z. Ctrl+Y is not bound on macOS.',
    s6('div', 'cl-row',
      ...[['win', 'Windows'], ['linux', 'Linux'], ['mac', 'macOS']].map(([k, name]) => clipMenuPanel(`Edit menu, ${name}`, 'Edit menu', withKeys(k, () => editItems(3))))))

  const toasts = s6section('s8-clip-toasts', 'Aurora-ge1i.2', 'Clipboard: toasts',
    'The live toast, drawn in place. Paste announces to screen readers as Add node does ("Pasted 4 nodes"). The skip toast has no action button and lasts about 4 seconds.',
    s6('div', 'cl-row',
      clipToast('Pasted 4 nodes, skipped 1 (Output allows only one)'),
      clipToast('Pasted 3 nodes, skipped 2 (only one of each allowed)'),
      clipToast('Nothing pasted: Output allows only one'),
      clipToast('Couldn\'t read the clipboard. Press Ctrl+V to paste.')),
    s6note('Skipped nodes lose their wires. Dashboard controls and checks on pasted nodes come along with fresh ids. Repeat paste from the same clip steps 24 px down and right, resetting when the clipboard changes. Ctrl+V pastes at the pointer when it is over the canvas, otherwise at the canvas centre. Menu Paste uses the right-click point. On macOS the toast reads Cmd+V.'))

  const bars = s6section('s8-clip-bars', 'Aurora-ge1i.2', 'Clipboard: the top bar, Edit dropdown beside the title',
    'Decided (owner, 2026-11-16): Undo and Redo leave the bar and one Edit dropdown sits next to the title dropdown, holding Undo, Redo, Cut, Copy, Paste, Select all and Delete. The title menu stays file-only and View is unchanged. This reverses the stage 7 decision that Undo and Redo stay two buttons (Aurora-u8jx.9). Undo is one extra click. Variants A (buttons stay) and C (buttons hide at narrow widths) were considered and dropped.',
    s6('div', 'cl-stack',
      clipFrame(1000, 'B', 'wide, label shown'), clipFrame(700, 'B', 'default, label shown'),
      clipFrame(400, 'B', 'narrow, Test as icon', { test: 'icon' }), clipFrame(360, 'B', 'smallest, Test as icon', { test: 'icon' }),
      clipFrame(700, 'B', 'Edit open, three nodes selected', { open: { n: 3 } }),
      clipFrame(360, 'B', 'Edit open, nothing selected', { test: 'icon', open: { n: 0 } })),
    s6note('The caption of each frame prints the measured title width and Edit width. The mock\'s flex layout is not the editor\'s, so the editor\'s own check should repeat the widths. Edit sits beside the title, so the title squeezes first at narrow widths as before. New in the mock beyond the bead: shortcut hints on the canvas rows, the platform hints, and the toast sentences. Not drawn: touch gestures (Aurora-h5gr, 1.2.1). The older live frames (Right-click group) still show the pre-stage mock menus and are not updated.'))

  return s6('div', 'cl-board', menus, keys, toasts, bars)
}
