import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

// Playwright's browser cache, per OS, unless PLAYWRIGHT_BROWSERS_PATH says where.
function cacheDirs() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
    return [process.env.PLAYWRIGHT_BROWSERS_PATH]
  }
  const home = homedir()
  return [
    join(home, 'Library', 'Caches', 'ms-playwright'),
    join(home, '.cache', 'ms-playwright'),
    join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'ms-playwright'),
  ]
}

// Executables a Playwright download leaves, relative to a build's folder.
const EXECUTABLES = [
  ['chrome-mac', 'headless_shell'],
  ['chrome-linux', 'headless_shell'],
  ['chrome-win', 'headless_shell.exe'],
  ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
  ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
]

// The newest cached headless Chromium, or AURORA_BROWSER when set.
export function findChromium() {
  if (process.env.AURORA_BROWSER) return process.env.AURORA_BROWSER
  for (const dir of cacheDirs()) {
    if (!existsSync(dir)) continue
    const builds = readdirSync(dir).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()
    for (const build of builds) {
      for (const [folder, exe] of EXECUTABLES) {
        const path = join(dir, build, folder, exe)
        if (existsSync(path)) return path
      }
    }
  }
  throw new Error(
    'No headless Chromium found. Run `npx playwright-core install chromium-headless-shell` here, ' +
      'or set AURORA_BROWSER to a Chromium/Chrome executable.',
  )
}

export function launch() {
  return chromium.launch({ executablePath: findChromium() })
}
