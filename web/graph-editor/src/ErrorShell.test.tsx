import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorShell, ShellBanner, type ShellBannerProps } from './ErrorShell'
import type { HostCondition, HostError } from './graph/hostState'

// The Dashboard's shell (web/ui/shell.js) is the reference. Its banner is drawn with the real class
// against a stub slot, and the editor's component must produce the same markup for the same rows.
const shellPath = fileURLToPath(new URL('../../ui/shell.js', import.meta.url))
const { App } = (await import(/* @vite-ignore */ shellPath)) as { App: new (opts: object) => ShellApp }

type ShellApp = {
  platform: string
  currentRouteId: string
  lightTestHolder: unknown
  _bannerExpanded: boolean
  _updateHostState: (result: object) => void
  _stopLightTestTimer: () => void
}

type Case = {
  name: string
  hostState?: string
  platform?: string
  errors?: HostError[]
  conditions?: HostCondition[]
  test?: { active: boolean; confirmRemainingMs: number | null; holder: { session: string; client: string | null } }
  expanded?: boolean
}

// The shell's markup, as the page would hold it in #shell-banner-slot.
function dashboardMarkup(c: Case): string {
  const slot = { innerHTML: '', querySelector: () => null }
  const real = globalThis.document
  ;(globalThis as { document: unknown }).document = { getElementById: (id: string) => (id === 'shell-banner-slot' ? slot : null) }
  try {
    const app = new App({})
    app.platform = c.platform ?? ''
    app.currentRouteId = 'dashboard'
    app._bannerExpanded = c.expanded ?? false
    app._updateHostState({ state: c.hostState ?? 'running', errors: c.errors ?? [], conditions: c.conditions ?? [], test: c.test ?? { active: false } })
    app._stopLightTestTimer()
  } finally {
    ;(globalThis as { document: unknown }).document = real
  }
  return slot.innerHTML
}

function editorMarkup(c: Case): string {
  const props: ShellBannerProps = {
    hostState: c.hostState ?? 'running',
    platform: c.platform ?? '',
    conditions: c.conditions ?? [],
    errors: c.errors ?? [],
    lightTest: c.test?.active ? { holder: c.test.holder, endsAtMs: c.test.confirmRemainingMs === null ? null : Date.now() + c.test.confirmRemainingMs } : null,
    expanded: c.expanded ?? false,
    onExpandedChange: () => {},
    onRetry: () => {},
    onDismiss: () => {},
    onStopTest: () => {},
  }
  return renderToStaticMarkup(<ShellBanner {...props} />)
}

// Whitespace between tags is not markup; React writes style="a:b" and escapes ' as &#x27;.
function normal(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/style="([^"]*)"/g, (_m, css: string) => `style="${css.replace(/\s*:\s*/g, ':').replace(/;\s*$/, '')}"`)
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim()
}

const reload: HostError = { source: 'reload', message: 'no outputs paired', id: 4 }
const effect: HostError = { source: 'effect', message: "Couldn't switch to 'x'", id: 2, retry: false }
const startup: HostError = { source: 'startup', message: 'port in use' }
const cases: Case[] = [
  { name: 'one error on a running host: Retry and the dismiss X', errors: [reload] },
  { name: 'one error on a paused host: Retry, no X', hostState: 'paused', errors: [startup] },
  { name: 'an error with retry false has no Retry', errors: [effect] },
  { name: 'a declined screen share is worded plainly', errors: [{ source: 'reload', message: 'screen_share_declined: portal said no', id: 1 }] },
  { name: 'two problems collapse to the summary', errors: [reload, effect] },
  { name: 'two problems expanded: rows and Show less', errors: [reload, effect], expanded: true },
  { name: 'a condition and an error', errors: [reload], conditions: [{ source: 'local_network', message: 'x' }], expanded: true },
  { name: 'an unknown condition shows its message', conditions: [{ source: 'other', message: 'Something <b>is</b> off' }] },
  { name: 'a macOS permission error on a Mac', platform: 'mac', errors: [{ source: 'reload', message: 'permission_denied: no', id: 1 }] },
  { name: 'the audio permission row', platform: 'mac', errors: [{ source: 'audio_permission', message: 'silent', id: 1 }] },
  { name: 'an agent testing, with a countdown', test: { active: true, confirmRemainingMs: 90_000, holder: { session: 'a', client: 'mcp' } } },
  { name: 'an editor tab testing live: no countdown', test: { active: true, confirmRemainingMs: null, holder: { session: 'e', client: null } } },
  { name: 'a test above two collapsed problems', errors: [reload, effect], test: { active: true, confirmRemainingMs: 5_000, holder: { session: 'a', client: 'mcp' } } },
]

describe('ErrorShell markup matches web/ui/shell.js', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  for (const c of cases) {
    it(c.name, () => {
      const reference = normal(dashboardMarkup(c))
      expect(reference.length).toBeGreaterThan(0)
      expect(normal(editorMarkup(c))).toBe(reference)
    })
  }

  it('shows nothing when there is nothing to say', () => {
    expect(editorMarkup({ name: 'none' })).toBe('')
    expect(dashboardMarkup({ name: 'none' })).toBe('')
  })
})

describe('ErrorShell page parts', () => {
  const noop = () => {}
  const props = { hostState: 'running', platform: '', conditions: [], errors: [], lightTest: null, onRetry: noop, onDismiss: noop, onStopTest: noop }

  it('the takeover is the Dashboard overlay: heading only, no button', () => {
    const html = renderToStaticMarkup(<ErrorShell {...props} unreachable={true} errors={[reload]} />)
    expect(normal(html)).toBe('<div id="shell-banner-slot"></div><div id="shell-overlay-slot"><div class="overlay"><div class="overlay-scrim"></div><div class="overlay-panel"><h2>Aurora has stopped</h2></div></div></div>')
  })

  it('editor-supplied rows use the same row markup, with no Retry and no X', () => {
    const note = "Couldn't check your last edit."
    const html = normal(renderToStaticMarkup(<ErrorShell {...props} unreachable={false} notes={[note]} />))
    expect(html).toContain('<div id="shell-banner-slot"><div class="shell-banner"><div class="shell-banner-inner">')
    expect(html).toContain(`<div class="shell-banner-row"><div class="shell-banner-content"><p class="status-text status-text-error"><span class="warn-glyph" aria-hidden="true"></span> ${note}</p></div></div>`)
    expect(html).not.toContain('Retry')
    expect(html).not.toContain('shell-banner-dismiss')
  })

  it('the open-failure notes are rows too', () => {
    for (const note of ['Rainbow no longer exists.', "Rainbow's file can't be read.", "Couldn't open the editor."]) {
      const html = normal(renderToStaticMarkup(<ErrorShell {...props} unreachable={false} notes={[note]} />))
      expect(html).toContain(`<span class="warn-glyph" aria-hidden="true"></span> ${note}</p>`)
      expect(html).not.toContain('Retry')
    }
  })

  it('a host row and an editor row together are two problems', () => {
    const html = renderToStaticMarkup(<ErrorShell {...props} unreachable={false} errors={[reload]} notes={['x']} />)
    expect(html).toContain('2 problems')
  })
})
