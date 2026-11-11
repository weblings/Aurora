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

// The single active output's zones, in order, for the Zones island. One output
// is taken as canonical: the one GET /api/zones names, else the frame's first.
// No screen mapping: zone regions overlap, so a mapped box would hide zones.
export function activeZones(frame: PreviewFrame, activeOutput: string | null | undefined): PreviewZone[] {
  const out = frame.outputs.find((o) => o.output === activeOutput) ?? frame.outputs[0]
  return out ? out.zones : []
}
