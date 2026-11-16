import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchHueAreaName, fetchPreviewLayouts } from './api'
import { readAreaCache, shownLayout, switchAnnouncement, type Layout, type LayoutEnv, type Pick } from './graph/previewLayout'
import type { HostSnapshot } from './graph/hostState'

const PICK_KEY = 'aurora.graphEditor.previewPick'

// The user's pick lasts the session (a reload keeps it); storage can throw, so it then starts on the lights.
function readPick(): Pick {
  try {
    const kept = sessionStorage.getItem(PICK_KEY)
    return kept === 'room' || kept === 'basic' ? kept : null
  } catch {
    return null
  }
}

// The shell's output_link row (core's OutputLinkMonitor) is the one fact that the lights cannot be reached.
export function lightsUnreachable(host: HostSnapshot): boolean {
  return host.conditions.some((c) => c.source === 'output_link') || host.errors.some((e) => e.source === 'output_link')
}

// Which layout the Preview island shows (graph/previewLayout.ts holds the rules). A layout picked for the
// user (no lights, a running test) is derived, never stored, so it goes back by itself when the lights
// return; only the user's own pick is kept. Automatic switches are announced, picks are not.
export function usePreviewLayout({ noLights, testing, announce }: { noLights: boolean; testing: boolean; announce: (text: string) => void }) {
  const [pick, setPick] = useState<Pick>(readPick)
  const [savedZones, setSavedZones] = useState(0)
  const [area, setArea] = useState<string | null>(() => readAreaCache()?.name ?? null)

  // What Sim: your room could draw, read at load and when the lights go or return.
  useEffect(() => {
    let cancelled = false
    void fetchPreviewLayouts().then((l) => {
      if (!cancelled && l) setSavedZones(l.savedZones)
    })
    return () => {
      cancelled = true
    }
  }, [noLights])

  // The area name, read at load and when the lights return; the cached one stands in while the bridge is down.
  useEffect(() => {
    if (noLights) return
    let cancelled = false
    void fetchHueAreaName().then((name) => {
      if (!cancelled && name) setArea(name)
    })
    return () => {
      cancelled = true
    }
  }, [noLights])

  const env: LayoutEnv = { noLights, testing, pick, savedZones }
  const layout: Layout = shownLayout(env)

  const said = useRef(env)
  const announceRef = useRef(announce)
  announceRef.current = announce
  const areaRef = useRef(area)
  areaRef.current = area
  useEffect(() => {
    const text = switchAnnouncement(said.current, env, areaRef.current)
    said.current = env
    if (text) announceRef.current(text)
    // `env` is rebuilt every render; its parts are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noLights, testing, pick, savedZones])

  const choose = useCallback((next: Layout) => {
    const value: Pick = next === 'lights' ? null : next
    setPick(value)
    try {
      if (value) sessionStorage.setItem(PICK_KEY, value)
      else sessionStorage.removeItem(PICK_KEY)
    } catch {
      // Not kept; the pick still applies until reload.
    }
  }, [])

  return { layout, area, savedZones, choose }
}
