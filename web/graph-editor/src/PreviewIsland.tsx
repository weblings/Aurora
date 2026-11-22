import { useEffect, useLayoutEffect, useRef, useState, type DOMAttributes, type MutableRefObject, type ReactElement, type RefObject } from 'react'
import type { FocusableElement } from '@react-types/shared'
import { Focusable } from 'react-aria-components'
import { Dialog, Icon, Menu, MenuItem, Tooltip, TooltipTrigger, chevronDownIcon } from '@weblings_things/grille'
import { EditorPopup } from './EditorPopup'
import { Hint } from './Hint'
import { fetchZoneRegions } from './api'
import { activeZones, byte, type PreviewFrame } from './graph/frame'
import { layoutChoices, layoutName, type Layout } from './graph/previewLayout'

type Props = {
  frame: MutableRefObject<PreviewFrame | null>
  // Dimmed while the stream is not live, so a held frame does not pass for fresh.
  live: boolean
  layout: Layout
  // The Hue entertainment area's name, when known, names the real layout.
  area: string | null
  // Zones in the saved map: 0 leaves Sim: your room out of the menu.
  savedZones: number
  // The lights cannot be reached: the Lights row is greyed.
  noLights: boolean
  // A light test is running: the island shows the real lights and the menu is locked.
  testing: boolean
  onPick: (layout: Layout) => void
}

const OPEN_KEY = 'aurora.graphEditor.zonesOpen'

// Open or collapsed is kept for the session; storage can throw (private window),
// so the island then just starts open on every load.
function readOpen(): boolean {
  try {
    return sessionStorage.getItem(OPEN_KEY) !== 'false'
  } catch {
    return true
  }
}

// True while `ref`'s text is cut off by its width, for a tooltip that shows only then (Grille's Button
// has no tooltipOnlyWhenTruncated, which MenuItem does).
function useCutOff(ref: RefObject<HTMLElement | null>, text: string): boolean {
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setCut(el.scrollWidth > el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, text])
  return cut
}

// The Preview island (Aurora-s1t7.4, Aurora-u8jx.6.1): the editor's main preview of the draft. The header is
// one whole-row button that hides the cells, then a menu button for the layout (Lights, Sim: your room,
// Sim: basic room), then one 14 px cell per zone, 8 per row, with no screen mapping (zone regions overlap, so
// a mapped box would hide zones). It never hides while the stream is live. Colours are written to the cells
// from `frame` on animation frames, so preview events never pass through React state; only the zone count
// does. A zone the pipeline flagged as an error gets diagonal stripes over its own colour.
export function PreviewIsland({ frame, live, layout, area, savedZones, noLights, testing, onPick }: Props) {
  const [open, setOpen] = useState(readOpen)
  const [count, setCount] = useState(0)
  const [activeOutput, setActiveOutput] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const cells = useRef<HTMLDivElement>(null)
  const layoutButton = useRef<HTMLButtonElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const name = layoutName(layout, area)
  const cut = useCutOff(label, name)

  const toggle = () => {
    const next = !open
    setOpen(next)
    try {
      sessionStorage.setItem(OPEN_KEY, String(next))
    } catch {
      // Not kept; the island still toggles.
    }
  }

  // The active output changes only when the user edits outputs, so one read per
  // (re)connect is enough; on failure the frame's first output stands in.
  useEffect(() => {
    if (!live) return
    let cancelled = false
    fetchZoneRegions().then(
      (r) => {
        if (!cancelled) setActiveOutput(r?.output ?? null)
      },
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [live])

  useEffect(() => {
    let raf = 0
    let drawn: PreviewFrame | null | undefined
    let drawnKids = -1
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const current = frame.current
      const host = cells.current
      // Redraw on a new frame, or once the cells have just been (re)mounted.
      const kids = host ? host.children.length : -1
      if (current === drawn && kids === drawnKids) return
      drawn = current
      drawnKids = kids
      const zones = current ? activeZones(current, activeOutput) : []
      setCount((n) => (n === zones.length ? n : zones.length))
      if (!host) return
      zones.forEach((zone, i) => {
        const cell = host.children[i] as HTMLElement | undefined
        if (!cell) return
        cell.style.backgroundColor = `rgb(${byte(zone.r)} ${byte(zone.g)} ${byte(zone.b)})`
        cell.classList.toggle('zones-cell-error', zone.error)
      })
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [frame, activeOutput])

  // Before the first frame (preview paused or Aurora gone) there is nothing to show; once the stream is
  // live the island stays, even with no zones to draw.
  if (!live && count === 0) return null
  const close = () => setMenuOpen(false)
  const layoutTrigger = (
    <button
      ref={layoutButton}
      type="button"
      className="ui-button preview-layout"
      aria-label={`Preview layout, ${name}`}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      disabled={testing}
      onClick={() => setMenuOpen((o) => !o)}
    >
      <span className="preview-label" ref={label}>{name}</span>
      <Icon icon={chevronDownIcon} size="sm" />
    </button>
  ) as ReactElement<DOMAttributes<FocusableElement>, string>
  return (
    <div className={`preview-island${live ? '' : ' preview-island-stale'}${open ? ' open' : ''}`} role="group" aria-label="Preview">
      <button type="button" className="ui-button preview-toggle" aria-expanded={open} aria-label={open ? 'Hide preview' : 'Show preview'} onClick={toggle}>
        Preview
        <Icon icon={chevronDownIcon} size="sm" />
      </button>
      {open ? (
        <>
          {/* A disabled button gets no hover, so the locked reason sits on the wrapper. */}
          <Hint text={testing ? 'Showing the lights while a test runs' : null} placement="bottom">
            <span className="preview-lock">
              <TooltipTrigger isDisabled={!cut || testing}>
                <Focusable>{layoutTrigger}</Focusable>
                <Tooltip placement="bottom">{name}</Tooltip>
              </TooltipTrigger>
            </span>
          </Hint>
          <EditorPopup isOpen={menuOpen} onClose={close} label="Preview layout" triggerRef={layoutButton} placement="bottom start">
            <Dialog aria-label="Preview layout">
              <Menu
                aria-label="Preview layout"
                selectionMode="single"
                selectedKey={layout}
                onClose={close}
                onAction={(id) => {
                  close()
                  onPick(id as Layout)
                }}
              >
                {layoutChoices(savedZones).map((choice) => (
                  <MenuItem key={choice} id={choice} isDisabled={choice === 'lights' && noLights} tooltip={layoutName(choice, area)} tooltipOnlyWhenTruncated>
                    <span className="editor-menu-title">{layoutName(choice, area)}</span>
                  </MenuItem>
                ))}
              </Menu>
            </Dialog>
          </EditorPopup>
          <div className="zones-cells" ref={cells} role="img" aria-label={`${name}, ${count} ${count === 1 ? 'zone' : 'zones'}`}>
            {Array.from({ length: count }, (_, i) => (
              <i key={i} className="zones-cell" />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
