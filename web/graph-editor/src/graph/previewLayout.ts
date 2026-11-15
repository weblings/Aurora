// Which layout the Preview island shows (Aurora-u8jx.6.1), and the words around it. Pure, so the
// rules are tested apart from React. Sim layouts are editor-preview only: the Dashboard and the live
// pipeline never use them.

export type Layout = 'lights' | 'room' | 'basic'
// What the user picked: Lights is no pick, so it follows the lights.
export type Pick = 'room' | 'basic' | null

export type LayoutEnv = {
  // No reachable lights (the shell's output_link row is up).
  noLights: boolean
  // This tab's own light test is running.
  testing: boolean
  pick: Pick
  // Zones in the saved zone map; 0 leaves Sim: your room out.
  savedZones: number
}

// A test always shows the real lights. Else the user's pick (a stale room pick with no saved map
// falls through), else the lights, else the best sim for what is on disk.
export function shownLayout(env: LayoutEnv): Layout {
  if (env.testing) return 'lights'
  if (env.pick === 'basic') return 'basic'
  if (env.pick === 'room' && env.savedZones > 0) return 'room'
  if (!env.noLights) return 'lights'
  return env.savedZones > 0 ? 'room' : 'basic'
}

const NAMES: Record<Layout, string> = { lights: 'Lights', room: 'Sim: your room', basic: 'Sim: basic room' }

// The real layout is named after the Hue entertainment area when it is known.
export function layoutName(layout: Layout, area: string | null): string {
  return layout === 'lights' && area ? area : NAMES[layout]
}

// The layout menu's rows, in order. Sim: your room is left out with no saved map.
export function layoutChoices(savedZones: number): Layout[] {
  return savedZones > 0 ? ['lights', 'room', 'basic'] : ['lights', 'basic']
}

// The stream's `layout` query value; Lights is the default and sends none.
export function layoutQuery(layout: Layout): string | null {
  return layout === 'lights' ? null : layout
}

// What the Announcer says when the layout changed without the user choosing it (no lights, lights
// back, test start, test end). A pick the user made changes only `pick`, so it says nothing.
export function switchAnnouncement(prev: LayoutEnv, next: LayoutEnv, area: string | null): string | null {
  const before = shownLayout(prev)
  const after = shownLayout(next)
  if (before === after) return null
  let lead: string
  if (prev.testing !== next.testing) lead = next.testing ? 'Testing on your lights.' : 'Test ended.'
  else if (prev.noLights !== next.noLights) lead = next.noLights ? "Can't reach your lights." : 'Lights are back.'
  else return null
  return `${lead} Preview shows ${layoutName(after, area)}.`
}

// The Hue area name is cached so the real layout keeps its name while the bridge is down.
const AREA_KEY = 'aurora.graphEditor.hueArea'
export type AreaCache = { id: string; name: string }

export function readAreaCache(): AreaCache | null {
  try {
    const raw = JSON.parse(localStorage.getItem(AREA_KEY) ?? 'null') as Partial<AreaCache> | null
    return raw && typeof raw.id === 'string' && typeof raw.name === 'string' ? { id: raw.id, name: raw.name } : null
  } catch {
    return null
  }
}

export function writeAreaCache(cache: AreaCache): void {
  try {
    localStorage.setItem(AREA_KEY, JSON.stringify(cache))
  } catch {
    // Not kept; the name just is not there while the bridge is down.
  }
}
