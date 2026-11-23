import { useLayoutEffect, useRef, useState } from 'react'
import { halfDashes, halfPath } from './dashFit'

const RADIUS = 16
const DASH = 22
const GAP = 14
// How far a corner's dash runs onto each side past its arc.
const TAIL = DASH / 2

// The dashed outline of the graph file drop hint (Aurora-dzsd): two SVG paths, the right half of a rounded rect and its mirror,
// with dashes fitted to the measured size: one dash wraps each corner, so all four corners match.
// The stroke is centred on the box edge, so half of it falls outside.
export function DropFrame() {
  const svg = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = svg.current
    if (!el) return
    const read = () => {
      const box = el.getBoundingClientRect()
      setSize({ w: box.width, h: box.height })
    }
    read()
    const watch = new ResizeObserver(read)
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const dashes = size ? halfDashes(size.w, size.h, RADIUS, DASH, GAP, TAIL) : null
  return (
    <svg className="editor-drop-frame" ref={svg} focusable="false">
      {size ? (
        <>
          <path d={halfPath(size.w, size.h, RADIUS)} strokeDasharray={dashes?.join(' ')} />
          <path
            d={halfPath(size.w, size.h, RADIUS)}
            strokeDasharray={dashes?.join(' ')}
            transform={`translate(${size.w} 0) scale(-1 1)`}
          />
        </>
      ) : null}
    </svg>
  )
}
