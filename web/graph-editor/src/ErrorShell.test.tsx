import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorShell, ShellBanner, type ShellBannerProps } from './ErrorShell'
import { baselineSnapshot, collapsibleKeys, orderRows } from '../../ui/shellRows.js'
import type { HostCondition, HostError } from './graph/hostState'
import type { PairingRequest } from './useHostState'

// The Dashboard's shell (web/ui/shell.js) is the reference. Its banner is drawn with the real class
// against a stub slot, and the editor's component must produce the same markup for the same rows.
const shellPath = fileURLToPath(new URL('../../ui/shell.js', import.meta.url))
const { App } = (await import(/* @vite-ignore */ shellPath)) as { App: new (opts: object) => ShellApp }

type ShellApp = {
  platform: string
  currentRouteId: string
  lightTestHolder: unknown
  _collapsed: string[] | null
  pendingPairings: unknown[]
  _updateHostState: (result: object) => void
  _bannerHtml: () => string
  _stopLightTestTimer: () => void
}

type Case = {
  name: string
  hostState?: string
  platform?: string
  errors?: HostError[]
  conditions?: HostCondition[]
  pairings?: PairingRequest[]
  test?: { active: boolean; confirmRemainingMs: number | null; holder: { session: string; client: string | null } }
  // Start open: the user opened (or arrivals did) after the baseline collapsed 2+ rows.
  open?: boolean
  // Start collapsed with this snapshot of the rows' keys even for a lone row.
  userCollapsed?: boolean
  // Row keys mid-pulse (Aurora-9hqa.2): the editor draws data-new on them.
  pulsing?: string[]
}

// The shell's markup, as the page would hold it in #shell-banner-slot (the page draws _bannerHtml()
// with a keyed patch; the string is the same).
function dashboardMarkup(c: Case): string {
  const slot = { innerHTML: '', querySelector: () => null }
  const real = globalThis.document
  ;(globalThis as { document: unknown }).document = { getElementById: (id: string) => (id === 'shell-banner-slot' ? slot : null) }
  try {
    const app = new App({})
    app.platform = c.platform ?? ''
    app.currentRouteId = 'dashboard'
    app.pendingPairings = c.pairings ?? []
    app._updateHostState({ state: c.hostState ?? 'running', errors: c.errors ?? [], conditions: c.conditions ?? [], test: c.test ?? { active: false } })
    if (c.open) app._collapsed = null
    if (c.userCollapsed) app._collapsed = collapsibleKeys(orderRows(rowsInput(c)))
    app._stopLightTestTimer()
    return app._bannerHtml()
  } finally {
    ;(globalThis as { document: unknown }).document = real
  }
}

function lightTestOf(c: Case) {
  return c.test?.active ? { holder: c.test.holder, endsAtMs: c.test.confirmRemainingMs === null ? null : Date.now() + c.test.confirmRemainingMs } : null
}

function rowsInput(c: Case) {
  return { conditions: c.conditions ?? [], errors: c.errors ?? [], lightTest: lightTestOf(c), pairings: c.pairings ?? [] }
}

function editorMarkup(c: Case): string {
  const rows = orderRows(rowsInput(c))
  const props: ShellBannerProps = {
    hostState: c.hostState ?? 'running',
    platform: c.platform ?? '',
    conditions: c.conditions ?? [],
    errors: c.errors ?? [],
    lightTest: lightTestOf(c),
    pairings: c.pairings ?? [],
    onDecidePairing: () => {},
    snapshot: c.userCollapsed ? collapsibleKeys(rows) : c.open ? null : baselineSnapshot(rows),
    onSnapshotChange: () => {},
    onRetry: () => {},
    onDismiss: () => {},
    onStopTest: () => {},
    pulsing: c.pulsing,
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
const phone: PairingRequest = { ref: 'r1', name: 'Phone <b>', scope: 'admin', code: 'K7Q2X' }
const agent: PairingRequest = { ref: 'r2', name: 'aurora-mcp on laptop', scope: 'apply', code: 'ABCDE', from: '192.168.0.51' }
const cases: Case[] = [
  { name: 'a lone pairing request: a browser, no access line, open', pairings: [phone] },
  { name: 'an agent request names its access and where it came from', pairings: [agent] },
  { name: 'two requests start collapsed: two notices', pairings: [phone, agent] },
  { name: 'two requests open, with Approve and Deny', pairings: [phone, agent], open: true },
  { name: 'a request collapsed by the user', pairings: [phone], userCollapsed: true },
  { name: 'a test, a request and an error: notices first, one error', open: true, pairings: [phone], errors: [reload], test: { active: true, confirmRemainingMs: 90_000, holder: { session: 'a', client: 'mcp' } } },
  { name: 'a request and an error, collapsed: 1 notice 1 error', pairings: [phone], errors: [reload], userCollapsed: true },
  { name: 'one error on a running host: Retry and the dismiss X', errors: [reload] },
  { name: 'one error on a paused host: Retry, no X', hostState: 'paused', errors: [startup] },
  { name: 'an error with retry false has no Retry', errors: [effect] },
  { name: 'a declined screen share is worded plainly', errors: [{ source: 'reload', message: 'screen_share_declined: portal said no', id: 1 }] },
  { name: 'two errors start collapsed: the counts bar', errors: [reload, effect] },
  { name: 'errors are drawn newest id first, whatever order they arrive in', errors: [effect, reload], open: true },
  { name: 'two errors open: rows and Show less', errors: [reload, effect], open: true },
  { name: 'a condition and an error', errors: [reload], conditions: [{ source: 'local_network', message: 'x' }], open: true },
  { name: 'an unknown condition shows its message', conditions: [{ source: 'other', message: 'Something <b>is</b> off' }] },
  { name: 'a macOS permission error on a Mac', platform: 'mac', errors: [{ source: 'reload', message: 'permission_denied: no', id: 1 }] },
  { name: 'the audio permission row', platform: 'mac', errors: [{ source: 'audio_permission', message: 'silent', id: 1 }] },
  { name: 'an agent testing, with a countdown', test: { active: true, confirmRemainingMs: 90_000, holder: { session: 'a', client: 'mcp' } } },
  { name: 'an editor tab testing live: no countdown', test: { active: true, confirmRemainingMs: null, holder: { session: 'e', client: null } } },
  { name: 'a lone error the user collapsed', errors: [reload], userCollapsed: true },
  { name: 'a lone light test the user collapsed: a notice only', userCollapsed: true, test: { active: true, confirmRemainingMs: 90_000, holder: { session: 'a', client: 'mcp' } } },
  { name: 'a test and a condition collapsed: one notice, one error', conditions: [{ source: 'other', message: 'x' }], test: { active: true, confirmRemainingMs: 90_000, holder: { session: 'a', client: 'mcp' } } },
  { name: 'a test above two open errors', open: true, errors: [reload, effect], test: { active: true, confirmRemainingMs: 5_000, holder: { session: 'a', client: 'mcp' } } },
  { name: 'three errors and a test, collapsed', errors: [reload, effect, startup], test: { active: true, confirmRemainingMs: null, holder: { session: 'e', client: null } } },
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

  // data-new is state (the pulse), not markup: it is on no row at the baseline, it is never in the
  // Dashboard's html or its patch signature, and with it taken away the two pages are still equal.
  it('data-new is on the rows that pulse and nowhere else; without it the markup is unchanged', () => {
    for (const c of cases) {
      const rows = orderRows(rowsInput(c))
      const reference = normal(dashboardMarkup(c))
      expect(reference).not.toContain('data-new')
      expect(normal(editorMarkup(c))).not.toContain('data-new')
      const all = normal(editorMarkup({ ...c, pulsing: [...rows.map((row) => row.key), 'toggle'] }))
      expect(all.replaceAll(' data-new=""', '')).toBe(reference)
      // Every drawn row carries it; the toggle never does.
      expect((all.match(/data-new=""/g) ?? []).length).toBe(reference.includes('aria-expanded="false"') ? 0 : rows.length)
      expect(all).not.toMatch(/<button[^>]*data-new/)
    }
  })

  it('only the named row pulses', () => {
    const c: Case = { name: 'two open', errors: [reload, effect], open: true, pulsing: ['error:effect:' + effect.message] }
    const out = normal(editorMarkup(c))
    expect((out.match(/data-new=""/g) ?? []).length).toBe(1)
    expect(out).toMatch(/<div class="shell-banner-row" data-key="error:effect:[^"]*" data-new="">/)
  })

  it('the ErrorShell draws no pulse on its first render (the baseline)', () => {
    const noop = () => {}
    const out = renderToStaticMarkup(<ErrorShell hostState="running" platform="" conditions={[]} errors={[reload]} lightTest={null} hasReplied unreachable={false} onRetry={noop} onDismiss={noop} onStopTest={noop} />)
    expect(out).toContain('shell-banner-row')
    expect(out).not.toContain('data-new')
  })

  it('shows nothing when there is nothing to say', () => {
    expect(editorMarkup({ name: 'none' })).toBe('')
    expect(dashboardMarkup({ name: 'none' })).toBe('')
  })
})

describe('ErrorShell page parts', () => {
  const noop = () => {}
  const props = { hostState: 'running', platform: '', conditions: [], errors: [], lightTest: null, hasReplied: true, onRetry: noop, onDismiss: noop, onStopTest: noop }

  it('the takeover is the Dashboard overlay: heading only, no button', () => {
    const html = renderToStaticMarkup(<ErrorShell {...props} unreachable={true} errors={[reload]} />)
    expect(normal(html)).toBe('<div id="shell-banner-slot"></div><div id="shell-overlay-slot"><div class="overlay"><div class="overlay-scrim"></div><div class="overlay-panel"><h2>Aurora has stopped</h2></div></div></div>')
  })

  it('editor-supplied rows use the same row markup, with no Retry and no X', () => {
    const note = "Couldn't check your last edit."
    const html = normal(renderToStaticMarkup(<ErrorShell {...props} unreachable={false} notes={[note]} />))
    expect(html).toContain('<div id="shell-banner-slot"><div class="shell-banner"><div class="shell-banner-inner">')
    expect(html).toContain(`<div class="shell-banner-row" data-key="note:${note}"><div class="shell-banner-content"><p class="status-text status-text-error"><span class="shell-mark shell-mark-error" aria-hidden="true"></span> ${note}</p></div></div>`)
    expect(html).not.toContain('Retry')
    expect(html).not.toContain('shell-banner-dismiss')
  })

  it('the open-failure notes are rows too', () => {
    for (const note of ['Rainbow no longer exists.', "Rainbow's file can't be read.", "Couldn't open the editor."]) {
      const html = normal(renderToStaticMarkup(<ErrorShell {...props} unreachable={false} notes={[note]} />))
      expect(html).toContain(`<span class="shell-mark shell-mark-error" aria-hidden="true"></span> ${note}</p>`)
      expect(html).not.toContain('Retry')
    }
  })

  it('a host row and an editor row together are two errors, and start collapsed', () => {
    const html = renderToStaticMarkup(<ErrorShell {...props} unreachable={false} errors={[reload]} notes={['x']} />)
    expect(html).toContain('2 errors')
    expect(html).toContain('aria-expanded="false"')
  })

  it('draws nothing before the first reply', () => {
    const html = renderToStaticMarkup(<ErrorShell {...props} hasReplied={false} unreachable={false} errors={[reload]} />)
    expect(html).toBe('<div id="shell-banner-slot"></div><div id="shell-overlay-slot"></div>')
  })
})

// The interactive collapse state (toggle, re-open on an arrival, recovery) needs a DOM, which this
// suite does not have: its rules are unit-tested in web/ui/shellRows.test.mjs and shell.test.mjs and
// driven in a browser by tools/browser-check graph-editor:error-shell.
describe('ErrorShell baseline', () => {
  const noop = () => {}
  const base = { hostState: 'running', platform: '', conditions: [] as HostCondition[], errors: [] as HostError[], lightTest: null, hasReplied: true, unreachable: false, onRetry: noop, onDismiss: noop, onStopTest: noop }
  const html = (extra: Partial<React.ComponentProps<typeof ErrorShell>>) => normal(renderToStaticMarkup(<ErrorShell {...base} {...extra} />))

  it('2+ rows start collapsed: the counts bar alone', () => {
    const out = html({ errors: [reload, effect] })
    expect(out).toContain('id="shell-banner-toggle" aria-expanded="false"')
    expect(out).toContain('2 errors')
    expect(out).not.toContain('class="shell-banner-row"')
  })

  it('a lone row starts open, with the toggle after it', () => {
    const out = html({ errors: [reload] })
    expect(out).toContain('shell-banner-row')
    expect(out.indexOf('shell-banner-row')).toBeLessThan(out.indexOf('shell-banner-toggle'))
    expect(out).toContain('aria-expanded="true"')
    expect(out).toContain('Show less')
  })

  it('pairing requests are notices inside the collapse: a request and an error start collapsed', () => {
    const out = html({ errors: [reload], pairings: [phone] })
    expect(out).toContain('aria-expanded="false"')
    expect(out).toContain('1 notice</span><span class="shell-count shell-count-error">')
    expect(out).not.toContain('shell-pairing-approve')
  })

  it('a lone request is open with Approve and Deny, the circled-info mark and a toggle after it', () => {
    const out = html({ pairings: [phone] })
    expect(out).toContain('id="shell-pairing-approve-r1" data-action="approve" data-key="pairing:r1"')
    expect(out).toContain('id="shell-pairing-deny-r1" data-action="deny" data-key="pairing:r1"')
    expect(out).toContain('shell-pairing-title"><span class="shell-mark shell-mark-info" aria-hidden="true"></span> Pair a device')
    expect(out.indexOf('shell-pairing-approve')).toBeLessThan(out.indexOf('shell-banner-toggle'))
  })

  it('a notice and an error: notices first, singular words', () => {
    const out = html({ errors: [reload], lightTest: { holder: null, endsAtMs: null } })
    expect(out).toContain('1 notice</span><span class="shell-count shell-count-error"><span class="shell-mark shell-mark-error" aria-hidden="true"></span> 1 error')
  })
})
