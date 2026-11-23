// Aurora-1n1u: runs a set of editor checks against one stack and one Vite dev server instead of
// bringing both up per check, and prints each check's time.
//
//   node checks/run-set.mjs                       the editor regression set (EDITOR_SET)
//   node checks/run-set.mjs narrow title-menu     named checks (script names, with or without graph-editor:)
//   LOGS=<dir> node checks/run-set.mjs            also keeps each check's output, timed per line, in <dir>/<name>.txt
//
// Each check runs in its own Node process with a fresh browser, serially, and removes what it creates.
// Editor drafts outlive their tabs, so the app is restarted (same port and config) when few are left.
// A failed check prints its output, and the stack is brought down and up again before the next one.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { printViteLog, restart, startEditorStack } from '../lib/stack.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const scripts = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')).scripts

// The set a coordinator re-runs after each editor bead.
export const EDITOR_SET = [
  'save-as-new', 'title-menu', 'refused-save', 'kept-copy', 'top-bar', 'undo-toast', 'failed-save', 'drawers',
  'context-menus', 'clipboard', 'import', 'narrow', 'control-count', 'tooltips', 'gate', 'graph-editor', 'tuning-sections',
]

function checkFile(name) {
  const script = scripts[name] ?? scripts[`graph-editor:${name}`]
  const file = /^node (checks\/[\w.-]+\.mjs)$/.exec(script ?? '')?.[1]
  if (!file) throw new Error(`no plain "node checks/<file>.mjs" script named ${name} or graph-editor:${name}`)
  return join(here, '..', file)
}

const MIN_FREE_DRAFTS = 6

// How many more editor drafts the server takes: puts probe drafts until it refuses, then removes them.
async function freeDrafts(aurora) {
  const put = (id) => fetch(`${aurora}/api/graph/drafts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ graph: { nodes: [], wires: [] } }) })
  const made = []
  for (let i = 0; i < 32; i++) {
    const id = `run-set-probe-${i}`
    if ((await put(id)).status !== 200) break
    made.push(id)
  }
  for (const id of made) await fetch(`${aurora}/api/graph/drafts/${id}`, { method: 'DELETE' })
  return made.length
}

function runCheck(file, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { cwd: join(here, '..'), env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    // Each line carries the seconds since the check started, to show where its time goes.
    const t0 = performance.now()
    let out = ''
    let part = ''
    const take = (d) => {
      const lines = (part + d).split('\n')
      part = lines.pop()
      for (const l of lines) out += `${((performance.now() - t0) / 1000).toFixed(1).padStart(6)}  ${l}\n`
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    child.on('close', (code) => resolve({ code, out: out + part }))
  })
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : EDITOR_SET
const files = names.map(checkFile)
const logs = process.env.LOGS
if (logs) mkdirSync(logs, { recursive: true })
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`

const t0 = performance.now()
let stack = await startEditorStack()
console.log(`stack up in ${secs(performance.now() - t0)}`)
const results = []
try {
  for (const [i, name] of names.entries()) {
    const env = { ...process.env, AURORA_SHARED_STACK: JSON.stringify({ editorUrl: stack.editorUrl, aurora: stack.aurora, pollMs: process.env.AURORA_DEV_POLL_MS ?? '' }) }
    // Drafts outlive their tabs (an hour, 16 at most); a restart clears them for about 7 s.
    if (i > 0 && (await freeDrafts(stack.aurora)) < MIN_FREE_DRAFTS) {
      const r = performance.now()
      restart()
      console.log(`      app restarted to clear editor drafts in ${secs(performance.now() - r)}`)
    }
    const t = performance.now()
    const { code, out } = await runCheck(files[i], env)
    const ms = performance.now() - t
    results.push({ name, ok: code === 0, ms })
    if (logs) writeFileSync(join(logs, `${name}.txt`), out)
    console.log(`${code === 0 ? 'pass' : 'FAIL'}  ${name.padEnd(16)} ${secs(ms).padStart(8)}`)
    if (code !== 0) {
      console.log(out.split('\n').map((l) => `  | ${l}`).join('\n'))
      printViteLog(stack.viteLog)
      if (i < names.length - 1) {
        // A failed check may leave effects or a test behind; the next one starts on a fresh stack.
        stack.stop()
        stack = await startEditorStack()
      }
    }
  }
} finally {
  stack.stop()
}
const failed = results.filter((r) => !r.ok)
console.log(`${results.length - failed.length}/${results.length} passed in ${secs(performance.now() - t0)} (checks ${secs(results.reduce((s, r) => s + r.ms, 0))})`)
if (failed.length) {
  console.log(`failed: ${failed.map((r) => r.name).join(', ')}`)
  process.exitCode = 1
}
