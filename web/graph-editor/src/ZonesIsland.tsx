import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Icon, chevronDownIcon, chevronUpIcon } from '@weblings/grille'
import { fetchZoneRegions } from './api'
import { activeZones, byte, type PreviewFrame } from './graph/frame'

type Props = {
  frame: MutableRefObject<PreviewFrame | null>
  // Dimmed while the stream is not live, so a held frame does not pass for fresh.
  live: boolean
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

// The corner Zones island (Aurora-s1t7.4): a header with a hide chevron, then
// one 14 px cell per zone of the single active output, 8 per row, with no
// screen mapping (zone regions overlap, so a mapped box would hide zones).
// Colours are written to the cells from `frame` on animation frames, so preview
// events never pass through React state; only the zone count does. A zone the
// pipeline flagged as an error gets diagonal stripes over its own colour, not
// just a hue change.
export function ZonesIsland({ frame, live }: Props) {
  const [open, setOpen] = useState(readOpen)
  const [count, setCount] = useState(0)
  const [activeOutput, setActiveOutput] = useState<string | null>(null)
  const cells = useRef<HTMLDivElement>(null)

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

  // Nothing to show before the first frame (preview paused): no empty island.
  if (count === 0) return null
  return (
    <div className={`zones-island${live ? '' : ' zones-island-stale'}${open ? ' open' : ''}`} role="group" aria-label="Zones">
      <button type="button" className="zones-head" aria-expanded={open} aria-label={open ? 'Hide zones' : 'Show zones'} onClick={toggle}>
        Zones
        <Icon icon={open ? chevronUpIcon : chevronDownIcon} size="sm" />
      </button>
      {open ? (
        <div className="zones-cells" ref={cells} role="img" aria-label="Preview of the lights">
          {Array.from({ length: count }, (_, i) => (
            <i key={i} className="zones-cell" />
          ))}
        </div>
      ) : null}
    </div>
  )
}
