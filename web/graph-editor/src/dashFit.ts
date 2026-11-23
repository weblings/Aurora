// A rounded rect's outline: four straight sides plus four quarter arcs.
export const roundedPerimeter = (w: number, h: number, r: number): number => 2 * (w + h) - 8 * r + 2 * Math.PI * r

// The right half of the outline, from top centre clockwise to bottom centre. The left half is this one
// mirrored, so both sides match exactly.
export const halfPath = (w: number, h: number, r: number): string =>
  `M ${w / 2} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${w / 2}`

// The dasharray for that half path. One dash wraps each corner (its arc plus `tail` on both sides), the
// stretches between are fitted with a whole number of dashes and gaps, and the path starts and ends on half
// a gap so the two mirrored halves meet on a full one. Null when a stretch is too short to fit a gap.
export function halfDashes(w: number, h: number, r: number, dash: number, gap: number, tail: number): number[] | null {
  const arc = (Math.PI * r) / 2
  const corner = 2 * tail + arc
  const fit = (room: number, lead: number) => {
    const m = Math.max(0, Math.round((room - lead) / (dash + gap)))
    return { m, k: room / (lead + m * (dash + gap)) }
  }
  const across = w / 2 - r - tail
  const down = h - 2 * r - 2 * tail
  if (across < gap / 2 || down < gap) return null
  const top = fit(across, gap / 2)
  const side = fit(down, gap)
  const pair = (m: number, k: number) => Array.from({ length: m }, () => [dash * k, gap * k]).flat()
  const flip = (m: number, k: number) => Array.from({ length: m }, () => [gap * k, dash * k]).flat()
  return [
    0, (gap / 2) * top.k, ...pair(top.m, top.k), corner,
    gap * side.k, ...pair(side.m, side.k), corner,
    ...flip(top.m, top.k), (gap / 2) * top.k,
  ]
}
