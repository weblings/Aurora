import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Button as AriaButton,
  Collection,
  Input,
  Label,
  TextArea,
  TextField as AriaTextField,
  DropIndicator,
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
  DialogActions,
  StatusMessage,
  Icon,
  Menu,
  MenuItem,
  MenuSection,
  MenuSeparator,
  Modal,
  SubmenuItem,
  Tooltip,
  chevronDownIcon,
  chevronRightIcon,
  chevronUpIcon,
  circledInfoIcon,
  dotIcon,
  fullscreenArrowExitIcon,
  fullscreenArrowIcon,
  menuHorizontalIcon,
  xMarkIcon,
} from '@weblings_things/grille'
import { EditorPopup } from '../EditorPopup'
import { Hint } from '../Hint'
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
// Node tab data (Aurora-e4bi.8): titles, summaries, ports and params from core AudioNodes.cpp. Wiring as builtin.audio.
type Port = { dir: 'in' | 'out'; name: string; type: string; desc: string; peer?: string }
type NodeInfo = { title: string; purpose: string; ports: Port[]; params: [string, string][] }
const NODES: Record<string, NodeInfo> = {
  feat: {
    title: 'Audio features',
    purpose: 'Measures beats, loudness and brightness of the sound.',
    ports: [
      { dir: 'in', name: 'buffer', type: 'AudioBuffer', desc: 'The audio buffer to analyze.', peer: 'Audio capture · buffer' },
      { dir: 'out', name: 'features', type: 'AudioFeatures', desc: 'All extracted features as one struct, for audio.drift and audio.bounce.', peer: 'Palette drift · features, Beat bounce · features' },
      { dir: 'out', name: 'rms', type: 'Float', desc: 'Overall loudness (RMS) 0..1.' },
      { dir: 'out', name: 'onset', type: 'Trigger', desc: 'True for one tick on each detected beat or onset.' },
      { dir: 'out', name: 'onsetStrength', type: 'Float', desc: 'How strong the last onset was; only meaningful when onset fires.' },
      { dir: 'out', name: 'centroid', type: 'Float', desc: 'Spectral centroid in Hz, the brightness of the sound.' },
    ],
    params: [],
  },
  drift: {
    title: 'Palette drift',
    purpose: 'A color that slowly wanders over time.',
    ports: [
      { dir: 'in', name: 'features', type: 'AudioFeatures', desc: 'Audio features that speed the drift up on beats.', peer: 'Audio features · features' },
      { dir: 'out', name: 'anchor', type: 'Angle', desc: 'The live anchor hue.', peer: 'Beat bounce · anchor' },
    ],
    params: [],
  },
  beat: {
    title: 'Beat bounce',
    purpose: "Beat-driven color that jumps around a base color.",
    ports: [
      { dir: 'in', name: 'features', type: 'AudioFeatures', desc: 'Audio features whose onsets trigger the bounce.', peer: 'Audio features · features' },
      { dir: 'in', name: 'anchor', type: 'Angle', desc: 'The anchor hue the bounce moves around.', peer: 'Palette drift · anchor' },
      { dir: 'out', name: 'color', type: 'Color', desc: 'The bouncing color.', peer: 'Lights · color' },
    ],
    params: [],
  },
}
// Params in catalog order, labels from AUDIO.
NODES.drift.params = [['fixedAnchorHue', 'Fixed hue'], ['driftBaseRateDegPerSec', 'Drift base rate'], ['centroidStrength', 'Centroid strength'], ['centroidRangeHz', 'Centroid range']]
NODES.beat.params = [
  ['bounceSmoothTime', 'Bounce smooth time'],
  ['dynamismFloor', 'Dynamism floor'],
  ['vibrancySaturation', 'Vibrancy saturation'],
  ['vibrancyValue', 'Vibrancy value'],
  ['referenceRms', 'Reference RMS'],
  ['brightnessFloor', 'Brightness floor'],
  ['brightnessSmoothTime', 'Brightness smooth time'],
]

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

// The six e4bi.8 decision switches. Each is one URL param on the second strip row.
type TabsLook = 'head' | 'row' | 'body' | 'trad' | 'flush' | 'fill'
type TipField = 'area' | 'line' | 'grow'
type SwitchLook = 'toggle' | 'check'
type TouchPath = 'tips' | 'info' | 'line'
type AddedCue = 'none' | 'toast' | 'badge'
// e4bi.8 critique 3: a mark after the param label on the node when the param is in Tuning.
type MarkLook = 'none' | 'text' | 'muted' | 'dim'
type WinMenu = 'none' | 'menu' | 'view'
// Aurora-e4bi.14: a right-click or Shift+F10 on a param row opens a param menu.
type HitArea = 'nofield' | 'row' | 'label'
type ParamForm = 'param' | 'merged'
type ParamItem = 'flip' | 'check'
type ParamRef = { id: string; label: string }

// Windows raises the native contextmenu event when Shift+F10 or the Menu key is released, after the popup has taken
// focus, so it lands outside our handlers and the browser menu opens on top. Swallow it until the key is up.
function swallowKeyContextMenu() {
  const stop = (e: Event) => e.preventDefault()
  const done = () => document.removeEventListener('contextmenu', stop, true)
  document.addEventListener('contextmenu', stop, true)
  document.addEventListener('keyup', () => window.setTimeout(done, 150), { capture: true, once: true })
  window.setTimeout(done, 3000)
}

// Which menu a right-click or Shift+F10 on this element opens, per hit-area variant.
function hitOf(t: Element, hit: HitArea): 'param' | 'node' | 'native' {
  if (!t.closest('.param')) return 'node'
  if (hit === 'row') return 'param'
  if (hit === 'label') return t.closest('.cp-param-line') ? 'param' : 'node'
  return t.matches('input[type="number"], input[type="text"]') ? 'native' : 'param'
}

type Acts = {
  state: State
  flat: boolean
  dock: boolean
  flash: string | null
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
        className="ui-button"
        data-variant="ghost"
        data-icon
        data-size={big ? undefined : 'sm'}
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
        <AriaButton slot="chevron" className="ui-button cp-chev" data-variant="ghost" data-icon data-size="sm" aria-label={rp.isExpanded ? 'Collapse' : 'Expand'}>
          <Icon icon={chevronDownIcon} size="sm" />
        </AriaButton>
      </div>
      {rp.isExpanded && sec.ids.length === 0 ? (
        <p className="cp-empty">{general ? 'Nothing here. New controls land here.' : 'Empty. Drag a control here, or use its Move to section.'}</p>
      ) : null}
    </div>
  )
}

function CardRow({ c, rp }: { c: Ctl; rp: TreeItemContentRenderProps }) {
  const a = useActs()
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  // The Tree can render a card for a frame after a remove from outside it (the picker), so it may have no section.
  const sec = secOf(a.state, c.id) ?? { name: GENERAL, ids: [] }
  const i = sec.ids.indexOf(c.id)
  const others = a.state.secs.filter((x) => x !== sec)
  const name = effective(c)
  const [menuOpen, setMenuOpen] = useState(false)
  const tipOpen = (hover || rp.isFocusVisible) && !rp.isDragging && !menuOpen
  // One handler for both menu levels, guarded, since a submenu pick may reach both onActions.
  const done = useRef(false)
  return (
    <div
      ref={ref}
      className="cp-card"
      data-flash={a.flash === c.id || undefined}
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
              <MenuItem id="edit">Edit…</MenuItem>
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
              <MenuSeparator />
              <MenuItem id="remove">Remove</MenuItem>
            </Menu>
          )
        }}
      </RowMenu>
      <Tooltip triggerRef={ref} isOpen={tipOpen} placement={a.dock ? 'top' : 'left'}>
        <div>{name}</div>
        <div className="cp-tip-sub">{source(c)}</div>
        {c.tooltip ? <div className="cp-tip-note">Tooltip: {c.tooltip}</div> : null}
      </Tooltip>
    </div>
  )
}

// Hover after 500 ms, or keyboard focus inside the row, as the card's tooltip does.
function useRowTip() {
  const [hover, setHover] = useState(false)
  const [focus, setFocus] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return {
    open: hover || focus,
    close: () => (setHover(false), setFocus(false)),
    bind: {
      onPointerEnter: () => {
        timer.current = window.setTimeout(() => setHover(true), 500)
      },
      onPointerLeave: () => {
        window.clearTimeout(timer.current)
        setHover(false)
      },
      onFocus: (e: React.FocusEvent) => setFocus((e.target as HTMLElement).matches(':focus-visible')),
      onBlur: () => setFocus(false),
    },
  }
}

function RowTooltip({ anchor, open, close, children }: { anchor: React.RefObject<HTMLElement | null>; open: boolean; close: () => void; children: ReactNode }) {
  const a = useActs()
  return (
    <Tooltip triggerRef={anchor} isOpen={open} onOpenChange={(o) => !o && close()} placement={a.dock ? 'top' : 'left'}>
      {children}
    </Tooltip>
  )
}

function InfoToggle({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <AriaButton className="ui-button" data-variant="ghost" data-icon data-size="sm" aria-label={`About ${label}`} aria-expanded={open} onPress={onToggle}>
      <Icon icon={circledInfoIcon} size="sm" />
    </AriaButton>
  )
}

function PortRow({ p, touch }: { p: Port; touch: TouchPath }) {
  const ref = useRef<HTMLDivElement>(null)
  const tip = useRowTip()
  const [info, setInfo] = useState(false)
  const peer = p.peer ? `${p.dir === 'in' ? 'From' : 'To'} ${p.peer}` : 'Not wired'
  const sub = touch === 'line' || (touch === 'info' && info)
  return (
    <div className="cp-port-wrap">
      <div ref={ref} className="cp-port" tabIndex={touch === 'info' ? undefined : 0} {...(touch === 'line' ? {} : tip.bind)}>
        <span className="cp-port-dir">{p.dir === 'in' ? 'In' : 'Out'}</span>
        <span className="cp-port-name">{p.name}</span>
        <span className="cp-port-type">{p.type}</span>
        {touch === 'info' ? <InfoToggle label={p.name} open={info} onToggle={() => setInfo((o) => !o)} /> : null}
      </div>
      {sub ? (
        <div className="cp-row-sub">
          {p.desc} {peer}.
        </div>
      ) : null}
      {touch === 'line' ? null : (
        <RowTooltip anchor={ref} open={tip.open} close={tip.close}>
          <div>{p.desc}</div>
          <div className="cp-tip-sub">{peer}</div>
        </RowTooltip>
      )}
    </div>
  )
}

function ParamRow({
  node,
  param,
  paramLabel,
  sw,
  touch,
  inputRef,
  onEdit,
}: {
  node: string
  param: string
  paramLabel: string
  sw: SwitchLook
  touch: TouchPath
  inputRef?: React.Ref<HTMLInputElement>
  onEdit: (id: string) => void
}) {
  const a = useActs()
  const id = `${node}.${param}`
  const sec = a.state.secs.find((x) => x.ids.includes(id))
  const c = a.state.ctls[id]
  const on = !!sec
  const ref = useRef<HTMLDivElement>(null)
  const tip = useRowTip()
  const [info, setInfo] = useState(false)
  const where = on ? `In Tuning as "${effective(c)}", ${secName(sec.name)}.` : ''
  const sub = on && (touch === 'line' || (touch === 'info' && info))
  const input = (
    <input
      ref={inputRef}
      type="checkbox"
      className={sw === 'check' ? 'cp-check' : undefined}
      checked={on}
      aria-label={`Add ${paramLabel} to Tuning`}
      onChange={() => a.card(id, on ? 'remove' : 'tick')}
    />
  )
  return (
    <div className="cp-prow-wrap">
      <div ref={ref} className="cp-card cp-prow" onDoubleClick={on ? () => onEdit(id) : undefined} {...(on && touch !== 'line' ? tip.bind : {})}>
        <span className="cp-label">{paramLabel}</span>
        {touch === 'info' && on ? <InfoToggle label={paramLabel} open={info} onToggle={() => setInfo((o) => !o)} /> : null}
        {sw === 'toggle' ? (
          <label className="toggle-switch">
            {input}
            <span className="toggle-knob" />
          </label>
        ) : (
          input
        )}
      </div>
      {sub ? <div className="cp-row-sub">{where}</div> : null}
      {on && touch !== 'line' ? (
        <RowTooltip anchor={ref} open={tip.open} close={tip.close}>
          <div>{where}</div>
          <div className="cp-tip-sub">Double-click to edit.</div>
        </RowTooltip>
      ) : null}
    </div>
  )
}

// Node tab (replaces Details): follows the canvas selection. Plain port rows are reference, outlined param rows
// carry one action, the Tuning switch.
function NodeTab({
  node,
  sw,
  col,
  touch,
  focusNonce,
  onFocused,
  onEdit,
}: {
  node: string | null
  sw: SwitchLook
  col: boolean
  touch: TouchPath
  focusNonce: number
  onFocused: () => void
  onEdit: (id: string) => void
}) {
  const first = useRef<HTMLInputElement>(null)
  // Show on the Dashboard focuses the first switch once, after the tab panel mounts.
  useEffect(() => {
    if (!focusNonce) return
    const t = window.setTimeout(() => (first.current?.focus(), onFocused()), 0)
    return () => window.clearTimeout(t)
  }, [focusNonce, onFocused])
  if (!node) return <p className="cp-hint">Select a node on the canvas to see its ports and params.</p>
  const n = NODES[node]
  return (
    <div className="cp-node">
      <h3 className="cp-node-title">{n.title}</h3>
      <p className="cp-node-purpose">{n.purpose}</p>
      <h4 className="cp-node-h">Ports</h4>
      {n.ports.map((p) => (
        <PortRow key={`${p.dir}${p.name}`} p={p} touch={touch} />
      ))}
      <h4 className="cp-node-h">
        Params{col && n.params.length ? <span className="cp-node-col">Tuning</span> : null}
      </h4>
      {n.params.length === 0 ? <p className="cp-hint">No params.</p> : null}
      {n.params.map(([p, label], i) => (
        <ParamRow key={p} node={node} param={p} paramLabel={label} sw={sw} touch={touch} inputRef={i === 0 ? first : undefined} onEdit={onEdit} />
      ))}
    </div>
  )
}

// --- Panel model b, Tuning only (e4bi.8, 2026-11-17) ---------------------------------------------------------

// Hover and keyboard focus keep the shipped Hint; a touch tap toggles the same text in a popover, since React
// Aria's tooltip closes on pointer down and never opens from a tap. The tap still bubbles, so it selects the node.
function TapHint({ text, label, children }: { text: string; label: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  const ptr = useRef('')
  const [open, setOpen] = useState(false)
  return (
    <>
      <span
        ref={ref}
        className="cp-taphint"
        data-open={open || undefined}
        onPointerDown={(e) => (ptr.current = e.pointerType)}
        onClick={() => ptr.current === 'touch' && setOpen((o) => !o)}
      >
        <Hint text={text}>{children}</Hint>
      </span>
      <EditorPopup isOpen={open} onClose={() => setOpen(false)} label={label} triggerRef={ref} placement="top">
        <div className="cp-taphint-pop">{text}</div>
      </EditorPopup>
    </>
  )
}

// Mock-only param descriptions; the real ones come from /api/nodes.
const paramDesc = (label: string) => `${label}: the catalog's description of this param (mock text).`

// A stand-in for GenericNode.tsx on its own classes: title Hint, the faded ... (aurora-node-more), ports, params.
function StandInNode({
  k,
  n,
  selected,
  ping,
  mark,
  hitArea,
  tuningOf,
  onSelect,
  onMenu,
  onParamMenu,
}: {
  k: string
  n: NodeInfo
  selected: boolean
  ping: { id: string; n: number } | null
  mark: MarkLook
  hitArea: HitArea
  tuningOf: (id: string) => string | null
  onSelect: () => void
  onMenu: (point: { x: number; y: number }, touch: boolean) => void
  onParamMenu: (p: ParamRef, point: { x: number; y: number }) => void
}) {
  const ptr = useRef('')
  const ins = n.ports.filter((p) => p.dir === 'in')
  const outs = n.ports.filter((p) => p.dir === 'out')
  return (
    <div
      className="aurora-node cp-snode"
      data-node={k}
      data-selected={selected || undefined}
      // React Flow nodes take focus, so Shift+F10 has a node to start from.
      tabIndex={0}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault()
        onSelect()
        onMenu({ x: e.clientX, y: e.clientY }, false)
      }}
      onKeyDown={(e) => {
        if (!((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu')) return
        const t = e.target as HTMLElement
        const h = hitOf(t, hitArea)
        if (h === 'native') return
        e.preventDefault()
        swallowKeyContextMenu()
        onSelect()
        const row = t.closest<HTMLElement>('.param')
        // Keyboard menus anchor under the row's label line, not at the node's top left.
        if (h === 'param' && row) {
          const b = row.querySelector('.cp-param-line')!.getBoundingClientRect()
          onParamMenu({ id: row.dataset.param!, label: row.dataset.label! }, { x: b.left, y: b.bottom })
        } else {
          const b = e.currentTarget.getBoundingClientRect()
          onMenu({ x: b.left, y: b.top + 24 }, false)
        }
      }}
    >
      <div className="aurora-node-header">
        <Hint text={n.purpose}>
          <strong>{n.title}</strong>
        </Hint>
        <button
          type="button"
          className="aurora-node-more"
          aria-label={`Actions for ${n.title}`}
          aria-haspopup="menu"
          onPointerDown={(e) => (ptr.current = e.pointerType)}
          onClick={(e) => {
            e.stopPropagation()
            onSelect()
            const box = e.currentTarget.getBoundingClientRect()
            // A keyboard press has no pointer (detail 0), as EffectPanel.js checks.
            onMenu({ x: box.left, y: box.bottom }, ptr.current === 'touch' && e.detail !== 0)
            ptr.current = ''
          }}
        >
          <Icon icon={menuHorizontalIcon} size="sm" />
        </button>
      </div>
      <div className="aurora-ports">
        <div className="aurora-ports-in">
          {ins.map((p) => (
            <div className="aurora-port" key={p.name}>
              <span className="cp-handle" aria-hidden="true" />
              <TapHint text={p.desc} label={`About ${p.name}`}>
                <span className="aurora-port-name">{p.name}</span>
              </TapHint>
              <small>{p.type}</small>
            </div>
          ))}
        </div>
        <div className="aurora-ports-out">
          {outs.map((p) => (
            <div className="aurora-port aurora-port-out" key={p.name}>
              <small>{p.type}</small>
              <TapHint text={p.desc} label={`About ${p.name}`}>
                <span className="aurora-port-name">{p.name}</span>
              </TapHint>
              <span className="cp-handle" aria-hidden="true" />
            </div>
          ))}
        </div>
      </div>
      {n.params.map(([p, label]) => {
        const hit = ping?.id === `${k}.${p}`
        const where = mark === 'none' ? null : tuningOf(`${k}.${p}`)
        return (
          <div
            key={hit ? `${p}-${ping!.n}` : p}
            className="param"
            data-param={`${k}.${p}`}
            data-label={label}
            data-ping={hit || undefined}
            onContextMenu={(e) => {
              const h = hitOf(e.target as Element, hitArea)
              if (h === 'node') return
              // Native: the field keeps the browser's Copy and Paste menu, so the node's handler must not run.
              e.stopPropagation()
              if (h === 'native') return
              e.preventDefault()
              onSelect()
              onParamMenu({ id: `${k}.${p}`, label }, { x: e.clientX, y: e.clientY })
            }}
          >
            <span className="cp-param-line">
              {/* The dot is not a tab stop, as the old diamond was not; the label's hint says where it sits in Tuning. */}
              <TapHint text={where ? `${paramDesc(label)} ${where}` : paramDesc(label)} label={`About ${label}`}>
                <span className="param-label">
                  {label}
                  {where ? <span className="cp-sr">, in Tuning</span> : null}
                </span>
              </TapHint>
              {where ? (
                <span className="cp-tuning-mark" data-look={mark} aria-hidden="true">
                  <Icon icon={dotIcon} size="sm" />
                </span>
              ) : null}
            </span>
            {/* ParamWidget's FloatInput: a slider and a number field, so the field's own menu can be tried. */}
            <span className="param-float" onClick={(e) => e.stopPropagation()}>
              <input type="range" className="slider-input" aria-label={label} defaultValue={50} />
              <input type="number" className="text-input" aria-label={`${label} value`} defaultValue={0.5} step={0.01} />
            </span>
          </div>
        )
      })}
    </div>
  )
}

// The node's menu as ContextMenu.tsx draws it, less Details, with Show on the Dashboard renamed. A touch press
// on ... starts the menu with the purpose, as the Dashboard's effect menu does (EffectPanel.js _openMenu).
// e4bi.14 param items. The check form uses Menu's single selection, which puts a check gutter on every item:
// Grille has no lone checkable item yet.
type ParamMenuSpec = { label: string; on: boolean; form: ParamItem; find: boolean }
function paramItems({ on, form, find }: ParamMenuSpec): ReactNode[] {
  if (form === 'check') {
    return [
      <MenuItem key="in" id="p:in">
        In Tuning
      </MenuItem>,
      ...(find && on ? [<MenuItem key="find" id="p:find">Find in Tuning</MenuItem>] : []),
    ]
  }
  if (!on) return [<MenuItem key="show" id="p:show">Add to Tuning</MenuItem>]
  return [
    ...(find ? [<MenuItem key="find" id="p:find">Find in Tuning</MenuItem>, <MenuSeparator key="fs" />] : []),
    <MenuItem key="remove" id="p:remove">
      Remove from Tuning
    </MenuItem>,
  ]
}
const checkProps = (p: ParamMenuSpec) => (p.form === 'check' ? { selectionMode: 'single' as const, selectedKey: p.on ? 'p:in' : '' } : {})

// Variant a: a short menu for the one param, as Houdini and Blender treat a property right-click.
function ParamMenuMock({ spec, onPick, onClose }: { spec: ParamMenuSpec; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <Dialog aria-label={`${spec.label} actions`}>
      <Menu aria-label={`${spec.label} actions`} autoFocus="first" onClose={onClose} onAction={onPick} {...checkProps(spec)}>
        {paramItems(spec)}
      </Menu>
    </Dialog>
  )
}

function NodeMenuMock({
  n,
  touch,
  noParams,
  param,
  onPick,
  onClose,
}: {
  n: NodeInfo
  touch: boolean
  noParams: 'hide' | 'disable'
  // Variant b: the node menu opened from a param row ends with a group for that param.
  param?: ParamMenuSpec
  onPick: (id: string) => void
  onClose: () => void
}) {
  const has = n.params.length > 0
  const items: ReactNode[] = []
  if (has || noParams === 'disable') {
    items.push(
      <MenuItem key="tuning" id="tuning" isDisabled={!has}>
        Tuning controls…
      </MenuItem>,
      <MenuSeparator key="s0" />,
    )
  }
  items.push(
    <MenuItem key="cut" id="cut">
      Cut
    </MenuItem>,
    <MenuItem key="copy" id="copy">
      Copy
    </MenuItem>,
    <MenuSeparator key="s1" />,
    <MenuItem key="delete" id="delete">
      Delete
    </MenuItem>,
  )
  // The param's group comes last, after the node's own items, so Delete is never beside it.
  if (param) {
    items.push(
      <MenuSeparator key="ps" />,
      <MenuSection key="p" title={param.label}>
        {paramItems(param)}
      </MenuSection>,
    )
  }
  return (
    <Dialog aria-label={`Actions for ${n.title}`}>
      {touch ? (
        <p className="cp-menu-desc" id="cp-menu-desc">
          {n.purpose}
        </p>
      ) : null}
      <Menu aria-label={`Actions for ${n.title}`} autoFocus="first" onClose={onClose} onAction={onPick} {...(param ? checkProps(param) : {})}>
        {items}
      </Menu>
    </Dialog>
  )
}

const PICK_W = 236 // picker width plus the popover's gap
function pickPlacement(k: string): 'right top' | 'left top' | 'bottom start' {
  const r = document.querySelector(`[data-node="${k}"]`)?.getBoundingClientRect()
  if (!r) return 'bottom start'
  if (r.right + PICK_W <= innerWidth - 8) return 'right top'
  if (r.left - PICK_W >= 8) return 'left top'
  return 'bottom start'
}

// Tuning controls…: the node's params with the Dashboard toggle. Stays open while several are switched.
function TuningPicker({ k, n, named, drawerOpen, onOpenTuning }: { k: string; n: NodeInfo; named: boolean; drawerOpen: boolean; onOpenTuning: () => void }) {
  const a = useActs()
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => {
    // preventScroll: before placement settles the popover can sit past the window edge, and a focus scroll there
    // makes React Aria close it on scroll (seen at 400 px with "right top").
    const t = window.setTimeout(() => first.current?.focus({ preventScroll: true }), 0)
    return () => window.clearTimeout(t)
  }, [])
  return (
    <Dialog aria-label={`${n.title} Tuning controls`}>
      <div className="cp-pick">
        <div className="cp-pick-title">{named ? `${n.title} · Tuning controls` : 'Tuning controls'}</div>
        {n.params.map(([p, label], i) => {
          const id = `${k}.${p}`
          const on = a.state.secs.some((x) => x.ids.includes(id))
          return (
            <label key={p} className="cp-pick-row">
              <span>{label}</span>
              <span className="toggle-switch">
                <input
                  ref={i === 0 ? first : undefined}
                  type="checkbox"
                  checked={on}
                  aria-label={`Add ${label} to Tuning`}
                  onChange={() => a.card(id, on ? 'remove' : 'tick')}
                />
                <span className="toggle-knob" />
              </span>
            </label>
          )
        })}
        {drawerOpen ? null : (
          <button type="button" className="cp-pick-open" onClick={onOpenTuning}>
            Open Tuning
          </button>
        )}
      </div>
    </Dialog>
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

// Edit... on the card menu: the control's Label (empty falls back to the param's name) and Tooltip.
function controlSpec(paramLabel: string, label: string, others: string[]): NameSpec {
  return {
    title: 'Edit control',
    confirm: 'Save',
    label: 'Label',
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
      <DialogActions>
        <Button size="action" onPress={onCancel}>
          Cancel
        </Button>
        <Button size="action" variant="primary" type="submit" isDisabled={blocked}>
          {spec.confirm}
        </Button>
      </DialogActions>
    </form>
  )
}

// The naming dialog's Edit control state: two fields, so both carry visible labels. Switch "Tooltip field"
// compares a textarea stand-in (Grille's TextField has no multi-line form), one line, and a growing textarea.
function EditControlForm({
  c,
  others,
  err,
  icon = 'top',
  tip,
  value,
  autoFocus,
  onConfirm,
  onCancel,
}: {
  c: Ctl
  others: string[]
  err: ErrLook
  icon?: IconAlign
  tip: TipField
  value?: { label: string; tooltip: string }
  autoFocus?: boolean
  onConfirm: (label: string, tooltip: string) => void
  onCancel: () => void
}) {
  const spec = controlSpec(c.paramLabel, c.label ?? '', others)
  const [label, setLabel] = useState(value?.label ?? c.label ?? '')
  const [tooltip, setTooltip] = useState(value?.tooltip ?? c.tooltip ?? '')
  const msg = spec.check(label.trim(), err === 'house')
  return (
    <form
      className={`cp-gdialog cp-err-${err} cp-icon-${icon}`}
      onSubmit={(e) => {
        e.preventDefault()
        onConfirm(label.trim(), tooltip.trim())
      }}
    >
      <AriaTextField className="cp-dfield" value={label} onChange={setLabel} autoFocus={autoFocus}>
        <Label className="cp-dfield-label">Label</Label>
        <Input className="ui-text-input" placeholder={c.paramLabel} />
      </AriaTextField>
      <StatusMessage tone={msg?.tone === 'warning' ? 'warning' : 'neutral'}>
        {msg?.tone === 'notice' ? (
          <>
            <Icon icon={circledInfoIcon} />
            {msg.text}
          </>
        ) : (
          msg?.text
        )}
      </StatusMessage>
      <AriaTextField className="cp-dfield" value={tooltip} onChange={setTooltip}>
        <Label className="cp-dfield-label">Tooltip</Label>
        {tip === 'line' ? (
          <Input className="ui-text-input" placeholder="None" />
        ) : (
          <TextArea className={tip === 'grow' ? 'ui-text-input cp-textarea cp-grow' : 'ui-text-input cp-textarea'} rows={tip === 'grow' ? 1 : 3} placeholder="None" />
        )}
      </AriaTextField>
      <DialogActions>
        <Button size="action" onPress={onCancel}>
          Cancel
        </Button>
        <Button size="action" variant="primary" type="submit">
          Save
        </Button>
      </DialogActions>
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
      <Dialog title={spec.title}>
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
]

const BOARD_CTL: Ctl = { id: 'beat.vibrancyValue', node: 'beat', nodeTitle: 'Beat bounce', param: 'vibrancyValue', paramLabel: 'Vibrancy value' }
const BOARD_EDIT: { caption: string; label: string; tooltip: string }[] = [
  { caption: 'Empty label: notice, Save stays on (back to the param name)', label: '', tooltip: '' },
  { caption: 'Shared label: warning (notice under project rules), Save stays on', label: 'Fixed hue', tooltip: '' },
  {
    caption: 'Long tooltip',
    label: 'Loud brightness',
    tooltip: 'How bright the lights get on the loudest passages. Lower it if loud songs wash the room out, raise it if quiet rooms look dim.',
  },
]

function DialogBoard({ err, icon, tip }: { err: ErrLook; icon: IconAlign; tip: TipField }) {
  return (
    <div className="cp-board">
      {BOARD.map((b, i) => (
        <figure key={`${err}${icon}${i}`} className="cp-board-item">
          <figcaption>
            <b>{b.group}</b> · {b.caption}
          </figcaption>
          <div className="ui-modal">
            <Dialog title={b.spec.title}>
              <NameForm spec={b.spec} err={err} icon={icon} value={b.value} onConfirm={() => {}} onCancel={() => {}} />
            </Dialog>
          </div>
        </figure>
      ))}
      {BOARD_EDIT.map((b, i) => (
        <figure key={`e${err}${icon}${tip}${i}`} className="cp-board-item">
          <figcaption>
            <b>Edit control</b> · {b.caption}
          </figcaption>
          <div className="ui-modal">
            <Dialog title="Edit control">
              <EditControlForm c={BOARD_CTL} others={['Fixed hue']} err={err} icon={icon} tip={tip} value={b} onConfirm={() => {}} onCancel={() => {}} />
            </Dialog>
          </div>
        </figure>
      ))}
    </div>
  )
}

type Node = { key: string; sec?: Sec; ctl?: Ctl; children?: Node[] }
type DialogState = { mode: 'add' | 'rename'; name?: string; moveId?: string }
type TabKey = 'tuning' | 'node' | 'iface'

// Three strip rows: e4bi.1's switches, e4bi.8's, then e4bi.14's.
const STRIP = 112
// Height of the grab tab that sits above the docked drawer (Close: Grab tab).
const GRAB_TAB = 24
const pick = <T extends string>(v: string | null, opts: readonly T[]): T => (opts.includes(v as T) ? (v as T) : opts[0])

// Panel glyph for the side drawer's edge tab, after VS Code's layout toggles: a window with its right column
// filled while the panel shows, outlined while hidden. Grille has no panel icon, so it is drawn here.
function PanelGlyph({ on }: { on: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" />
      <rect x="9.5" y="2.5" width="5" height="11" fill={on ? 'currentColor' : 'none'} stroke="currentColor" />
    </svg>
  )
}

// Docked drawer's grab handle, after Material 3's bottom sheet drag handle: a pill on the drawer's own top band, so
// it never overlaps the tabs. Drag or Up/Down to step heights; click toggles half and full. The corner button is the
// one-click close (WCAG 2.5.7 alternative to dragging down).
// Side drawer (vertical): the pill turns upright; drag or Left/Right shows and hides, click toggles.
function Grabber({
  full,
  closed,
  vertical,
  onStep,
}: {
  full: boolean
  closed?: boolean
  vertical?: boolean
  onStep: (dir: 1 | -1 | 0) => void
}) {
  const start = useRef<number | null>(null)
  const moved = useRef(false)
  const label = vertical
    ? closed
      ? 'Show panels'
      : 'Hide panels'
    : closed
      ? 'Show panels'
      : full
        ? 'Panel height: full. Press for half height'
        : 'Panel height: half. Press for full height'
  const pos = (e: React.PointerEvent) => (vertical ? e.clientX : e.clientY)
  return (
    <button
      type="button"
      className={vertical ? 'cp-grabber cp-grabber-v' : 'cp-grabber'}
      aria-label={label}
      title={vertical ? (closed ? 'Show panels' : 'Hide panels. Drag right to hide') : closed ? 'Show panels' : 'Drag to resize. Click to toggle full height'}
      onPointerDown={(e) => {
        start.current = pos(e)
        moved.current = false
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerUp={(e) => {
        const dy = start.current === null ? 0 : pos(e) - start.current
        start.current = null
        if (Math.abs(dy) > 40) {
          moved.current = true
          onStep(dy < 0 ? 1 : -1)
        }
      }}
      onClick={() => {
        if (!moved.current) onStep(0)
      }}
      onKeyDown={(e) => {
        const grow = vertical ? 'ArrowLeft' : 'ArrowUp'
        const shrink = vertical ? 'ArrowRight' : 'ArrowDown'
        if (e.key === grow || e.key === shrink) {
          e.preventDefault()
          onStep(e.key === grow ? 1 : -1)
        }
      }}
    >
      <span className="cp-grabber-pill" />
    </button>
  )
}

// A text-labelled menu button for the canvas stand-ins (top bar Panels menu, corner View menu).
function TextMenu({ label, items, onPick }: { label: string; items: [string, string][]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const close = () => setOpen(false)
  return (
    <>
      <AriaButton ref={ref} className="ui-button" aria-haspopup="menu" aria-expanded={open} onPress={() => setOpen((o) => !o)}>
        {label} <Icon icon={chevronDownIcon} size="sm" />
      </AriaButton>
      <EditorPopup isOpen={open} onClose={close} label={label} triggerRef={ref} placement="bottom start">
        <Dialog aria-label={label}>
          <Menu
            aria-label={label}
            onClose={close}
            onAction={(id) => {
              close()
              onPick(String(id))
            }}
          >
            {items.map(([id, text]) => (id === '-' ? <MenuSeparator key={text} /> : <MenuItem key={id} id={id}>{text}</MenuItem>))}
          </Menu>
        </Dialog>
      </EditorPopup>
    </>
  )
}

export function ControlsPanelMock() {
  const params = new URLSearchParams(location.search)
  const [scn, setScn] = useState<Scenario>((params.get('data') as Scenario) || 'audio')
  const [head, setHead] = useState(params.get('head') === 'chevron' ? 'chevron' : 'x')
  const [view, setView] = useState(params.get('view') === 'board' ? 'board' : 'panel')
  const [err, setErr] = useState<ErrLook>(params.get('err') === 'raised' ? 'raised' : params.get('err') === 'house' ? 'house' : 'tint')
  const [icon, setIcon] = useState<IconAlign>(params.get('icon') === 'centre' ? 'centre' : 'top')
  // e4bi.8 decisions, first option is the default.
  const [tabsLook, setTabsLook] = useState<TabsLook>(pick(params.get('tabs'), ['fill', 'head', 'row', 'body', 'trad', 'flush'] as const))
  const [nodeMenu, setNodeMenu] = useState(pick(params.get('nmenu'), ['hide', 'disable'] as const))
  const [tip, setTip] = useState<TipField>(pick(params.get('tip'), ['area', 'line', 'grow'] as const))
  const [sw, setSw] = useState<SwitchLook>(pick(params.get('sw'), ['toggle', 'check'] as const))
  const [col, setCol] = useState(pick(params.get('col'), ['show', 'hide'] as const))
  const [touch, setTouch] = useState<TouchPath>(pick(params.get('touch'), ['tips', 'info', 'line'] as const))
  const [added, setAdded] = useState<AddedCue>(pick(params.get('added'), ['none', 'toast', 'badge'] as const))
  const [win, setWin] = useState<WinMenu>(pick(params.get('win'), ['none', 'menu', 'view'] as const))
  const [closeAt, setCloseAt] = useState(pick(params.get('close'), ['tab', 'head', 'edge', 'grab'] as const))
  // Panel model (2026-11-17): b, Tuning only, is the direction; a keeps the tabs mock reachable.
  const [model, setModel] = useState(pick(params.get('model'), ['one', 'tabs'] as const))
  const [noParams, setNoParams] = useState(pick(params.get('np'), ['hide', 'disable'] as const))
  const [mark, setMark] = useState<MarkLook>(pick(params.get('mark'), ['dim', 'text', 'muted', 'none'] as const))
  // e4bi.14 param menu switches. Decided 2026-11-17: hit area a, Add to Tuning wording, Find dropped.
  const [hitArea, setHitArea] = useState<HitArea>(pick(params.get('hit'), ['nofield', 'row', 'label'] as const))
  const [pform, setPform] = useState<ParamForm>(pick(params.get('pm'), ['param', 'merged'] as const))
  const [pitem, setPitem] = useState<ParamItem>(pick(params.get('pi'), ['flip', 'check'] as const))
  const [find, setFind] = useState(pick(params.get('find'), ['off', 'on'] as const))
  const [hits, setHits] = useState(pick(params.get('hits'), ['off', 'on'] as const))
  const [pickLook, setPickLook] = useState<'por' | 'named'>(pick(params.get('pk'), ['por', 'named'] as const))
  const [pmenu, setPmenu] = useState<(ParamRef & { x: number; y: number }) | null>(null)
  const [nodeMenuAt, setNodeMenuAt] = useState<{ k: string; x: number; y: number; touch: boolean; param?: ParamRef } | null>(null)
  const [pickFor, setPickFor] = useState<string | null>(null)
  const [ping, setPing] = useState<{ id: string; n: number } | null>(null)
  const one = model === 'one'
  const [tab, setTab] = useState<TabKey>('tuning')
  const [iface, setIface] = useState(false)
  const [sel, setSel] = useState<string | null>('beat')
  const [focusNonce, setFocusNonce] = useState(0)
  const [flash, setFlash] = useState<string | null>(null)
  const [fresh, setFresh] = useState(0)
  const [addToast, setAddToast] = useState<{ id: string; text: string } | null>(null)
  const [ctlDialog, setCtlDialog] = useState<string | null>(null)
  const [st, setSt] = useState(() => build(scn))
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(true)
  const [full, setFull] = useState(false)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [note, setNote] = useState('Click a node to select it; the Node tab follows. Double-click or Enter on a card selects its node and fits the view.')
  const [measure, setMeasure] = useState('')
  // Aurora-daaa.37: docks only below 650 px (was also portrait windows).
  const dock = useMedia('(max-width: 649px)')
  const toast = useToast()

  useEffect(() => {
    const q = new URLSearchParams({ data: scn, head, view, err, icon, model, np: noParams, mark, hit: hitArea, pm: pform, pi: pitem, find, hits, pk: pickLook, tabs: tabsLook, nmenu: nodeMenu, tip, sw, col, touch, added, win, close: closeAt })
    history.replaceState(null, '', `?${q}`)
  }, [scn, head, view, err, icon, model, noParams, mark, hitArea, pform, pitem, find, hits, pickLook, tabsLook, nodeMenu, tip, sw, col, touch, added, win, closeAt])

  useEffect(() => {
    setNote(
      one
        ? 'Tuning only. Hover or select a node for its ... (right-click opens the same menu); Tuning controls… switches its params. Right-click a param row, or Shift+F10 on its label or slider, for the param menu (e4bi.14; Show hit areas marks which part opens what). Double-click or Enter on a card selects its node and pings the param.'
        : 'Click a node to select it; the Node tab follows. Double-click or Enter on a card selects its node and fits the view.',
    )
    setNodeMenuAt(null)
    setPmenu(null)
    setPickFor(null)
  }, [one])

  // Show from the added toast: the new card scrolls into view and flashes.
  useEffect(() => {
    if (!flash) return
    requestAnimationFrame(() => document.querySelector(`[data-key="c:${CSS.escape(flash)}"]`)?.scrollIntoView({ block: 'nearest' }))
    const t = window.setTimeout(() => setFlash(null), 1600)
    return () => window.clearTimeout(t)
  }, [flash, tab])
  useEffect(() => {
    if (!addToast) return
    const t = window.setTimeout(() => setAddToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [addToast])
  useEffect(() => {
    if (!fresh) return
    const t = window.setTimeout(() => setFresh(0), 2500)
    return () => window.clearTimeout(t)
  }, [fresh])

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
  const tabs: TabKey[] = win !== 'none' && iface ? ['tuning', 'node', 'iface'] : ['tuning', 'node']
  const cur: TabKey = one ? 'tuning' : tabs.includes(tab) ? tab : 'tuning'

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

  const showCard = (id: string) => {
    setAddToast(null)
    setTab('tuning')
    setCollapsed((c) => new Set([...c].filter((n) => n !== GENERAL)))
    setFlash(id)
  }

  const acts: Acts = {
    state: st,
    flat,
    dock,
    flash,
    patch: (id, p) => setSt((s) => ({ ...s, ctls: { ...s.ctls, [id]: { ...s.ctls[id], ...p } } })),
    newSection: (moveId) => setDialog({ mode: 'add', moveId }),
    card: (id, action) => {
      const c = st.ctls[id]
      if (action === 'up') setSt((s) => moveCard(s, id, -1))
      else if (action === 'down') setSt((s) => moveCard(s, id, 1))
      else if (action.startsWith('to:')) setSt((s) => moveTo(s, id, action.slice(3)))
      else if (action === 'to-new') setDialog({ mode: 'add', moveId: id })
      else if (action === 'show' && one) frame(c)
      else if (action === 'show') {
        setSel(c.node)
        setNote(`Show on node: selects ${c.nodeTitle} and fits the view. The Node tab follows; the drawer stays on Tuning.`)
      } else if (action === 'edit') setCtlDialog(id)
      else if (action === 'tick') {
        // A param never switched on before gets its control here, as addControl does: appended to General.
        const row = AUDIO.find((r) => `${r[0]}.${r[2]}` === id)!
        setSt((s) => ({
          ctls: s.ctls[id] ? s.ctls : { ...s.ctls, [id]: { id, node: row[0], nodeTitle: row[1], param: row[2], paramLabel: row[3] } },
          secs: s.secs.map((x) => (x.name === GENERAL ? { ...x, ids: [...x.ids, id] } : x)),
        }))
        if (added === 'toast') setAddToast({ id, text: `Added ${row[3]} to Tuning, General.` })
        else if (added === 'badge') setFresh((n) => n + 1)
      } else if (action === 'remove') {
        const before = st
        setSt((s) => ({ ...s, secs: without(s, id) }))
        toast.show(`Removed ${effective(c)} from Tuning.`, { run: () => setSt(before), doc: null })
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
  const drawerState = !open ? 'closed' : dock ? (full ? 'full' : 'bottom') : 'right'

  // Measured, not assumed (lessons/planning.md "Draw windows at true height").
  useLayoutEffect(() => {
    const read = () => {
      const drawer = document.querySelector('.cp-drawer')?.getBoundingClientRect()
      // Model b's stand-in nodes stop above the bottom dock, so they stay reachable without panning.
      document.documentElement.style.setProperty('--cp-dock', `${drawer && dock ? Math.round(drawer.height) : 0}px`)
      const label = document.querySelector('.cp-item-card .cp-label')?.getBoundingClientRect()
      const list = document.querySelector<HTMLElement>('.cp-tablist')
      const acts = document.querySelector('.cp-head-actions')?.getBoundingClientRect()
      const tabsText = list
        ? ` · tabs ${list.scrollWidth} px${list.scrollWidth > list.clientWidth ? ` in ${list.clientWidth} (overflows)` : ''}` + (acts ? `, head actions ${Math.round(acts.width)} px` : '')
        : ''
      setMeasure(
        drawer
          ? `window ${innerWidth}x${innerHeight} · drawer ${Math.round(drawer.width)}x${Math.round(drawer.height)}` +
              tabsText +
              (label ? ` · card label room ${Math.round(label.width)} px` : '')
          : `window ${innerWidth}x${innerHeight} · drawer closed`,
      )
    }
    read()
    addEventListener('resize', read)
    return () => removeEventListener('resize', read)
  })

  // Find in Tuning (switch off by default): opens the drawer, expands the card's section, scrolls to it and flashes it.
  const findCard = (id: string) => {
    const sec = secOf(st, id)
    setOpen(true)
    setTab('tuning')
    setCollapsed((c) => new Set([...c].filter((n) => n !== sec.name)))
    setFlash(null)
    requestAnimationFrame(() => setFlash(id))
    setNote(`Find in Tuning: opened the drawer, expanded ${secName(sec.name)}, scrolled to ${effective(st.ctls[id])} and flashed it.`)
  }
  const pickParam = (id: string, action: string) => {
    const on = st.secs.some((x) => x.ids.includes(id))
    if (action === 'p:find') findCard(id)
    else if (action === 'p:show' || (action === 'p:in' && !on)) acts.card(id, 'tick')
    else acts.card(id, 'remove')
  }
  const paramSpec = (p: ParamRef): ParamMenuSpec => ({
    label: p.label,
    on: st.secs.some((x) => x.ids.includes(p.id)),
    form: pitem,
    find: find === 'on',
  })

  const frame = (c: Ctl) => {
    setSel(c.node)
    if (one) {
      setPing((p) => ({ id: c.id, n: (p?.n ?? 0) + 1 }))
      requestAnimationFrame(() => document.querySelector(`[data-param="${CSS.escape(c.id)}"]`)?.scrollIntoView({ block: 'nearest' }))
      setNote(`Double-click / Enter: selects ${c.nodeTitle}, fits the view and pings ${c.paramLabel} on the node.`)
    } else setNote(`Double-click / Enter: selects ${c.nodeTitle} on the canvas and fits the view.`)
  }

  // Grabber steps: closed, half, full. Up and down keys or a vertical drag step one way, a click toggles half and full.
  const stepDock = (dir: 1 | -1 | 0) => {
    if (dir === 0) {
      if (!open) openTab('tuning')
      else setFull((f) => !f)
    } else if (dir === 1) {
      if (!open) openTab('tuning')
      else setFull(true)
    } else if (full) setFull(false)
    else setOpen(false)
  }

  const openTab = (t: TabKey) => {
    if (t === 'iface') setIface(true)
    setOpen(true)
    setTab(t)
  }

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

  const panelMenu =
    cur === 'tuning' ? (
      <RowMenu label="Tuning actions" big>
        {(close) => (
          <Menu
            aria-label="Tuning actions"
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
    ) : nodeMenu === 'disable' ? (
      <AriaButton className="ui-button" data-variant="ghost" data-icon aria-label="No actions for this tab" isDisabled>
        <Icon icon={menuHorizontalIcon} size="sm" />
      </AriaButton>
    ) : null

  // Variants b and d put Tuning's menu inside its own panel, not in the head.
  const menuInPanel = !one && (tabsLook === 'row' || tabsLook === 'trad' || tabsLook === 'flush' || tabsLook === 'fill')
  const headActions = (
    <div className="cp-head-actions">
      {menuInPanel ? null : panelMenu}
      {head === 'x' && panelMenu && !menuInPanel && closeAt === 'head' ? <span className="cp-head-rule" aria-hidden="true" /> : null}
      {closeAt !== 'head' ? null : dock ? (
        <Button icon aria-label={full ? 'Half height' : 'Full height'} onPress={() => setFull((f) => !f)}>
          <Icon icon={full ? fullscreenArrowExitIcon : fullscreenArrowIcon} />
        </Button>
      ) : null}
      {closeAt !== 'head' ? null : (
        <Button icon aria-label="Close" onPress={() => setOpen(false)}>
          <Icon icon={head === 'x' ? xMarkIcon : dock ? chevronDownIcon : chevronRightIcon} />
        </Button>
      )}
    </div>
  )

  // Hand-built tablist on Grille's .ui-tab look: Grille's Tabs couples list and panel, and React Aria's Tabs
  // threw on load ("reading 'isDisabled'") when it wrapped the drawer's Tree and menus.
  const TAB_NAMES: Record<TabKey, string> = { tuning: 'Tuning', node: 'Node', iface: 'Interface' }
  const tabList = (
    <div
      role="tablist"
      aria-label="Panels"
      className={`cp-tablist ${tabsLook === 'row' ? 'ui-tab-list cp-tabs cp-tabs-b' : tabsLook === 'trad' ? 'cp-tabs-d' : tabsLook === 'flush' ? 'cp-tabs-d cp-tabs-e' : tabsLook === 'fill' ? 'cp-tabs-d cp-tabs-e cp-tabs-f' : 'cp-tabs'}`}
      onKeyDown={(e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
        if (!step) return
        const next = tabs[(tabs.indexOf(cur) + step + tabs.length) % tabs.length]
        setTab(next)
        document.getElementById(`cp-tab-${next}`)?.focus()
      }}
    >
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          id={`cp-tab-${t}`}
          aria-selected={cur === t}
          aria-controls={`cp-panel-${t}`}
          tabIndex={cur === t ? 0 : -1}
          data-selected={cur === t || undefined}
          className={tabsLook === 'row' ? 'ui-tab' : tabsLook === 'trad' ? 'cp-tab-d' : tabsLook === 'flush' || tabsLook === 'fill' ? 'cp-tab-d' : 'ui-tab cp-tab'}
          onClick={() => setTab(t)}
        >
          {TAB_NAMES[t]}
          {t === 'tuning' && tabsLook !== 'body' && count ? <span className="cp-tab-count">{count}</span> : null}
          {t === 'tuning' && fresh ? (
            <span key={fresh} className="cp-tab-fresh">
              +{fresh}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )

  const panelsItems: [string, string][] = [
    ['tuning', 'Tuning'],
    ['node', 'Node'],
    ['-', 's1'],
    ['iface', 'Interface (sub-graph)'],
  ]

  return (
    <ActsContext.Provider value={acts}>
      <div className="cp-root" data-model={model} data-drawer={drawerState} data-edge={closeAt === 'edge' || closeAt === 'tab' || undefined} data-close={closeAt} data-tabs={tabsLook} data-hit={hitArea} data-hits={hits === 'on' || undefined} style={{ '--strip': `${STRIP}px` } as CSSProperties}>
        <div className="cp-strip">
          <div className="cp-strip-row">
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
          <div className="cp-strip-row">
            <b>Panels (e4bi.8)</b>
            <label>
              Panel model{' '}
              <select value={model} onChange={(e) => setModel(e.target.value as 'one' | 'tabs')}>
                <option value="one">b. Tuning only, add from the node</option>
                <option value="tabs">a. Tuning and Node tabs</option>
              </select>
            </label>
            {one ? (
              <label>
                Node without params{' '}
                <select value={noParams} onChange={(e) => setNoParams(e.target.value as 'hide' | 'disable')}>
                  <option value="hide">Tuning controls hidden</option>
                  <option value="disable">Tuning controls disabled</option>
                </select>
              </label>
            ) : null}
            {one ? (
              <label>
                In-Tuning mark{' '}
                <select value={mark} onChange={(e) => setMark(e.target.value as MarkLook)}>
                  <option value="text">a. Dot after the label, text colour</option>
                  <option value="muted">b. Dot after the label, secondary colour</option>
                  <option value="dim">d. Dot after the label, Grille muted (decided)</option>
                  <option value="none">c. None (today)</option>
                </select>
              </label>
            ) : null}
            {/* Tabs-only switches, hidden under b (lessons/planning.md: hide, delete only when it slows the work). */}
            {one ? null : (
              <>
            <label>
              1 Tab strip{' '}
              <select value={tabsLook} onChange={(e) => setTabsLook(e.target.value as TabsLook)}>
                <option value="head">a. Tabs in the head, count on Tuning</option>
                <option value="row">b. Tabs on their own row</option>
                <option value="body">c. No count on the tab</option>
                <option value="trad">d. Traditional tabs</option>
                <option value="flush">e. Flush tabs (VS Code)</option>
                <option value="fill">f. Flush tabs, full width (decided)</option>
              </select>
            </label>
            <label>
              … on Node{' '}
              <select value={nodeMenu} onChange={(e) => setNodeMenu(e.target.value as 'hide' | 'disable')}>
                <option value="hide">Hidden</option>
                <option value="disable">Disabled</option>
              </select>
            </label>
            <label>
              3 Param switch{' '}
              <select value={sw} onChange={(e) => setSw(e.target.value as SwitchLook)}>
                <option value="toggle">a. Dashboard toggle (decided)</option>
                <option value="check">c. Checkbox</option>
              </select>
            </label>
            <label>
              Tuning column{' '}
              <select value={col} onChange={(e) => setCol(e.target.value as 'show' | 'hide')}>
                <option value="show">Shown</option>
                <option value="hide">Hidden</option>
              </select>
            </label>
            <label>
              4 Touch{' '}
              <select value={touch} onChange={(e) => setTouch(e.target.value as TouchPath)}>
                <option value="tips">a. Tooltips only</option>
                <option value="info">b. (i) per row</option>
                <option value="line">c. Second line</option>
              </select>
            </label>
            <label>
              6 Panels menu{' '}
              <select value={win} onChange={(e) => setWin(e.target.value as WinMenu)}>
                <option value="none">a. None, two tabs</option>
                <option value="menu">b. Top-bar Panels menu</option>
                <option value="view">c. In the canvas View menu</option>
              </select>
            </label>
              </>
            )}
            <label>
              2 Tooltip field{' '}
              <select value={tip} onChange={(e) => setTip(e.target.value as TipField)}>
                <option value="area">a. Textarea, 3 rows (recommended)</option>
                <option value="line">b. One line</option>
                <option value="grow">c. Grows with text</option>
              </select>
            </label>
            <label>
              5 On switch-on{' '}
              <select value={added} onChange={(e) => setAdded(e.target.value as AddedCue)}>
                <option value="none">a. Nothing (decided)</option>
                <option value="toast">b. Toast with Show</option>
                <option value="badge">c. Badge on Tuning</option>
              </select>
            </label>
            <label>
              Close{' '}
              <select value={closeAt} onChange={(e) => setCloseAt(e.target.value as 'head' | 'edge' | 'grab' | 'tab')}>
                <option value="head">x and full height in the head</option>
                <option value="edge">Edge control</option>
                <option value="grab">Grabber and panel icon</option>
                <option value="tab">Grab tab on the edge (decided)</option>
              </select>
            </label>
          </div>
          {one ? (
            <div className="cp-strip-row">
              <b>Param menu (e4bi.14)</b>
              <label>
                1 Hit area{' '}
                <select value={hitArea} onChange={(e) => setHitArea(e.target.value as HitArea)}>
                  <option value="nofield">a. Row, field keeps browser menu (decided)</option>
                  <option value="row">b. Whole row</option>
                  <option value="label">c. Label line</option>
                </select>
              </label>
              <label>
                5 Picker{' '}
                <select value={pickLook} onChange={(e) => setPickLook(e.target.value as 'por' | 'named')}>
                  <option value="por">a. As built</option>
                  <option value="named">b. Node in title, lifted when over the node</option>
                </select>
              </label>
              <label>
                <input type="checkbox" checked={hits === 'on'} onChange={(e) => setHits(e.target.checked ? 'on' : 'off')} /> Show hit areas
              </label>
              <label>
                2 Menu{' '}
                <select value={pform} onChange={(e) => setPform(e.target.value as ParamForm)}>
                  <option value="param">a. Param menu (decided)</option>
                  <option value="merged">b. In the node menu, last</option>
                </select>
              </label>
              <label>
                3 Item{' '}
                <select value={pitem} onChange={(e) => setPitem(e.target.value as ParamItem)}>
                  <option value="flip">a. Add / Remove wording (decided)</option>
                  <option value="check">b. Check mark (Grille ask)</option>
                </select>
              </label>
              <label>
                4 Find{' '}
                <select value={find} onChange={(e) => setFind(e.target.value as 'on' | 'off')}>
                  <option value="off">No (decided)</option>
                  <option value="on">Find in Tuning</option>
                </select>
              </label>
            </div>
          ) : null}
        </div>
        <div className="cp-canvas" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          <div className="cp-note">
            <div>{note}</div>
            <div className="cp-measure">{measure}</div>
          </div>
          {one ? (
            <div className="cp-snodes" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
              {Object.entries(NODES).map(([k, n]) => (
                <StandInNode
                  key={k}
                  k={k}
                  n={n}
                  selected={sel === k}
                  ping={ping}
                  mark={mark}
                  hitArea={hitArea}
                  tuningOf={(id) => {
                    const sec = st.secs.find((x) => x.ids.includes(id))
                    return sec ? `In Tuning as "${effective(st.ctls[id])}", ${secName(sec.name)}.` : null
                  }}
                  onSelect={() => setSel(k)}
                  onMenu={(pt, t) => {
                    setPickFor(null)
                    setPmenu(null)
                    setNodeMenuAt({ k, ...pt, touch: t })
                  }}
                  onParamMenu={(p, pt) => {
                    setPickFor(null)
                    if (pform === 'merged') {
                      setPmenu(null)
                      setNodeMenuAt({ k, ...pt, touch: false, param: p })
                    } else {
                      setNodeMenuAt(null)
                      setPmenu({ ...p, ...pt })
                    }
                  }}
                />
              ))}
            </div>
          ) : (
          <>
          {/* Stand-in nodes: click selects, the dashed buttons stand for the node's canvas menu. */}
          <div className="cp-fnodes">
            {Object.entries(NODES).map(([k, n]) => (
              <div key={k} className="cp-fnode-wrap">
                <button type="button" className="cp-fnode" data-selected={sel === k || undefined} onClick={() => setSel(k)}>
                  {n.title}
                </button>
                {sel === k ? (
                  <div className="cp-fnode-menu">
                    <button type="button" onClick={() => openTab('node')}>
                      Details
                    </button>
                    {n.params.length ? (
                      <button
                        type="button"
                        onClick={() => {
                          openTab('node')
                          setFocusNonce((x) => x + 1)
                        }}
                      >
                        Show on the Dashboard
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {win === 'menu' ? (
            <div className="cp-topbar">
              <span className="cp-topbar-stub">Undo · Redo · Title</span>
              <TextMenu label="Panels" items={panelsItems} onPick={(id) => openTab(id as TabKey)} />
              <span className="cp-topbar-stub">Test</span>
            </div>
          ) : null}
          {win === 'view' ? (
            <div className="cp-viewmenu">
              <TextMenu
                label="View"
                items={[['zin', 'Zoom in'], ['zout', 'Zoom out'], ['fit', 'Fit view'], ['mini', 'Minimap'], ['-', 's0'], ...panelsItems]}
                onPick={(id) => (['tuning', 'node', 'iface'].includes(id) ? openTab(id as TabKey) : undefined)}
              />
            </div>
          ) : null}
          </>
          )}
          {nodeMenuAt ? (
            <EditorPopup isOpen onClose={() => setNodeMenuAt(null)} label="Node actions" point={{ x: nodeMenuAt.x, y: nodeMenuAt.y }} key={`${nodeMenuAt.x},${nodeMenuAt.y}`}>
              <NodeMenuMock
                n={NODES[nodeMenuAt.k]}
                touch={nodeMenuAt.touch}
                noParams={noParams}
                param={nodeMenuAt.param ? paramSpec(nodeMenuAt.param) : undefined}
                onClose={() => setNodeMenuAt(null)}
                onPick={(id) => {
                  const { k, param } = nodeMenuAt
                  setNodeMenuAt(null)
                  if (id.startsWith('p:') && param) pickParam(param.id, id)
                  else if (id === 'tuning') setPickFor(k)
                  else setNote(`${id[0].toUpperCase()}${id.slice(1)}: unchanged from today, not part of this mock.`)
                }}
              />
            </EditorPopup>
          ) : null}
          {pmenu ? (
            <EditorPopup isOpen onClose={() => setPmenu(null)} label={`${pmenu.label} actions`} point={{ x: pmenu.x, y: pmenu.y }} key={`p${pmenu.x},${pmenu.y}`}>
              <ParamMenuMock
                spec={paramSpec(pmenu)}
                onClose={() => setPmenu(null)}
                onPick={(id) => {
                  setPmenu(null)
                  pickParam(pmenu.id, id)
                }}
              />
            </EditorPopup>
          ) : null}
          {pickFor ? (
            <EditorPopup
              isOpen
              onClose={() => setPickFor(null)}
              label="Tuning controls"
              // Beside the node so it does not read as part of it, by measured room (React Aria does not flip
              // "right" when neither side fits); below the header only when neither side has room.
              triggerRef={{ current: document.querySelector(`[data-node="${pickFor}"] .aurora-node-header`) }}
              placement={pickPlacement(pickFor)}
              // Variant b: when it must sit over the node, lift it off the header with a gap and a deeper shadow.
              className={pickLook === 'named' && pickPlacement(pickFor) === 'bottom start' ? 'cp-pick-lift' : undefined}
              key={pickFor}
            >
              <TuningPicker
                k={pickFor}
                named={pickLook === 'named'}
                n={NODES[pickFor]}
                drawerOpen={open}
                onOpenTuning={() => {
                  setPickFor(null)
                  openTab('tuning')
                }}
              />
            </EditorPopup>
          ) : null}
          {/* Dropped with the grab tab (owner, 2026-11-16): the tab reopens the drawer without a corner. */}
          {closeAt === 'tab' ? null : (
          <button
            type="button"
            className="ui-button cp-corner"
            onClick={() => {
              if (!open) openTab('tuning')
              else if (cur !== 'tuning') setTab('tuning')
              else setOpen(false)
            }}
            aria-expanded={open}
          >
            Dashboard controls <span className="cp-corner-count">{count}</span>
          </button>
          )}
        </div>
        {open ? (
          <section
            className="ui-drawer cp-drawer"
            data-side={side}
            data-expanded={dock && full ? '' : undefined}
            style={{ '--ui-drawer-top': `${closeAt === 'tab' && dock && full ? STRIP + GRAB_TAB : STRIP}px` } as CSSProperties}
            aria-label="Editor panels"
          >
            {closeAt === 'grab' && dock ? (
              <div className="cp-grab-band">
                <Grabber full={full} onStep={stepDock} />
              </div>
            ) : null}
            <>
              {one ? (
                <div className="ui-drawer-head cp-head cp-head-one">
                  <h2 className="cp-one-title">
                    Tuning{count ? <span className="cp-tab-count">{count}</span> : null}
                  </h2>
                  {headActions}
                </div>
              ) : tabsLook === 'row' ? (
                <>
                  <div className="ui-drawer-head cp-head cp-head-slim">{headActions}</div>
                  {tabList}
                  {/* RockyRoadImport SongConverter: Grille Tabs as shipped, a 3 px rule bled to the edges under the pills. */}
                  <div className="cp-tab-rule" aria-hidden="true" />
                </>
              ) : tabsLook === 'trad' || tabsLook === 'flush' || tabsLook === 'fill' ? (
                <div className={tabsLook === 'trad' ? 'cp-head-d' : 'cp-head-d cp-head-e'}>
                  {tabList}
                  {headActions}
                </div>
              ) : (
                <div className="ui-drawer-head cp-head">
                  {tabList}
                  {headActions}
                </div>
              )}
              <div
                role={one ? undefined : 'tabpanel'}
                id={`cp-panel-${cur}`}
                aria-labelledby={one ? undefined : `cp-tab-${cur}`}
                className="ui-drawer-body cp-body"
                data-tabs={one ? 'one' : tabsLook}
              >
                {cur === 'tuning' ? (
                <div
                  // React Aria's row keys run in the capture phase; Enter on a focused card row is caught here.
                  onKeyDown={(e) => {
                    const row = e.target as HTMLElement
                    const key = row.getAttribute('role') === 'row' ? row.dataset.key : undefined
                    if (e.key === 'Enter' && key?.startsWith('c:')) frame(st.ctls[key.slice(2)])
                  }}
                >
                  {menuInPanel ? <div className="cp-panel-bar">{panelMenu}</div> : null}
                  {tabsLook === 'body' && count ? (
                    <p className="cp-count-line">
                      {count} {count === 1 ? 'control' : 'controls'} on the Dashboard
                    </p>
                  ) : null}
                  {count === 0 && flat ? (
                    <p className="cp-hint">
                      {one ? 'No controls yet. Select a node, open its …, and choose Tuning controls….' : 'None yet. Switch a param on in the Node tab.'}
                    </p>
                  ) : (
                    <Tree
                      aria-label="Tuning"
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
                ) : cur === 'node' ? (
                  <NodeTab
                    node={sel}
                    sw={sw}
                    col={col === 'show'}
                    touch={touch}
                    focusNonce={focusNonce}
                    onFocused={() => setFocusNonce(0)}
                    onEdit={setCtlDialog}
                  />
                ) : (
                  <p className="cp-hint">
                    Stub (Aurora-g5mz): a sub-graph's interface, the same exposed-param Tree as Tuning. Here only to test a third tab in the strip.
                  </p>
                )}
              </div>
            </>
          </section>
        ) : null}
        {/* Edge control: a tab on the drawer's inner edge. Side drawer: > closes, < reopens. Dock: up for full
            height, down steps full to half to closed. Grille has no left chevron, so the right one is turned. */}
        {closeAt === 'grab' && !dock ? (
          <div className="cp-edge" data-place="right" data-state={drawerState}>
            <AriaButton
              className="ui-button cp-edge-btn" data-variant="ghost" data-icon data-size="sm"
              aria-label={open ? 'Hide panels' : 'Show panels'}
              aria-pressed={open}
              onPress={() => (open ? setOpen(false) : openTab('tuning'))}
            >
              <PanelGlyph on={open} />
            </AriaButton>
          </div>
        ) : null}
        {closeAt === 'grab' && dock && !open ? (
          <div className="cp-edge cp-grab-closed" data-place="bottom" data-state="closed">
            <Grabber full={false} closed onStep={stepDock} />
          </div>
        ) : null}
        {/* Grab tab: one small tab with the pill in every state. Docked it sits on the drawer's top edge (above the
            full-height drawer, in the gap left for it); beside the side drawer the pill stands upright. */}
        {closeAt === 'tab' ? (
          <div className="cp-edge cp-grabtab" data-place={dock ? 'bottom' : 'right'} data-state={drawerState}>
            {dock ? (
              <Grabber full={full} closed={!open} onStep={stepDock} />
            ) : (
              <Grabber full={false} closed={!open} vertical onStep={(d) => (d === 0 ? (open ? setOpen(false) : openTab('tuning')) : d === 1 ? openTab(cur) : setOpen(false))} />
            )}
          </div>
        ) : null}
        {closeAt === 'edge' ? (
          <div className="cp-edge" data-place={dock ? 'bottom' : 'right'} data-state={drawerState}>
            {!dock ? (
              <AriaButton
                className="ui-button cp-edge-btn" data-variant="ghost" data-icon data-size="sm"
                aria-label={open ? 'Close panels' : 'Open panels'}
                onPress={() => (open ? setOpen(false) : openTab('tuning'))}
              >
                <span className={open ? 'cp-edge-icon' : 'cp-edge-icon cp-flip'}>
                  <Icon icon={chevronRightIcon} size="sm" />
                </span>
              </AriaButton>
            ) : !open ? (
              <AriaButton className="ui-button cp-edge-btn" data-variant="ghost" data-icon data-size="sm" aria-label="Open panels" onPress={() => openTab('tuning')}>
                <Icon icon={chevronUpIcon} size="sm" />
              </AriaButton>
            ) : (
              <>
                {full ? null : (
                  <AriaButton className="ui-button cp-edge-btn" data-variant="ghost" data-icon data-size="sm" aria-label="Full height" onPress={() => setFull(true)}>
                    <Icon icon={chevronUpIcon} size="sm" />
                  </AriaButton>
                )}
                <AriaButton
                  className="ui-button cp-edge-btn" data-variant="ghost" data-icon data-size="sm"
                  aria-label={full ? 'Half height' : 'Close panels'}
                  onPress={() => (full ? setFull(false) : setOpen(false))}
                >
                  <Icon icon={chevronDownIcon} size="sm" />
                </AriaButton>
              </>
            )}
          </div>
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
        {ctlDialog ? (
          <Modal isOpen onOpenChange={(o) => !o && setCtlDialog(null)}>
            <Dialog title="Edit control">
              <EditControlForm
                c={st.ctls[ctlDialog]}
                others={Object.values(st.ctls)
                  .filter((x) => x.id !== ctlDialog)
                  .map(effective)}
                err={err}
                icon={icon}
                tip={tip}
                autoFocus
                onCancel={() => setCtlDialog(null)}
                onConfirm={(label, tooltip) => {
                  acts.patch(ctlDialog, { label: label || undefined, tooltip: tooltip || undefined })
                  setCtlDialog(null)
                }}
              />
            </Dialog>
          </Modal>
        ) : null}
        {view === 'board' ? <DialogBoard err={err} icon={icon} tip={tip} /> : null}
        {addToast ? (
          <div className="editor-toast" data-shown="true" data-undo="true">
            <span role="status" aria-live="polite">
              {addToast.text}
            </span>
            <Button size="sm" onPress={() => showCard(addToast.id)}>
              Show
            </Button>
          </div>
        ) : (
          <Toast
            text={toast.text}
            undo={toast.undo}
            onHold={toast.hold}
            onUndo={() => {
              toast.undo?.run()
              toast.dismiss()
            }}
          />
        )}
      </div>
    </ActsContext.Provider>
  )
}
