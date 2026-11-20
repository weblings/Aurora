import { spawn, spawnSync } from 'node:child_process'
import { closeSync, openSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const devstack = join(root, 'tools', 'light-viz-relay', 'devstack.py')
const editorDir = join(root, 'web', 'graph-editor')
const python = process.platform === 'win32' ? 'py' : 'python3'

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

async function waitFor(url, seconds = 30) {
  const until = Date.now() + seconds * 1000
  for (;;) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // Not listening yet.
    }
    if (Date.now() > until) throw new Error(`${url} did not come up in ${seconds} s`)
    await new Promise((r) => setTimeout(r, 300))
  }
}

// Relaunches the app on the same config (same port), as a user quitting and reopening it.
export function restart() {
  const r = spawnSync(python, [devstack, 'restart'], { encoding: 'utf8', timeout: 170_000, windowsHide: true })
  if (r.status !== 0) throw new Error(`devstack restart failed:\n${r.stdout}\n${r.stderr}`)
}

// AURORA_SHARED_STACK (JSON from checks/run-set.mjs): a stack already up, which the check
// uses as is and leaves up. It runs the dummy input at the poll cadence it was started with.
function sharedStack(input, audio = false) {
  if (!process.env.AURORA_SHARED_STACK) return null
  if (audio) throw new Error('a shared stack has no audio input, this check needs one')
  const shared = JSON.parse(process.env.AURORA_SHARED_STACK)
  if (input !== 'dummy') throw new Error(`a shared stack runs the dummy input, this check needs ${input}`)
  if ((process.env.AURORA_DEV_POLL_MS ?? '') !== shared.pollMs) throw new Error(`this check wants AURORA_DEV_POLL_MS=${process.env.AURORA_DEV_POLL_MS}, the shared stack runs '${shared.pollMs}'`)
  return shared
}

function stackUp(input, audio = false) {
  const up = spawnSync(python, [devstack, 'up', '--input', input, ...(audio ? ['--audio-input'] : []), ...(process.env.AURORA_VIZ_PORT ? ['--viz-port', process.env.AURORA_VIZ_PORT] : [])], { encoding: 'utf8', timeout: 170_000, windowsHide: true })
  const port = /WebUI http:\/\/127\.0\.0\.1:(\d+)/.exec(up.stdout ?? '')?.[1]
  if (!port) {
    stackDown()
    throw new Error(`devstack up failed:\n${up.stdout}\n${up.stderr}`)
  }
  return port
}

function stackDown() {
  spawnSync(python, [devstack, 'down'], { encoding: 'utf8', windowsHide: true })
}

// The same fake-Hue stack with no editor dev server, for checks of the Dashboard the app serves
// itself: runs `body({ aurora, restart })` and tears the stack down whatever happens.
export async function withAuroraStack(body, { input = 'dummy' } = {}) {
  const shared = sharedStack(input)
  if (shared) return body({ aurora: shared.aurora, restart })
  const port = stackUp(input)
  try {
    await body({ aurora: `http://127.0.0.1:${port}`, restart })
  } finally {
    stackDown()
  }
}

// Starts the stack and (unless AURORA_EDITOR=embedded) the editor's dev server. Returns
// `{ editorUrl, aurora, viteLog, stop }`; `stop()` tears both down.
export async function startEditorStack({ input = 'dummy', audio = false } = {}) {
  const port = stackUp(input, audio)
  const aurora = `http://127.0.0.1:${port}`
  if (process.env.AURORA_EDITOR === 'embedded') return { editorUrl: `${aurora}/graph-editor/`, aurora, viteLog: null, stop: stackDown }
  let vite = null
  const stop = () => {
    if (vite) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { windowsHide: true })
      else vite.kill()
    }
    stackDown()
  }
  // Vite's output is kept so a failed check can show it (a dependency re-optimisation reloads the page).
  const viteLog = join(tmpdir(), `aurora-vite-${process.pid}.log`)
  try {
    const vitePort = await freePort()
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    const out = openSync(viteLog, 'w')
    // Windows needs a shell for the .cmd, and Node 24 warns (DEP0190) on separate args with one, so it gets a string.
    const args = ['vite', '--port', String(vitePort), '--strictPort']
    vite = spawn(process.platform === 'win32' ? [npx, ...args].join(' ') : npx, process.platform === 'win32' ? [] : args, {
      cwd: editorDir,
      env: { ...process.env, AURORA_PORT: port },
      stdio: ['ignore', out, out],
      windowsHide: true,
      // Node 24 refuses to spawn a .cmd without a shell.
      shell: process.platform === 'win32',
    })
    closeSync(out)
    const editorUrl = `http://localhost:${vitePort}/graph-editor/`
    await waitFor(editorUrl)
    return { editorUrl, aurora, viteLog, stop }
  } catch (e) {
    stop()
    throw e
  }
}

export function printViteLog(viteLog) {
  if (viteLog) console.error(`--- vite log (${viteLog}) ---\n${readFileSync(viteLog, 'utf8').split('\n').slice(-40).join('\n')}`)
}

// Brings up the fake-Hue stack and the graph editor's dev server, runs
// `body({ editorUrl, aurora, restart })`, and tears both down whatever happens.
// `aurora` is the WebUI origin; `restart()` relaunches the app on the same
// config (same port), as a user quitting and reopening it. AURORA_EDITOR=embedded skips the dev server and
// uses the editor built into the app binary (/graph-editor/ on `aurora`).
// Under AURORA_SHARED_STACK it uses that stack and leaves it up.
export async function withEditorStack(body, { input = 'dummy', audio = false } = {}) {
  const shared = sharedStack(input, audio)
  if (shared) return body({ editorUrl: shared.editorUrl, aurora: shared.aurora, restart })
  const { editorUrl, aurora, viteLog, stop } = await startEditorStack({ input, audio })
  try {
    await body({ editorUrl, aurora, restart })
  } catch (e) {
    if (e?.name !== 'StepReached') printViteLog(viteLog)
    throw e
  } finally {
    stop()
  }
}
