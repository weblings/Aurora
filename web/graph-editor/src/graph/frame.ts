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
