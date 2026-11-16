import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Button as AriaButton,
  Collection,
  Input,
  Label,
  TextField as AriaTextField,
  DropIndicator,
  Tooltip as AriaTooltip,
  TooltipTriggerStateContext,
  Tree,
  TreeItem,
  TreeItemContent,
  useDragAndDrop,
  type DropTarget,
  type TreeItemContentRenderProps,
} from 'react-aria-components'
import {
  Button,
  Dialog,
  Select,
  StatusMessage,
  Icon,
  Menu,
  MenuItem,
  MenuSeparator,
  Modal,
  SubmenuItem,
  chevronDownIcon,
  chevronRightIcon,
  circledInfoIcon,
  fullscreenArrowExitIcon,
  fullscreenArrowIcon,
  menuHorizontalIcon,
  xMarkIcon,
} from '@weblings/grille'
import { EditorPopup } from '../EditorPopup'
import { Toast, useToast } from '../Toast'
import { useMedia } from '../useMedia'

// Controls panel mock (Aurora-e4bi.1): React Aria Tree with drag and drop, on Grille. Sections are held
// as a list here for brevity. The real model stays runs of the flat controls array (Aurora-e4bi.2).

type Ctl = { id: string; node: string; nodeTitle: string; param: string; paramLabel: string; label?: string; tooltip?: string }
type Sec = { name: string; ids: string[] }
type State = { ctls: Record<string, Ctl>; secs: Sec[] }
type Scenario = 'audio' | 'long' | 'general' | 'empty'

const GENERAL = ''
const secName = (n: string) => n || 'General'
const effective = (c: Ctl) => c.label || c.paramLabel
// Node, plus the param when a label hides it, so an unlabelled card never repeats its own name.
const source = (c: Ctl) => (c.label ? `${c.nodeTitle} · ${c.paramLabel}` : c.nodeTitle)

// builtin.audio's 11 controls in preset order, with the catalog's param labels.
const AUDIO: [string, string, string, string, string][] = [
  ['beat', 'Beat bounce', 'bounceSmoothTime', 'Bounce smooth time', 'Response speed'],
  ['beat', 'Beat bounce', 'brightnessSmoothTime', 'Brightness smooth time', 'Response speed'],
  ['drift', 'Palette drift', 'driftBaseRateDegPerSec', 'Drift base rate', 'Response speed'],
  ['beat', 'Beat bounce', 'vibrancySaturation', 'Vibrancy saturation', 'Color character'],
  ['beat', 'Beat bounce', 'vibrancyValue', 'Vibrancy value', 'Color character'],
  ['drift', 'Palette drift', 'fixedAnchorHue', 'Fixed hue', 'Color character'],
  ['beat', 'Beat bounce', 'dynamismFloor', 'Dynamism floor', 'Sensitivity'],
  ['drift', 'Palette drift', 'centroidStrength', 'Centroid strength', 'Sensitivity'],
  ['beat', 'Beat bounce', 'referenceRms', 'Reference RMS', 'Sensitivity'],
  ['beat', 'Beat bounce', 'brightnessFloor', 'Brightness floor', 'Sensitivity'],
  ['drift', 'Palette drift', 'centroidRangeHz', 'Centroid range', 'Sensitivity'],
]

// Mock-only tooltip text, so the card tooltip has a Tuning tooltip to show.
const MOCK_TIPS: Record<string, string> = {
  'beat.bounceSmoothTime': 'How quickly a beat flash fades back.',
  'drift.fixedAnchorHue': 'The hue the palette drifts around.',
}
const NODE_PURPOSE: Record<string, string> = {
  beat: 'Pulses brightness and colour on each detected beat.',
  drift: 'Drifts the palette hue over time, pulled by the music.',
}

function build(scn: Scenario): State {
  const ctls: Record<string, Ctl> = {}
  const secs: Sec[] = []
  if (scn === 'empty') return { ctls, secs: [{ name: GENERAL, ids: [] }] }
  const rows = scn === 'general' ? AUDIO.slice(0, 4).map((r) => [...r.slice(0, 4), GENERAL] as typeof r) : AUDIO
  for (const [node, nodeTitle, param, paramLabel, section] of rows) {
    const id = `${node}.${param}`
    ctls[id] = { id, node, nodeTitle, param, paramLabel, tooltip: MOCK_TIPS[id] }
    // Long names are user-typed labels and sections; the catalog's longest label is 22 characters.
    const sec = scn === 'long' && section === 'Color character' ? 'Colour character for quiet and loud passages' : section
    let s = secs.find((x) => x.name === sec)
    if (!s) secs.push((s = { name: sec, ids: [] }))
    s.ids.push(id)
  }
  if (scn === 'long') {
    ctls['beat.bounceSmoothTime'].label = 'How fast the lights settle back after each beat'
    ctls['beat.vibrancySaturation'].label = 'Saturation on loud passages, before the floor'
  }
  return normalize({ ctls, secs })
}

// General always exists and is last.
function normalize(s: State): State {
  const general = s.secs.find((x) => x.name === GENERAL) ?? { name: GENERAL, ids: [] }
  return { ...s, secs: [...s.secs.filter((x) => x.name !== GENERAL), general] }
}

const without = (s: State, id: string): Sec[] => s.secs.map((x) => ({ ...x, ids: x.ids.filter((i) => i !== id) }))
const secOf = (s: State, id: string) => s.secs.find((x) => x.ids.includes(id))!

function moveCard(s: State, id: string, dir: -1 | 1): State {
  const sec = secOf(s, id)
  const i = sec.ids.indexOf(id)
  const ids = [...sec.ids]
  ;[ids[i], ids[i + dir]] = [ids[i + dir], ids[i]]
  return { ...s, secs: s.secs.map((x) => (x === sec ? { ...x, ids } : x)) }
}

function moveTo(s: State, id: string, name: string): State {
  return { ...s, secs: without(s, id).map((x) => (x.name === name ? { ...x, ids: [...x.ids, id] } : x)) }
}

function addSection(s: State, name: string, moveId?: string): State {
  const secs = moveId ? without(s, moveId) : s.secs
  return normalize({ ...s, secs: [...secs.slice(0, -1), { name, ids: moveId ? [moveId] : [] }, secs[secs.length - 1]] })
}

function renameSection(s: State, from: string, to: string): State {
  return { ...s, secs: s.secs.map((x) => (x.name === from ? { ...x, name: to } : x)) }
}

function deleteSection(s: State, name: string): State {
  const gone = s.secs.find((x) => x.name === name)!
  return {
    ...s,
    secs: s.secs.filter((x) => x !== gone).map((x) => (x.name === GENERAL ? { ...x, ids: [...x.ids, ...gone.ids] } : x)),
  }
}

function moveSection(s: State, name: string, dir: -1 | 1): State {
  const secs = [...s.secs]
  const i = secs.findIndex((x) => x.name === name)
  ;[secs[i], secs[i + dir]] = [secs[i + dir], secs[i]]
  return normalize({ ...s, secs })
}

function dropCard(s: State, id: string, targetKey: string, pos: 'before' | 'after' | 'on'): State {
  if (targetKey.startsWith('s:')) return moveTo(s, id, targetKey.slice(2))
  const target = targetKey.slice(2)
  if (target === id) return s
  const secs = without(s, id).map((x) => {
    const i = x.ids.indexOf(target)
    if (i < 0) return x
    const ids = [...x.ids]
    ids.splice(pos === 'after' ? i + 1 : i, 0, id)
    return { ...x, ids }
  })
  return { ...s, secs }
}

function dropSection(s: State, name: string, target: string, pos: 'before' | 'after' | 'on'): State {
  const moving = s.secs.find((x) => x.name === name)!
  const rest = s.secs.filter((x) => x !== moving)
  const i = rest.findIndex((x) => x.name === target)
  rest.splice(pos === 'after' ? i + 1 : i, 0, moving)
  return normalize({ ...s, secs: rest })
}

type EditMode = 'details' | 'expand'
type Acts = {
  state: State
  flat: boolean
  dock: boolean
  edit: EditMode
  patch: (id: string, p: Partial<Ctl>) => void
  newSection: (moveId: string) => void
  card: (id: string, action: string) => void
  section: (name: string, action: string) => void
}
const ActsContext = createContext<Acts | null>(null)
const useActs = () => useContext(ActsContext)!

function Grip({ label }: { label: string }) {
  return (
    <AriaButton slot="drag" className="cp-grip" aria-label={label}>
      <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true" fill="currentColor">
        {[1, 5, 9, 13].map((y) => [1.5, 6.5].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" />))}
      </svg>
    </AriaButton>
  )
}

// A borderless `...` button with its menu. Grille has no borderless button (README decision 1).
function RowMenu({
  label,
  big,
  onOpen,
  children,
}: {
  label: string
  big?: boolean
  onOpen?: (open: boolean) => void
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => onOpen?.(open), [open, onOpen])
  const ref = useRef<HTMLButtonElement>(null)
  const close = () => setOpen(false)
  return (
    <>
      <AriaButton
        ref={ref}
        className={big ? 'ui-button cp-ghost cp-ghost-big' : 'ui-button cp-ghost'}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onPress={() => setOpen((o) => !o)}
      >
        <Icon icon={menuHorizontalIcon} size="sm" />
      </AriaButton>
      <EditorPopup isOpen={open} onClose={close} label={label} triggerRef={ref} placement="bottom end">
        <Dialog aria-label={label}>{children(close)}</Dialog>
      </EditorPopup>
    </>
  )
}

function SectionRow({ sec, rp }: { sec: Sec; rp: TreeItemContentRenderProps }) {
  const a = useActs()
  const general = sec.name === GENERAL
  const named = a.state.secs.filter((x) => x.name !== GENERAL)
  const i = named.indexOf(sec)
  return (
    <div className="cp-sec">
      <div className="cp-pill">
        {general ? <span className="cp-grip-space" /> : <Grip label={`Drag the ${sec.name} section`} />}
        <span className="cp-sec-name">{secName(sec.name)}</span>
        <span className="cp-count">{sec.ids.length}</span>
        {general ? null : (
          <RowMenu label={`${sec.name} section actions`}>
            {(close) => (
              <Menu
                aria-label={`${sec.name} section actions`}
                onClose={close}
                onAction={(id) => {
                  close()
                  a.section(sec.name, id)
                }}
              >
                <MenuItem id="rename">Rename</MenuItem>
                <MenuItem id="up" isDisabled={i === 0}>
                  Move up
                </MenuItem>
                <MenuItem id="down" isDisabled={i === named.length - 1}>
                  Move down
                </MenuItem>
                <MenuSeparator />
                <MenuItem id="delete">Delete</MenuItem>
              </Menu>
            )}
          </RowMenu>
        )}
        <AriaButton slot="chevron" className="ui-button cp-ghost cp-chev" aria-label={rp.isExpanded ? 'Collapse' : 'Expand'}>
          <Icon icon={chevronDownIcon} size="sm" />
        </AriaButton>
      </div>
      {rp.isExpanded && sec.ids.length === 0 ? (
        <p className="cp-empty">{general ? 'Nothing here. New controls land here.' : 'Empty. Drag a control here, or use its Move to section.'}</p>
      ) : null}
    </div>
  )
}

const NEW_SECTION = 'New section…'

// Saves on blur or Enter, as the editor's CommitInput does. Saving per keystroke renames the card while typing,
// re-renders the row and throws the caret to the end.
function CommitField({
  label,
  value,
  placeholder,
  inputRef,
  onCommit,
}: {
  label: string
  value: string
  placeholder: string
  inputRef?: React.Ref<HTMLInputElement>
  onCommit: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    if (draft.trim() !== value) onCommit(draft.trim())
  }
  return (
    <AriaTextField className="ui-field" value={draft} onChange={setDraft} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()}>
      <Label className="ui-field-label">{label}</Label>
      <Input ref={inputRef} className="ui-text-input" placeholder={placeholder} />
    </AriaTextField>
  )
}

// Option C's fields, shared by Details and the expanding card: Label and Tooltip as text, Section as a picker.
// Keys stay inside, so the Tree's typeahead and arrow keys never take them.
function ControlFields({ c, inputRef }: { c: Ctl; inputRef?: React.Ref<HTMLInputElement> }) {
  const a = useActs()
  const sec = a.state.secs.find((x) => x.ids.includes(c.id))
  const names = a.state.secs.map((x) => secName(x.name))
  return (
    <div className="cp-fields ui-field-list" onKeyDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <CommitField label="Label" value={c.label ?? ''} placeholder={c.paramLabel} inputRef={inputRef} onCommit={(v) => a.patch(c.id, { label: v || undefined })} />
      {sec ? (
        <Select
          label="Section"
          options={[...names, NEW_SECTION]}
          value={secName(sec.name)}
          onChange={(v) => {
            if (v === NEW_SECTION) a.newSection(c.id)
            else a.card(c.id, `to:${v === 'General' ? GENERAL : v}`)
          }}
        />
      ) : null}
      <CommitField label="Tooltip" value={c.tooltip ?? ''} placeholder="None" onCommit={(v) => a.patch(c.id, { tooltip: v || undefined })} />
    </div>
  )
}

function CardRow({ c, rp }: { c: Ctl; rp: TreeItemContentRenderProps }) {
  const a = useActs()
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const sec = secOf(a.state, c.id)
  const i = sec.ids.indexOf(c.id)
  const others = a.state.secs.filter((x) => x !== sec)
  const name = effective(c)
  const [menuOpen, setMenuOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const tipOpen = (hover || rp.isFocusVisible) && !rp.isDragging && !menuOpen && !open
  const tipState = { isOpen: tipOpen, open: () => {}, close: () => setHover(false) }
  // One handler for both menu levels, guarded, since a submenu pick may reach both onActions.
  const done = useRef(false)
  return (
    <div
      ref={ref}
      className="cp-card"
      data-open={open || undefined}
      onPointerEnter={() => {
        timer.current = window.setTimeout(() => setHover(true), 500)
      }}
      onPointerLeave={() => {
        window.clearTimeout(timer.current)
        setHover(false)
      }}
    >
      <Grip label={`Drag ${name}`} />
      <span className="cp-label">{name}</span>
      <RowMenu label={`${name} actions`} onOpen={setMenuOpen}>
        {(close) => {
          done.current = false
          const pick = (id: string) => {
            if (done.current) return
            done.current = true
            close()
            a.card(c.id, id)
          }
          return (
            <Menu aria-label={`${name} actions`} onClose={close} onAction={(id) => id !== 'to' && pick(id)}>
              <MenuItem id="rename">Rename…</MenuItem>
              <MenuItem id="up" isDisabled={i === 0}>
                Move up
              </MenuItem>
              <MenuItem id="down" isDisabled={i === sec.ids.length - 1}>
                Move down
              </MenuItem>
              <SubmenuItem id="to" label="Move to section" aria-label="Move to section" onAction={pick}>
                {others.map((x) => (
                  <MenuItem key={x.name} id={`to:${x.name}`}>
                    {secName(x.name)}
                  </MenuItem>
                ))}
                {others.length > 0 ? <MenuSeparator /> : null}
                <MenuItem id="to-new">New section…</MenuItem>
              </SubmenuItem>
              <MenuSeparator />
              <MenuItem id="show">Show on node</MenuItem>
              {a.edit === 'details' ? <MenuItem id="details">Edit in Details…</MenuItem> : null}
              <MenuSeparator />
              <MenuItem id="remove">Remove</MenuItem>
            </Menu>
          )
        }}
      </RowMenu>
      {a.edit === 'expand' ? (
        <AriaButton
          className="ui-button cp-ghost cp-card-chev"
          aria-label={open ? `Hide ${name} settings` : `Show ${name} settings`}
          aria-expanded={open}
          onPress={() => setOpen((o) => !o)}
        >
          <Icon icon={chevronDownIcon} size="sm" />
        </AriaButton>
      ) : null}
      {a.edit === 'expand' && open ? <ControlFields c={c} /> : null}
      {/* RAC 1.22.1's standalone Tooltip reads only the trigger context, so it is supplied here. */}
      <TooltipTriggerStateContext.Provider value={tipState as never}>
        <AriaTooltip triggerRef={ref} isOpen={tipOpen} placement={a.dock ? 'top' : 'left'} offset={8} className="ui-tooltip">
          <div>{name}</div>
          <div className="cp-tip-sub">{source(c)}</div>
          {c.tooltip ? <div className="cp-tip-note">Tooltip: {c.tooltip}</div> : null}
        </AriaTooltip>
      </TooltipTriggerStateContext.Provider>
    </div>
  )
}

// The editor's Details drawer, reduced to its "Show on the Dashboard" list with option C's fields under each tick.
// Opened from a card, it scrolls to that param and focuses its Label.
function DetailsMock({
  node,
  param,
  top,
  side,
  onClose,
}: {
  node: string
  param: string
  top: number
  side: 'right' | 'bottom'
  onClose: () => void
}) {
  const a = useActs()
  const rows = AUDIO.filter((r) => r[0] === node)
  const label = useRef<HTMLInputElement>(null)
  const target = useRef<HTMLDivElement>(null)
  useEffect(() => {
    target.current?.scrollIntoView({ block: 'center' })
    label.current?.focus()
  }, [node, param])
  const ticked = (id: string) => a.state.secs.some((x) => x.ids.includes(id))
  return (
    <section className="ui-drawer cp-drawer" data-side={side} style={{ '--ui-drawer-top': `${top}px` } as CSSProperties} aria-labelledby="cp-details-title">
      <div className="ui-drawer-head cp-head">
        <h2 id="cp-details-title" className="ui-drawer-title">
          {rows[0]?.[1] ?? node}
        </h2>
        <Button icon aria-label="Close" onPress={onClose}>
          <Icon icon={xMarkIcon} />
        </Button>
      </div>
      <div className="ui-drawer-body cp-body drawer-details">
        <p>{NODE_PURPOSE[node]}</p>
        <h3>Show on the Dashboard</h3>
        {rows.map(([, nodeTitle, p, paramLabel]) => {
          const id = `${node}.${p}`
          const c = a.state.ctls[id] ?? { id, node, nodeTitle, param: p, paramLabel }
          const on = ticked(id)
          return (
            <div key={id} ref={p === param ? target : undefined} className="cp-details-param" data-target={p === param || undefined}>
              <label className="drawer-check">
                <input type="checkbox" checked={on} onChange={() => a.card(id, on ? 'remove' : 'tick')} />
                {paramLabel}
              </label>
              {on ? <ControlFields c={c} inputRef={p === param ? label : undefined} /> : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

type ErrLook = 'tint' | 'raised' | 'house'
type IconAlign = 'top' | 'centre'
type Msg = { tone: 'error' | 'warning' | 'notice'; text: string } | null

// One naming dialog for every surface. An error blocks the confirm. A warning names a consequence and a notice
// only informs; neither blocks.
type NameSpec = {
  title: string
  confirm: string
  initial: string
  label: string
  check: (name: string, house: boolean) => Msg
  allowEmpty?: boolean
  placeholder?: string
  max?: number
}

const TITLE_MAX = 80 // EffectPanelModel.js TITLE_MAX_CHARS: the server's limit, in characters
const LONG_EFFECT = 'Evening ambience in the living room with slow warm fades and a gentle beat pulse'
const MOCK_EFFECTS = ['Sunset', 'Warm desk lamp', 'Slow rainbow', 'Music pulse', 'Screen colors', LONG_EFFECT]
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const clip = (v: string, max?: number) => (max ? [...v].slice(0, max).join('') : v)

// "X (Copy)", then "X (Copy 2)", as save.ts distinctTitle and EffectPanelModel duplicateTitle do.
function copyTitle(title: string, taken: string[]) {
  const free = (c: string) => !taken.some((x) => same(x, c))
  if (free(`${title} (Copy)`)) return `${title} (Copy)`
  for (let n = 2; ; n++) if (free(`${title} (Copy ${n})`)) return `${title} (Copy ${n})`
}

const atLimit = (t: string): Msg =>
  [...t].length >= TITLE_MAX ? { tone: 'notice', text: `Names can be up to ${TITLE_MAX} characters.` } : null

function saveAsSpec(current: string): NameSpec {
  return {
    title: 'Name the new effect',
    confirm: 'Save',
    label: 'Effect name',
    // Seeded with a free name, so the dialog opens without a message.
    initial: copyTitle(current, MOCK_EFFECTS),
    max: TITLE_MAX,
    check: (t, house) => {
      const hit = MOCK_EFFECTS.find((e) => same(e, t))
      const to = copyTitle(t, MOCK_EFFECTS)
      if (hit && house) return { tone: 'notice', text: `Another effect is named "${hit}". This saves as "${to}".` }
      if (hit) return { tone: 'warning', text: `There is already an effect called "${hit}". This saves as "${to}".` }
      return atLimit(t)
    },
  }
}

function renameEffectSpec(current: string): NameSpec {
  return {
    title: 'Rename effect',
    confirm: 'Rename',
    label: 'Effect name',
    initial: current,
    max: TITLE_MAX,
    // Blocks, as the Dashboard's inline rename already does (EffectPanel.js titleClash).
    check: (t) => {
      const hit = MOCK_EFFECTS.find((e) => !same(e, current) && same(e, t))
      return hit ? { tone: 'error', text: `Another effect is named "${hit}".` } : atLimit(t)
    },
  }
}

function sectionSpec(mode: 'add' | 'rename', taken: string[], initial = '', moving?: string): NameSpec {
  return {
    title: mode === 'rename' ? 'Rename section' : moving ? `New section for ${moving}` : 'New section',
    confirm: mode === 'rename' ? 'Rename' : moving ? 'Create and move' : 'Create',
    label: 'Section name',
    initial,
    // Sections are runs of one string, so a duplicate would merge two. Case-blind: Tuning would show lookalikes.
    check: (t, house) => {
      if (same(t, 'General'))
        return { tone: 'error', text: house ? '"General" is the default section.' : '"General" is the default section. Choose another name.' }
      const hit = taken.find((n) => !same(n, initial) && same(n, t))
      if (!hit) return null
      return { tone: 'error', text: house ? `Another section is named "${hit}".` : `There is already a section called "${hit}".` }
    },
  }
}

// Proposed: Rename on the card menu edits the control's own label. Empty falls back to the param's name.
function controlSpec(paramLabel: string, label: string, others: string[]): NameSpec {
  return {
    title: 'Rename control',
    confirm: 'Rename',
    label: 'Control name',
    initial: label,
    allowEmpty: true,
    placeholder: paramLabel,
    check: (t, house) => {
      if (t === '') return { tone: 'notice', text: `Empty uses the param's own name, "${paramLabel}".` }
      const hit = others.find((o) => same(o, t))
      if (!hit) return null
      return house
        ? { tone: 'notice', text: `Another control is named "${hit}". Tuning shows both.` }
        : { tone: 'warning', text: `Another control is also called "${hit}". Tuning shows both.` }
    },
  }
}

function NameForm({
  spec,
  err,
  icon = 'top',
  value,
  autoFocus,
  onConfirm,
  onCancel,
}: {
  spec: NameSpec
  err: ErrLook
  icon?: IconAlign
  value?: string
  autoFocus?: boolean
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(value ?? spec.initial)
  const t = name.trim()
  const msg = spec.check(t, err === 'house')
  const blocked = (t === '' && !spec.allowEmpty) || msg?.tone === 'error'
  return (
    <form
      className={`cp-gdialog cp-err-${err} cp-icon-${icon}`}
      onSubmit={(e) => {
        e.preventDefault()
        if (!blocked) onConfirm(t)
      }}
    >
      <h3 className="cp-gdialog-title">{spec.title}</h3>
      {/* One field, so no visible label: the title names it. */}
      <AriaTextField
        aria-label={spec.label}
        value={name}
        onChange={(v) => setName(clip(v, spec.max))}
        autoFocus={autoFocus}
        isInvalid={msg?.tone === 'error'}
      >
        <Input className="ui-text-input" placeholder={spec.placeholder} />
      </AriaTextField>
      {/* Grille's StatusMessage has no notice icon, so the notice adds circledInfo itself. */}
      <StatusMessage tone={msg?.tone === 'error' ? 'error' : msg?.tone === 'warning' ? 'warning' : 'neutral'}>
        {msg?.tone === 'notice' ? (
          <>
            <Icon icon={circledInfoIcon} />
            {msg.text}
          </>
        ) : (
          msg?.text
        )}
      </StatusMessage>
      <div className="cp-gdialog-actions">
        <Button size="action" onPress={onCancel}>
          Cancel
        </Button>
        <Button size="action" variant="primary" type="submit" isDisabled={blocked}>
          {spec.confirm}
        </Button>
      </div>
    </form>
  )
}

function NameDialogMock({
  spec,
  err,
  icon,
  onConfirm,
  onCancel,
}: {
  spec: NameSpec
  err: ErrLook
  icon: IconAlign
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  return (
    <Modal isOpen onOpenChange={(open) => !open && onCancel()}>
      <Dialog aria-label={spec.title}>
        <NameForm spec={spec} err={err} icon={icon} autoFocus onConfirm={onConfirm} onCancel={onCancel} />
      </Dialog>
    </Modal>
  )
}

const LONG = 'A very long effect name that keeps going and going until it reaches the server limit'
const SECTIONS = ['Response speed', 'Color character', 'Sensitivity']
const BOARD: { group: string; caption: string; spec: NameSpec; value?: string }[] = [
  { group: 'Save as new', caption: 'Opens on a free name: no message', spec: saveAsSpec('Sunset') },
  { group: 'Save as new', caption: 'Typed a taken name: warning (notice under project rules), Save stays on', spec: saveAsSpec('Sunset'), value: 'Sunset' },
  { group: 'Save as new', caption: 'Empty: no message, Save off', spec: saveAsSpec('Sunset'), value: '' },
  { group: 'Save as new', caption: 'At 80 characters: typing stops, notice', spec: saveAsSpec('Sunset'), value: clip(LONG + LONG, TITLE_MAX) },
  { group: 'Rename effect', caption: 'Taken name: error, Rename off (as the Dashboard)', spec: renameEffectSpec('Sunset'), value: 'Slow rainbow' },
  { group: 'Long message', caption: 'Warning (notice under project rules), 80-character taken name', spec: saveAsSpec('Sunset'), value: LONG_EFFECT },
  { group: 'Long message', caption: 'Error, 80-character taken name', spec: renameEffectSpec('Sunset'), value: LONG_EFFECT },
  { group: 'Section', caption: 'Add section: no message', spec: sectionSpec('add', SECTIONS), value: 'Brightness' },
  { group: 'Section', caption: 'Taken name: error, Create off', spec: sectionSpec('add', SECTIONS), value: 'sensitivity' },
  { group: 'Section', caption: 'General: error, Create off', spec: sectionSpec('add', SECTIONS), value: 'General' },
  { group: 'Section', caption: 'From a card: creates and moves in one step', spec: sectionSpec('add', SECTIONS, '', 'Vibrancy value'), value: 'Vibrancy' },
  { group: 'Control (proposed)', caption: 'Empty: notice, Rename stays on (back to the param name)', spec: controlSpec('Vibrancy value', '', ['Fixed hue']), value: '' },
  { group: 'Control (proposed)', caption: 'Shared name: warning (notice under project rules), Rename stays on', spec: controlSpec('Vibrancy value', '', ['Fixed hue']), value: 'Fixed hue' },
]

function DialogBoard({ err, icon }: { err: ErrLook; icon: IconAlign }) {
  return (
    <div className="cp-board">
      {BOARD.map((b, i) => (
        <figure key={`${err}${icon}${i}`} className="cp-board-item">
          <figcaption>
            <b>{b.group}</b> · {b.caption}
          </figcaption>
          <div className="ui-modal">
            <NameForm spec={b.spec} err={err} icon={icon} value={b.value} onConfirm={() => {}} onCancel={() => {}} />
          </div>
        </figure>
      ))}
    </div>
  )
}

type Node = { key: string; sec?: Sec; ctl?: Ctl; children?: Node[] }
type DialogState = { mode: 'add' | 'rename'; name?: string; moveId?: string }

const STRIP = 48

export function ControlsPanelMock() {
  const params = new URLSearchParams(location.search)
  const [scn, setScn] = useState<Scenario>((params.get('data') as Scenario) || 'audio')
  const [head, setHead] = useState(params.get('head') === 'chevron' ? 'chevron' : 'x')
  const [view, setView] = useState(params.get('view') === 'board' ? 'board' : 'panel')
  const [err, setErr] = useState<ErrLook>(params.get('err') === 'raised' ? 'raised' : params.get('err') === 'house' ? 'house' : 'tint')
  const [icon, setIcon] = useState<IconAlign>(params.get('icon') === 'centre' ? 'centre' : 'top')
  const [edit, setEdit] = useState<EditMode>(params.get('edit') === 'expand' ? 'expand' : 'details')
  const [details, setDetails] = useState<{ node: string; param: string } | null>(null)
  const [ctlDialog, setCtlDialog] = useState<string | null>(null)
  const [st, setSt] = useState(() => build(scn))
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(true)
  const [full, setFull] = useState(false)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [note, setNote] = useState('Double-click or Enter on a card stands for selecting its node on the canvas. A single click does nothing.')
  const [measure, setMeasure] = useState('')
  // Aurora-daaa.37: docks only below 650 px (was also portrait windows).
  const dock = useMedia('(max-width: 649px)')
  const toast = useToast()
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = new URLSearchParams({ data: scn, head, view, err, icon, edit })
    history.replaceState(null, '', `?${q}`)
  }, [scn, head, view, err, icon, edit])

  const reset = (next: Scenario) => {
    setScn(next)
    setSt(build(next))
    setCollapsed(new Set())
  }

  const named = st.secs.filter((x) => x.name !== GENERAL)
  const flat = named.length === 0
  const flatRef = useRef(flat)
  flatRef.current = flat
  const count = st.secs.reduce((n, x) => n + x.ids.length, 0)

  // Section drags collapse every section for the drag, so only the gaps between headings are targets.
  const dragging = useRef<string | null>(null)
  const savedCollapse = useRef<Set<string> | null>(null)
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((k) => ({ 'text/plain': String(k) })),
    onDragStart: (e) => {
      const k = String([...e.keys][0])
      dragging.current = k
      if (k.startsWith('s:')) {
        setCollapsed((c) => {
          savedCollapse.current = c
          return new Set(st.secs.map((x) => x.name))
        })
      }
    },
    onDragEnd: () => {
      dragging.current = null
      if (savedCollapse.current) setCollapsed(savedCollapse.current)
      savedCollapse.current = null
    },
    getDropOperation: (target: DropTarget) => {
      const k = dragging.current
      if (target.type === 'root' || !k) return 'cancel'
      const t = String(target.key)
      if (k.startsWith('s:')) {
        // Headings only reorder among headings, never onto one, never below General, and General never moves.
        if (k === 's:' || !t.startsWith('s:') || t === k || target.dropPosition === 'on') return 'cancel'
        if (t === 's:' && target.dropPosition === 'after') return 'cancel'
        return 'move'
      }
      if (t.startsWith('s:')) return target.dropPosition === 'on' ? 'move' : 'cancel'
      return target.dropPosition === 'on' || t === k ? 'cancel' : 'move'
    },
    onMove: (e) => {
      const k = String([...e.keys][0])
      const t = String(e.target.key)
      const pos = e.target.dropPosition
      if (k.startsWith('s:')) setSt((s) => dropSection(s, k.slice(2), t.slice(2), pos))
      else setSt((s) => dropCard(s, k.slice(2), t, pos))
    },
    renderDropIndicator: (target) => (
      // A line between cards starts at the card inset, so it never reads as "after the heading".
      <DropIndicator
        target={target}
        className={target.type === 'item' && String(target.key).startsWith('c:') && !flatRef.current ? 'cp-drop cp-drop-card' : 'cp-drop'}
      />
    ),
  })

  const acts: Acts = {
    state: st,
    flat,
    dock,
    edit,
    patch: (id, p) => setSt((s) => ({ ...s, ctls: { ...s.ctls, [id]: { ...s.ctls[id], ...p } } })),
    newSection: (moveId) => setDialog({ mode: 'add', moveId }),
    card: (id, action) => {
      const c = st.ctls[id]
      if (action === 'up') setSt((s) => moveCard(s, id, -1))
      else if (action === 'down') setSt((s) => moveCard(s, id, 1))
      else if (action.startsWith('to:')) setSt((s) => moveTo(s, id, action.slice(3)))
      else if (action === 'to-new') setDialog({ mode: 'add', moveId: id })
      else if (action === 'show') setNote(`Show on node: selects ${c.nodeTitle} and fits the view.`)
      else if (action === 'rename') setCtlDialog(id)
      else if (action === 'details') {
        setOpen(false)
        setDetails({ node: c.node, param: c.param })
      } else if (action === 'tick') {
        // A param never ticked before gets its control here, as addControl does: appended to General.
        const row = AUDIO.find((r) => `${r[0]}.${r[2]}` === id)!
        setSt((s) => ({
          ctls: s.ctls[id] ? s.ctls : { ...s.ctls, [id]: { id, node: row[0], nodeTitle: row[1], param: row[2], paramLabel: row[3] } },
          secs: s.secs.map((x) => (x.name === GENERAL ? { ...x, ids: [...x.ids, id] } : x)),
        }))
      }
      else if (action === 'remove') {
        const before = st
        setSt((s) => ({ ...s, secs: without(s, id) }))
        toast.show(`Removed ${effective(c)} from the Dashboard.`, { run: () => setSt(before), doc: null })
      }
    },
    section: (name, action) => {
      if (action === 'rename') setDialog({ mode: 'rename', name })
      else if (action === 'up') setSt((s) => moveSection(s, name, -1))
      else if (action === 'down') setSt((s) => moveSection(s, name, 1))
      else if (action === 'delete') {
        const before = st
        const n = st.secs.find((x) => x.name === name)!.ids.length
        setSt((s) => deleteSection(s, name))
        toast.show(
          n ? `Deleted ${name}. ${n} ${n === 1 ? 'control' : 'controls'} moved to General.` : `Deleted ${name}.`,
          { run: () => setSt(before), doc: null },
        )
      }
    },
  }

  const cardNode = (id: string): Node => ({ key: `c:${id}`, ctl: st.ctls[id] })
  const items: Node[] = flat
    ? st.secs[0].ids.map(cardNode)
    : st.secs.map((sec) => ({ key: `s:${sec.name}`, sec, children: sec.ids.map(cardNode) }))
  const expandedKeys = new Set(st.secs.filter((x) => !collapsed.has(x.name)).map((x) => `s:${x.name}`))

  const side = dock ? 'bottom' : 'right'
  const drawerState = !open && !details ? 'closed' : dock ? (full ? 'full' : 'bottom') : 'right'

  // Measured, not assumed (lessons/planning.md "Draw windows at true height").
  useLayoutEffect(() => {
    const read = () => {
      const drawer = document.querySelector('.cp-drawer')?.getBoundingClientRect()
      const label = document.querySelector('.cp-label')?.getBoundingClientRect()
      const name = document.querySelector('.cp-sec-name')?.parentElement?.getBoundingClientRect()
      setMeasure(
        drawer
          ? `window ${innerWidth}x${innerHeight} · drawer ${Math.round(drawer.width)}x${Math.round(drawer.height)}` +
              (label ? ` · card label room ${Math.round(label.width)} px` : '') +
              (name ? ` · heading ${Math.round(name.width)} px` : '')
          : `window ${innerWidth}x${innerHeight} · drawer closed`,
      )
    }
    read()
    addEventListener('resize', read)
    return () => removeEventListener('resize', read)
  })

  const frame = (c: Ctl) => setNote(`Double-click / Enter: selects ${c.nodeTitle} on the canvas and fits the view.`)

  const popup = (w: number, h: number) => {
    window.open(`${location.pathname}${location.search}`, `cp${w}x${h}`, `width=${w},height=${h}`)
  }

  const renderItem = (n: Node): ReactNode => (
    <TreeItem
      key={n.key}
      id={n.key}
      textValue={n.sec ? secName(n.sec.name) : `${effective(n.ctl!)}, ${source(n.ctl!).replace(' · ', ', ')}`}
      hasChildItems={n.sec ? true : undefined}
      className={n.sec ? 'cp-item cp-item-sec' : 'cp-item cp-item-card'}
      // A section row toggles on click or Enter. A card has no single-click action: double-click or Enter frames its node.
      onAction={
        n.sec
          ? () => {
              const name = n.sec!.name
              setCollapsed((c) => {
                const next = new Set(c)
                if (next.has(name)) next.delete(name)
                else next.add(name)
                return next
              })
            }
          : undefined
      }
      onDoubleClick={n.ctl ? () => frame(n.ctl!) : undefined}

    >
      <TreeItemContent>{(rp) => (n.sec ? <SectionRow sec={n.sec} rp={rp} /> : <CardRow c={n.ctl!} rp={rp} />)}</TreeItemContent>
      {n.children ? <Collection items={n.children}>{renderItem}</Collection> : null}
    </TreeItem>
  )

  return (
    <ActsContext.Provider value={acts}>
      <div className="cp-root" data-drawer={drawerState}>
        <div className="cp-strip">
          <b>Controls panel mock</b>
          <label>
            Data{' '}
            <select value={scn} onChange={(e) => reset(e.target.value as Scenario)}>
              <option value="audio">Audio preset (11)</option>
              <option value="long">Long names</option>
              <option value="general">General only (4)</option>
              <option value="empty">Empty</option>
            </select>
          </label>
          <label>
            Head{' '}
            <select value={head} onChange={(e) => setHead(e.target.value)}>
              <option value="x">x with divider</option>
              <option value="chevron">Chevron close</option>
            </select>
          </label>
          <label>
            View{' '}
            <select value={view} onChange={(e) => setView(e.target.value)}>
              <option value="panel">Panel</option>
              <option value="board">Dialog states</option>
            </select>
          </label>
          <label>
            Error{' '}
            <select value={err} onChange={(e) => setErr(e.target.value as ErrLook)}>
              <option value="tint">Tinted card</option>
              <option value="raised">Raised card</option>
              <option value="house">Project rules</option>
            </select>
          </label>
          <label>
            Icon{' '}
            <select value={icon} onChange={(e) => setIcon(e.target.value as IconAlign)}>
              <option value="top">First line (Grille)</option>
              <option value="centre">Centred</option>
            </select>
          </label>
          <label>
            Card editing{' '}
            <select value={edit} onChange={(e) => setEdit(e.target.value as EditMode)}>
              <option value="details">Edit in Details (B)</option>
              <option value="expand">Expanding card</option>
            </select>
          </label>
          <button type="button" onClick={() => reset(scn)}>
            Reset
          </button>
          <span>Popups:</span>
          {[
            [1100, 800],
            [700, 800],
            [400, 800],
            [360, 800],
            [900, 1400],
          ].map(([w, h]) => (
            <a key={w} href="#" onClick={(e) => (e.preventDefault(), popup(w, h))}>
              {w}x{h}
            </a>
          ))}
        </div>
        <div className="cp-canvas">
          <div className="cp-note">
            <div>{note}</div>
            <div className="cp-measure">{measure}</div>
          </div>
          <button type="button" className="ui-button cp-corner" onClick={() => {
              setDetails(null)
              setOpen((o) => !o)
            }}
            aria-expanded={open}
          >
            Dashboard controls <span className="cp-corner-count">{count}</span>
          </button>
        </div>
        {open ? (
          <section
            className="ui-drawer cp-drawer"
            data-side={side}
            data-expanded={dock && full ? '' : undefined}
            style={{ '--ui-drawer-top': `${STRIP}px` } as CSSProperties}
            aria-labelledby="cp-title"
          >
            <div className="ui-drawer-head cp-head">
              <h2 id="cp-title" className="ui-drawer-title">
                Dashboard controls{count ? <span className="cp-title-count">{count}</span> : null}
              </h2>
              <div className="cp-head-actions">
                <RowMenu label="Dashboard controls actions" big>
                  {(close) => (
                    <Menu
                      aria-label="Dashboard controls actions"
                      onClose={close}
                      onAction={(id) => {
                        close()
                        if (id === 'add') setDialog({ mode: 'add' })
                        else if (id === 'collapse') setCollapsed(new Set(st.secs.map((x) => x.name)))
                        else if (id === 'expand') setCollapsed(new Set())
                      }}
                    >
                      <MenuItem id="add">Add section…</MenuItem>
                      <MenuSeparator />
                      <MenuItem id="collapse" isDisabled={flat}>
                        Collapse all
                      </MenuItem>
                      <MenuItem id="expand" isDisabled={flat}>
                        Expand all
                      </MenuItem>
                    </Menu>
                  )}
                </RowMenu>
                {head === 'x' ? <span className="cp-head-rule" aria-hidden="true" /> : null}
                {dock ? (
                  <Button icon aria-label={full ? 'Half height' : 'Full height'} onPress={() => setFull((f) => !f)}>
                    <Icon icon={full ? fullscreenArrowExitIcon : fullscreenArrowIcon} />
                  </Button>
                ) : null}
                <Button icon aria-label="Close" onPress={() => setOpen(false)}>
                  <Icon icon={head === 'x' ? xMarkIcon : dock ? chevronDownIcon : chevronRightIcon} />
                </Button>
              </div>
            </div>
            <div
              ref={body}
              className="ui-drawer-body cp-body"
              // React Aria's row keys run in the capture phase, so a field inside an expanded card would lose its
              // arrows, Home and Space to the Tree. Stopping them here, above the Tree, leaves them to the field.
              onKeyDownCapture={(e) => {
                if ((e.target as HTMLElement).closest('.cp-card .cp-fields') && !['Tab', 'Escape', 'Enter'].includes(e.key)) e.stopPropagation()
              }}
              // Tree and TreeItem take no onKeyDown, so Enter on a focused card row is caught here.
              onKeyDown={(e) => {
                const row = e.target as HTMLElement
                const key = row.getAttribute('role') === 'row' ? row.dataset.key : undefined
                if (e.key === 'Enter' && key?.startsWith('c:')) frame(st.ctls[key.slice(2)])
              }}
            >
              {count === 0 && flat ? (
                <p className="cp-hint">None yet. Tick Show on the Dashboard in a node's Details.</p>
              ) : (
                <Tree
                  aria-label="Dashboard controls"
                  className="cp-tree"
                  data-flat={flat ? '' : undefined}
                  items={items}
                  expandedKeys={expandedKeys}
                  onExpandedChange={(keys) =>
                    setCollapsed(new Set(st.secs.filter((x) => !keys.has(`s:${x.name}`)).map((x) => x.name)))
                  }
                  dragAndDropHooks={dragAndDropHooks}
                >
                  {renderItem}
                </Tree>
              )}
            </div>
          </section>
        ) : null}
        {dialog ? (
          <NameDialogMock
            err={err}
            icon={icon}
            spec={sectionSpec(
              dialog.mode,
              named.map((x) => x.name),
              dialog.name ?? '',
              dialog.moveId ? effective(st.ctls[dialog.moveId]) : undefined,
            )}
            onCancel={() => setDialog(null)}
            onConfirm={(name) => {
              if (dialog.mode === 'add') setSt((s) => addSection(s, name, dialog.moveId))
              else {
                setSt((s) => renameSection(s, dialog.name!, name))
                setCollapsed((c) => (c.has(dialog.name!) ? new Set([...c, name]) : c))
              }
              setDialog(null)
            }}
          />
        ) : null}
        {details ? <DetailsMock node={details.node} param={details.param} top={STRIP} side={side} onClose={() => setDetails(null)} /> : null}
        {ctlDialog ? (
          <NameDialogMock
            err={err}
            icon={icon}
            spec={controlSpec(
              st.ctls[ctlDialog].paramLabel,
              st.ctls[ctlDialog].label ?? '',
              Object.values(st.ctls)
                .filter((x) => x.id !== ctlDialog)
                .map(effective),
            )}
            onCancel={() => setCtlDialog(null)}
            onConfirm={(name) => {
              acts.patch(ctlDialog, { label: name || undefined })
              setCtlDialog(null)
            }}
          />
        ) : null}
        {view === 'board' ? <DialogBoard err={err} icon={icon} /> : null}
        <Toast
          text={toast.text}
          undo={toast.undo}
          onHold={toast.hold}
          onUndo={() => {
            toast.undo?.run()
            toast.dismiss()
          }}
        />
      </div>
    </ActsContext.Provider>
  )
}
