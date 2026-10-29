import { useEffect, useRef, type MutableRefObject } from 'react'
import { byte, layoutCells, type PreviewFrame } from './graph/frame'

const COLUMNS = 8
const CELL = 14
const GAP = 2

type Props = {
  frame: MutableRefObject<PreviewFrame | null>
  // Dimmed while the stream is not live, so a held frame does not pass for fresh.
  live: boolean
}

// The corner zone-map thumbnail: one cell per zone, one block of rows per
// output. It redraws from `frame` on animation frames, so preview events never
// pass through React state. A zone the pipeline flagged as an error is drawn
// with diagonal stripes in the zone's own colour, not just a hue change.
export function ZoneThumbnail({ frame, live }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)

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
      const { cells, rows } = current ? layoutCells(current, COLUMNS) : { cells: [], rows: 0 }
      const width = COLUMNS * (CELL + GAP) - GAP
      const height = Math.max(1, rows) * (CELL + GAP) - GAP
      if (el.width !== width || el.height !== height) {
        el.width = width
        el.height = height
      }
      ctx.clearRect(0, 0, width, height)
      for (const { x, y, zone } of cells) {
        const px = x * (CELL + GAP)
        const py = y * (CELL + GAP)
        ctx.fillStyle = `rgb(${byte(zone.r)} ${byte(zone.g)} ${byte(zone.b)})`
        ctx.fillRect(px, py, CELL, CELL)
        if (zone.error) {
          ctx.save()
          ctx.beginPath()
          ctx.rect(px, py, CELL, CELL)
          ctx.clip()
          ctx.strokeStyle = '#000'
          ctx.lineWidth = 3
          for (let d = -CELL; d < CELL * 2; d += 5) {
            ctx.beginPath()
            ctx.moveTo(px + d, py + CELL)
            ctx.lineTo(px + d + CELL, py)
            ctx.stroke()
          }
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1
          ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1)
          ctx.restore()
        }
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [frame])

  return (
    <canvas
      ref={canvas}
      className={`zone-thumbnail${live ? '' : ' zone-thumbnail-stale'}`}
      aria-label="Preview of the lights"
      role="img"
    />
  )
}
