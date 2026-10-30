// How each port type looks (Aurora-ex8z): hue by domain, shape by data kind.
// Hues validated on #1a1a1a with the dataviz validator (CVD, contrast).
export type PortShape = 'square' | 'circle' | 'diamond' | 'triangle'

export type PortStyle = { color: string; shape: PortShape; bulk: boolean; dashed: boolean }

const VIDEO = '#38c9a8'
const AUDIO = '#c58cf0'
const LIGHT = '#e5ad3c'
const NUMBER = '#9a9a9a'

const STYLES: Record<string, PortStyle> = {
  Image: { color: VIDEO, shape: 'square', bulk: true, dashed: false },
  AudioBuffer: { color: AUDIO, shape: 'square', bulk: true, dashed: false },
  AudioFeatures: { color: AUDIO, shape: 'circle', bulk: false, dashed: false },
  Frame: { color: LIGHT, shape: 'square', bulk: true, dashed: false },
  Color: { color: LIGHT, shape: 'circle', bulk: false, dashed: false },
  Float: { color: NUMBER, shape: 'circle', bulk: false, dashed: false },
  Angle: { color: NUMBER, shape: 'diamond', bulk: false, dashed: false },
  Trigger: { color: NUMBER, shape: 'triangle', bulk: false, dashed: true },
}

const FALLBACK: PortStyle = STYLES.Float

export function portStyle(type: string): PortStyle {
  return STYLES[type] ?? FALLBACK
}

export const PORT_TYPES = Object.keys(STYLES)
