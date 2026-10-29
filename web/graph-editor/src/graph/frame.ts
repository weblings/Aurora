// One `preview` event from GET /api/graph/preview, and how its zones are drawn.

import type { PreviewIssue } from './problems'

export type PreviewZone = { id: number; r: number; g: number; b: number; error: boolean }
export type PreviewOutput = { output: string; zones: PreviewZone[] }
export type PreviewFrame = { outputs: PreviewOutput[]; errors: PreviewIssue[] }

// Tolerant: a payload that is not shaped as expected gives null, never a throw.
export function parseFrame(data: string): PreviewFrame | null {
  let raw: unknown
  try {
    raw = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const { outputs, errors } = raw as { outputs?: unknown; errors?: unknown }
  if (!Array.isArray(outputs)) return null
  return {
    outputs: outputs.flatMap((o): PreviewOutput[] => {
      if (typeof o?.output !== 'string' || !Array.isArray(o.zones)) return []
      const zones = (o.zones as Record<string, unknown>[]).map((z) => ({
        id: Number(z.id),
        r: Number(z.r),
        g: Number(z.g),
        b: Number(z.b),
        error: z.error === true,
      }))
      return [{ output: o.output, zones }]
    }),
    errors: Array.isArray(errors)
      ? errors.flatMap((e): PreviewIssue[] =>
          typeof e?.message === 'string' ? [{ output: String(e.output ?? ''), node: String(e.node ?? ''), message: e.message }] : [],
        )
      : [],
  }
}

// Channel 0..1, as the server sends, to a CSS byte.
export function byte(v: number): number {
  return Math.round(Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0)) * 255)
}

// Where each zone of the active output samples the screen, from GET /api/zones.
export type ZoneRegion = { id: number; x0: number; y0: number; x1: number; y1: number }
export type ZoneRegions = { output: string; zones: ZoneRegion[] }

// Tolerant like parseFrame: a zone without usable uvs is skipped, so it falls
// back to the grid. Anything not shaped as expected gives null.
export function parseZoneRegions(raw: unknown): ZoneRegions | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { outputName, zones } = raw as { outputName?: unknown; zones?: unknown }
  if (typeof outputName !== 'string' || !Array.isArray(zones)) return null
  const pair = (v: unknown): [number, number] | null =>
    Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
      ? [v[0], v[1]]
      : null
  return {
    output: outputName,
    zones: zones.flatMap((z): ZoneRegion[] => {
      const min = pair(z?.uvs?.min)
      const max = pair(z?.uvs?.max)
      if (typeof z?.zoneId !== 'number' || !min || !max) return []
      const [x0, y0] = [Math.min(min[0], max[0]), Math.min(min[1], max[1])]
      const [x1, y1] = [Math.max(min[0], max[0]), Math.max(min[1], max[1])]
      if (x1 <= x0 || y1 <= y0) return []
      return [{ id: z.zoneId, x0, y0, x1, y1 }]
    }),
  }
}

// A zone drawn as a rectangle, in cell units relative to the thumbnail's top-left.
export type Rect = { x: number; y: number; w: number; h: number; zone: PreviewZone }

// The screen-region panel is this many cells wide and `SCREEN_ROWS` tall (16:9-ish).
export const SCREEN_ROWS = 4.5

// The output named by `regions` is drawn at its zones' sampled regions in a
// panel at the top; zones of it without a region, and every other output, keep
// the wrapped grid below.
export function layoutThumbnail(
  frame: PreviewFrame,
  regions: ZoneRegions | null,
  columns: number,
): { rects: Rect[]; rows: number; panelRows: number } {
  const byId = new Map(regions?.zones.map((r) => [r.id, r]))
  const placed: Rect[] = []
  const rest: PreviewOutput[] = []
  for (const out of frame.outputs) {
    if (!regions || out.output !== regions.output) {
      rest.push(out)
      continue
    }
    const loose: PreviewZone[] = []
    for (const zone of out.zones) {
      const r = byId.get(zone.id)
      if (!r) loose.push(zone)
      else
        placed.push({
          x: Math.max(0, r.x0) * columns,
          y: Math.max(0, r.y0) * SCREEN_ROWS,
          w: (Math.min(1, r.x1) - Math.max(0, r.x0)) * columns,
          h: (Math.min(1, r.y1) - Math.max(0, r.y0)) * SCREEN_ROWS,
          zone,
        })
    }
    if (loose.length) rest.push({ output: out.output, zones: loose })
  }
  const panelRows = placed.length ? SCREEN_ROWS : 0
  const grid = layoutCells({ outputs: rest, errors: [] }, columns)
  const rects = [
    ...placed,
    ...grid.cells.map((c): Rect => ({ x: c.x, y: c.y + (panelRows ? panelRows + 0.25 : 0), w: 1, h: 1, zone: c.zone })),
  ]
  return { rects, rows: grid.rows + (panelRows ? panelRows + (grid.rows ? 0.25 : 0) : 0), panelRows }
}

// Rows of cells: one row per output, wrapped to `columns` cells.
export type Cell = { x: number; y: number; zone: PreviewZone }

export function layoutCells(frame: PreviewFrame, columns: number): { cells: Cell[]; rows: number } {
  const cells: Cell[] = []
  let row = 0
  for (const out of frame.outputs) {
    out.zones.forEach((zone, i) => cells.push({ x: i % columns, y: row + Math.floor(i / columns), zone }))
    row += Math.max(1, Math.ceil(out.zones.length / columns))
  }
  return { cells, rows: row }
}
