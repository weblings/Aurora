import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ErrorShell, ShellBanner, type ShellBannerProps } from './ErrorShell'
import { baselineSnapshot, collapsibleKeys, orderRows } from '../../ui/shellRows.js'
import type { HostCondition, HostError } from './graph/hostState'
import type { PairingRequest } from './useHostState'

// The Dashboard (web/ui/shell.js) feeds this same component through the islands entry (Aurora-4nqt.4), so
// these tests hold the rows' words, ids and keys, the collapse layout and the pulse on their own.

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

// What a user gets from a render: the words, the ids and keys of the controls, the dismiss buttons and
// the error and notice marks.
function facts(full: string) {
  const dismissButton = /<button[^>]*aria-label="Dismiss"[^>]*>.*?<\/button>/g
  const html = full.replace(dismissButton, '').replace(/&#x27;|&#39;/g, "'")
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;| /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const attrs = (re: RegExp) => [...html.matchAll(re)].map((m) => m[1]).sort()
  return {
    text,
    ids: attrs(/ id="([^"]+)"/g).filter((id) => !id.startsWith('react-aria')),
    keys: attrs(/ data-key="([^"]+)"/g),
    actions: attrs(/ data-action="([^"]+)"/g),
    dismisses: (full.match(dismissButton) ?? []).length,
    errorMarks: (html.match(/shell-mark-error|data-tone="error"/g) ?? []).length,
    noticeMarks: (html.match(/shell-mark-info|data-tone="notice"/g) ?? []).length,
  }
}

const reload: HostError = { source: 'reload', message: 'no outputs paired', id: 4 }
const effect: HostError = { source: 'effect', message: "Couldn't switch to 'x'", id: 2, retry: false }
const startup: HostError = { source: 'startup', message: 'port in use' }
const phone: PairingRequest = { ref: 'r1', name: 'Phone <b>', scope: 'admin', code: 'K7Q2X' }
const agent: PairingRequest = { ref: 'r2', name: 'aurora-mcp on laptop', scope: 'apply', code: 'ABCDE', from: '192.168.0.51' }
const testOnce = { active: true, confirmRemainingMs: 90_000, holder: { session: 'a', client: 'mcp' } }
const testLive = { active: true, confirmRemainingMs: null, holder: { session: 'e', client: null } }

// What each case must say and offer, in the words the Dashboard has always used.
type Expect = { says?: string[]; lacks?: string[]; ids?: string[]; dismisses?: number; errorMarks?: number; noticeMarks?: number; actions?: string[] }
const cases: [Case, Expect][] = [
  [{ name: 'a lone pairing request: a browser, no access line, open', pairings: [phone] }, { says: ['Pair a device with Aurora?', 'Device: Phone <b>', 'Code: K7Q2X', 'Approve only if the device shows the same code.'], lacks: ['Access:', 'From:'], ids: ['shell-pairing-approve-r1', 'shell-pairing-deny-r1'], actions: ['approve', 'deny'], noticeMarks: 1 }],
  [{ name: 'an agent request names its access and where it came from', pairings: [agent] }, { says: ['Device: aurora-mcp on laptop', 'From: 192.168.0.51', 'Access: Apply. Change effects and test on the lights, not settings.'] }],
  [{ name: 'two requests start collapsed: two notices', pairings: [phone, agent] }, { says: ['2 notices'], lacks: ['K7Q2X'], noticeMarks: 1 }],
  [{ name: 'two requests open, with Approve and Deny', pairings: [phone, agent], open: true }, { says: ['Show less', 'K7Q2X', 'ABCDE'], ids: ['shell-pairing-approve-r1', 'shell-pairing-deny-r2'] }],
  [{ name: 'a request collapsed by the user', pairings: [phone], userCollapsed: true }, { says: ['1 notice'], lacks: ['K7Q2X'] }],
  [{ name: 'a test, a request and an error: notices first, one error', open: true, pairings: [phone], errors: [reload], test: { ...testOnce } }, { says: ['An agent is testing an effect on the lights.', 'Pair a device with Aurora?', "Saved, but couldn't apply: no outputs paired"], ids: ['shell-light-test-stop', 'shell-banner-retry-reload'], dismisses: 1, noticeMarks: 2, errorMarks: 1 }],
  [{ name: 'a request and an error, collapsed: 1 notice 1 error', pairings: [phone], errors: [reload], userCollapsed: true }, { says: ['1 notice', '1 error'], noticeMarks: 1, errorMarks: 1 }],
  [{ name: 'one error on a running host: Retry and the dismiss X', errors: [reload] }, { says: ["Saved, but couldn't apply: no outputs paired", 'Show less'], ids: ['shell-banner-retry-reload'], actions: ['retry', 'toggle'], dismisses: 1 }],
  [{ name: 'one error on a paused host: Retry, no X', hostState: 'paused', errors: [startup] }, { says: ["Couldn't start: port in use"], ids: ['shell-banner-retry-startup'], dismisses: 0 }],
  [{ name: 'an error with retry false has no Retry', errors: [effect] }, { says: ["Couldn't switch to 'x'"], lacks: ['Retry'], dismisses: 1 }],
  [{ name: 'a declined screen share is worded plainly', errors: [{ source: 'reload', message: 'screen_share_declined: portal said no', id: 1 }] }, { lacks: ['portal said no'] }],
  [{ name: 'two errors start collapsed: the counts bar', errors: [reload, effect] }, { says: ['2 errors'], lacks: ['no outputs paired'], errorMarks: 1 }],
  [{ name: 'errors are drawn newest id first, whatever order they arrive in', errors: [effect, reload], open: true }, { says: ["Couldn't switch to 'x'"] }],
  [{ name: 'two errors open: rows and Show less', errors: [reload, effect], open: true }, { says: ['no outputs paired', "Couldn't switch to 'x'", 'Show less'], dismisses: 2, errorMarks: 2 }],
  [{ name: 'a condition and an error', errors: [reload], conditions: [{ source: 'local_network', message: 'x' }], open: true }, { says: ['reach devices'], errorMarks: 2 }],
  [{ name: 'an unknown condition shows its message', conditions: [{ source: 'other', message: 'Something <b>is</b> off' }] }, { says: ['Something <b>is</b> off'], lacks: ['Retry'], dismisses: 0 }],
  [{ name: 'a macOS permission error on a Mac', platform: 'mac', errors: [{ source: 'reload', message: 'permission_denied: no', id: 1 }] }, { says: ['Screen Recording is off.', 'Retry'], ids: ['shell-banner-retry-reload'] }],
  [{ name: 'the audio permission row', platform: 'mac', errors: [{ source: 'audio_permission', message: 'silent', id: 1 }] }, { ids: ['shell-banner-retry-audio_permission'] }],
  [{ name: 'an agent testing, with a countdown', test: { ...testOnce } }, { says: ['An agent is testing an effect on the lights. Will revert in: 1:30', 'Stop test'], ids: ['shell-light-test-stop'], actions: ['stop-test'], noticeMarks: 1 }],
  [{ name: 'an editor tab testing live: no countdown', test: { ...testLive } }, { says: ['Stop test'], lacks: ['Will revert'] }],
  [{ name: 'a lone error the user collapsed', errors: [reload], userCollapsed: true }, { says: ['1 error'], lacks: ['no outputs paired'] }],
  [{ name: 'a test and a condition collapsed: one notice, one error', conditions: [{ source: 'other', message: 'x' }], test: { ...testOnce } }, { says: ['1 notice', '1 error'] }],
  [{ name: 'three errors and a test, collapsed', errors: [reload, effect, startup], test: { ...testLive } }, { says: ['1 notice', '3 errors'] }],
]

describe('ErrorShell rows say what the Dashboard has always said', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  for (const [c, want] of cases) {
    it(c.name, () => {
      const got = facts(editorMarkup(c))
      for (const words of want.says ?? []) expect(got.text).toContain(words)
      for (const words of want.lacks ?? []) expect(got.text).not.toContain(words)
      for (const id of want.ids ?? []) expect(got.ids).toContain(id)
      for (const action of want.actions ?? []) expect(got.actions).toContain(action)
      if (want.dismisses !== undefined) expect(got.dismisses).toBe(want.dismisses)
      if (want.errorMarks !== undefined) expect(got.errorMarks).toBeGreaterThanOrEqual(want.errorMarks)
      if (want.noticeMarks !== undefined) expect(got.noticeMarks).toBeGreaterThanOrEqual(want.noticeMarks)
    })
  }

  it('errors are drawn newest id first', () => {
    const text = facts(editorMarkup({ name: 'x', errors: [effect, reload], open: true })).text
    expect(text.indexOf('no outputs paired')).toBeLessThan(text.indexOf("Couldn't switch to 'x'"))
  })

  it('rows run the light test, requests, conditions, then errors, each keyed by what it is', () => {
    const c: Case = { name: 'x', open: true, pairings: [phone], conditions: [{ source: 'other', message: 'cond' }], errors: [startup, reload], test: { ...testLive } }
    // Buttons carry their row's key too, so each key shows more than once.
    expect([...new Set(facts(editorMarkup(c)).keys)]).toEqual(['condition:other:cond', 'error:reload:no outputs paired', 'error:startup:port in use', 'pairing:r1', 'test:e:live', 'toggle'])
  })

  // data-new is state (the pulse), not markup: it is on no row at the baseline, and the toggle never has it.
  it('data-new is on the rows that pulse and nowhere else', () => {
    for (const [c] of cases) {
      const rows = orderRows(rowsInput(c))
      expect(normal(editorMarkup(c))).not.toContain('data-new')
      const all = normal(editorMarkup({ ...c, pulsing: [...rows.map((row) => row.key), 'toggle'] }))
      expect(facts(all.replaceAll(' data-new=""', ''))).toEqual(facts(normal(editorMarkup(c))))
      // Every drawn row carries it; the toggle never does.
      expect((all.match(/data-new=""/g) ?? []).length).toBe(editorMarkup(c).includes('aria-expanded="false"') ? 0 : rows.length)
      expect(all).not.toMatch(/<button[^>]*data-new/)
    }
  })

  it('only the named row pulses', () => {
    const c: Case = { name: 'two open', errors: [reload, effect], open: true, pulsing: ['error:effect:' + effect.message] }
    const out = normal(editorMarkup(c))
    expect((out.match(/data-new=""/g) ?? []).length).toBe(1)
    expect(out).toMatch(/<div class="shell-banner-row shell-grille-row" data-key="error:effect:[^"]*" data-new="">/)
  })

  it('the ErrorShell draws no pulse on its first render (the baseline)', () => {
    const noop = () => {}
    const out = renderToStaticMarkup(<ErrorShell hostState="running" platform="" conditions={[]} errors={[reload]} lightTest={null} hasReplied unreachable={false} onRetry={noop} onDismiss={noop} onStopTest={noop} />)
    expect(out).toContain('shell-banner-row')
    expect(out).not.toContain('data-new')
  })

  it('shows nothing when there is nothing to say', () => {
    expect(editorMarkup({ name: 'none' })).toBe('')
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
    expect(html).toContain(`<div class="shell-banner-row shell-grille-row" data-key="note:${note}"><div class="ui-message-row" data-tone="error">`)
    expect(html).toContain(`<div class="ui-message-row-text">${note}</div>`)
    expect(html).not.toContain('Retry')
    expect(html).not.toContain('shell-banner-dismiss')
  })

  it('the open-failure notes are rows too', () => {
    for (const note of ['Rainbow no longer exists.', "Rainbow's file can't be read.", "Couldn't open the editor."]) {
      const html = normal(renderToStaticMarkup(<ErrorShell {...props} unreachable={false} notes={[note]} />))
      expect(html).toContain(`data-tone="error"`)
      expect(html).toContain(`<div class="ui-message-row-text">${note.replace("'", "'")}</div>`)
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
// suite does not have: its rules are unit-tested in web/ui/shellRows.test.mjs and
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

  it('a lone request is open with Approve and Deny, the notice mark and a toggle after it', () => {
    const out = html({ pairings: [phone] })
    expect(out).toContain('id="shell-pairing-approve-r1" data-action="approve" data-key="pairing:r1"')
    expect(out).toContain('id="shell-pairing-deny-r1" data-action="deny" data-key="pairing:r1"')
    expect(out).toContain('data-tone="notice"')
    expect(out).toContain('<strong>Pair a device with Aurora?</strong>')
    expect(out.indexOf('shell-pairing-approve')).toBeLessThan(out.indexOf('shell-banner-toggle'))
  })

  it('a notice and an error: notices first, singular words', () => {
    const out = html({ errors: [reload], lightTest: { holder: null, endsAtMs: null } })
    expect(out).toContain('1 notice</span><span class="shell-count shell-count-error"><span class="shell-mark shell-mark-error" aria-hidden="true"></span> 1 error')
  })
})
