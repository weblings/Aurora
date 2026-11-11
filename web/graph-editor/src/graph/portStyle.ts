// How each port type looks (Aurora-d0hv): every socket is a circle, hue by domain
// (video, audio, light, numbers). Bulk types draw thicker wires, Trigger dashed.
// Hues validated on #1a1a1a with the dataviz validator (CVD, contrast).
export type PortStyle = { color: string; bulk: boolean; dashed: boolean }

const VIDEO = '#38c9a8'
const AUDIO = '#c58cf0'
const LIGHT = '#e5ad3c'
const NUMBER = '#9a9a9a'

const STYLES: Record<string, PortStyle> = {
  Image: { color: VIDEO, bulk: true, dashed: false },
  AudioBuffer: { color: AUDIO, bulk: true, dashed: false },
  AudioFeatures: { color: AUDIO, bulk: false, dashed: false },
  Frame: { color: LIGHT, bulk: true, dashed: false },
  Color: { color: LIGHT, bulk: false, dashed: false },
  Float: { color: NUMBER, bulk: false, dashed: false },
  Angle: { color: NUMBER, bulk: false, dashed: false },
  Trigger: { color: NUMBER, bulk: false, dashed: true },
}

const FALLBACK: PortStyle = STYLES.Float

export function portStyle(type: string): PortStyle {
  return STYLES[type] ?? FALLBACK
}

// What each port type means, from the catalog's portTypes (the server owns the
// text, Aurora-z6kw). Empty until the catalog loads.
let meanings: Record<string, string> = {}

export function setPortMeanings(list: { name: string; meaning: string }[]): void {
  meanings = Object.fromEntries(list.map((t) => [t.name, t.meaning]))
}

export function portMeaning(type: string): string | undefined {
  return meanings[type]
}

export const PORT_TYPES = Object.keys(STYLES)
