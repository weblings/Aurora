import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import { fetchZoneRegions } from './api'
import { byte, layoutThumbnail, type PreviewFrame, type ZoneRegions } from './graph/frame'

const COLUMNS = 8
const CELL = 14
const GAP = 2
const STEP = CELL + GAP

type Props = {
  frame: MutableRefObject<PreviewFrame | null>
  // Dimmed while the stream is not live, so a held frame does not pass for fresh.
  live: boolean
}

// The corner zone-map thumbnail: the active output's zones at their sampled
// screen regions, then one cell per remaining zone, one block of rows per
// output. It redraws from `frame` on animation frames, so preview events never
// pass through React state. A zone the pipeline flagged as an error is drawn
// with diagonal stripes in the zone's own colour, not just a hue change.
export function ZoneThumbnail({ frame, live }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const regions = useRef<ZoneRegions | null>(null)
  const [regionsVersion, setRegionsVersion] = useState(0)

  // The sampled regions change only when the user edits zones, so one read per
  // (re)connect is enough; on failure the grid layout stays.
  useEffect(() => {
    if (!live) return
    let cancelled = false
    fetchZoneRegions().then(
      (r) => {
        if (cancelled) return
        regions.current = r
        setRegionsVersion((v) => v + 1)
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
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const el = canvas.current
      const current = frame.current
      if (!el || current === drawn) return
      drawn = current
      const ctx = el.getContext('2d')
      if (!ctx) return
      const { rects, rows } = current ? layoutThumbnail(current, regions.current, COLUMNS) : { rects: [], rows: 0 }
      const width = COLUMNS * STEP - GAP
      const height = Math.max(1, Math.ceil(rows * STEP - GAP))
      if (el.width !== width || el.height !== height) {
        el.width = width
        el.height = height
      }
      ctx.clearRect(0, 0, width, height)
      for (const { x, y, w, h, zone } of rects) {
        const px = x * STEP
        const py = y * STEP
        const cw = Math.max(2, w * STEP - GAP)
        const ch = Math.max(2, h * STEP - GAP)
        ctx.fillStyle = `rgb(${byte(zone.r)} ${byte(zone.g)} ${byte(zone.b)})`
        ctx.fillRect(px, py, cw, ch)
        if (zone.error) {
          ctx.save()
          ctx.beginPath()
          ctx.rect(px, py, cw, ch)
          ctx.clip()
          ctx.strokeStyle = '#000'
          ctx.lineWidth = 3
          for (let d = -ch; d < cw + ch; d += 5) {
            ctx.beginPath()
            ctx.moveTo(px + d, py + ch)
            ctx.lineTo(px + d + ch, py)
            ctx.stroke()
          }
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1
          ctx.strokeRect(px + 0.5, py + 0.5, cw - 1, ch - 1)
          ctx.restore()
        }
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [frame, regionsVersion])

  return (
    <canvas
      ref={canvas}
      className={`zone-thumbnail${live ? '' : ' zone-thumbnail-stale'}`}
      aria-label="Preview of the lights"
      role="img"
    />
  )
}
