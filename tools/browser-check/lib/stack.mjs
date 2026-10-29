import { spawn, spawnSync } from 'node:child_process'
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

// Brings up the fake-Hue stack and the graph editor's dev server, runs
// `body({ editorUrl, aurora })`, and tears both down whatever happens.
// `aurora` is the WebUI origin; `restart()` relaunches the app on the same
// config (same port), as a user quitting and reopening it. AURORA_EDITOR=embedded skips the dev server and
// uses the editor built into the app binary (/graph-editor/ on `aurora`).
function restart() {
  const r = spawnSync(python, [devstack, 'restart'], { encoding: 'utf8', timeout: 170_000 })
  if (r.status !== 0) throw new Error(`devstack restart failed:\n${r.stdout}\n${r.stderr}`)
}

export async function withEditorStack(body, { input = 'dummy' } = {}) {
  const up = spawnSync(python, [devstack, 'up', '--input', input], { encoding: 'utf8', timeout: 170_000 })
  const port = /WebUI http:\/\/127\.0\.0\.1:(\d+)/.exec(up.stdout ?? '')?.[1]
  let vite = null
  try {
    if (!port) throw new Error(`devstack up failed:\n${up.stdout}\n${up.stderr}`)
    if (process.env.AURORA_EDITOR === 'embedded') {
      const aurora = `http://127.0.0.1:${port}`
      await body({ editorUrl: `${aurora}/graph-editor/`, aurora, restart })
      return
    }
    const vitePort = await freePort()
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    vite = spawn(npx, ['vite', '--port', String(vitePort), '--strictPort'], {
      cwd: editorDir,
      env: { ...process.env, AURORA_PORT: port },
      stdio: 'ignore',
    })
    const editorUrl = `http://localhost:${vitePort}/graph-editor/`
    await waitFor(editorUrl)
    await body({ editorUrl, aurora: `http://127.0.0.1:${port}`, restart })
  } finally {
    vite?.kill()
    spawnSync(python, [devstack, 'down'], { encoding: 'utf8' })
  }
}
