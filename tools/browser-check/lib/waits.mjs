// Waits and run controls the shell checks share (Aurora-ngoj).

// Dev-only poll cadence: AURORA_DEV_POLL_MS in the app's environment makes GET /api/state name a
// faster cadence (`devPollMs`), which the Dashboard shell and the editor's host-state hook adopt after
// their first reply. A release app never writes the field, so this does nothing there. Set it before
// the stack comes up; an explicit value (3000 for the shipped cadence) wins.
export function fastPolls(ms = 300) {
  process.env.AURORA_DEV_POLL_MS ??= String(ms)
}

// Counts the page's GET /api/state answers (the shell's beat and any checkNow), so "nothing happens across
// polls" waits for N polls, not for milliseconds. Call once per page, before it navigates.
export function statePolls(page) {
  let seen = 0
  page.on('response', (r) => {
    if (r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/state') seen += 1
  })
  return {
    count: () => seen,
    // Resolves after n further answers (a navigation in between keeps counting; the listener is the page's).
    async polls(n, timeout = 30_000) {
      const target = seen + n
      const until = Date.now() + timeout
      while (seen < target) {
        if (Date.now() > until) throw new Error(`waited for ${n} /api/state polls, saw ${seen - (target - n)}`)
        await new Promise((r) => setTimeout(r, 20))
      }
    },
  }
}

// STEP=<substring> stops a long check right after the first step whose label contains it (the earlier
// steps are the setup it needs; the checks are linear and each leans on the state the last left). The
// teardown still runs. Returns the check's `step(label)` logger.
export class StepReached extends Error {
  constructor(label) {
    super(label)
    this.name = 'StepReached'
  }
}

export function stepLogger() {
  const want = process.env.STEP
  return (label) => {
    console.log(`ok  ${label}`)
    if (want && label.includes(want)) throw new StepReached(label)
  }
}

// Runs a check's stack body; a StepReached stop is a normal finish.
export async function finish(name, run) {
  try {
    await run
    console.log(`${name}: all passed`)
  } catch (e) {
    if (e?.name !== 'StepReached') throw e
    console.log(`${name}: stopped after step "${e.message}" (STEP=${process.env.STEP}); the later steps did not run`)
  }
}

// Polls an async condition (node side) until it is truthy.
export async function until(fn, label, timeout = 10_000) {
  const stop = Date.now() + timeout
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > stop) throw new Error(`timed out waiting for ${label}`)
    await new Promise((r) => setTimeout(r, 50))
  }
}
