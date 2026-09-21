// Version-footer contract (Aurora-qdk): one truth, three consumers. The
// superbuild project() VERSION mirrors the CHANGELOG top entry; both app
// shells compile it into a /api/version route; both dashboards fetch and
// render it into a secondary-color footer. No test framework dependency
// (matches dashboard.test.mjs convention) -- run with `node version.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// Single truth: CMake project VERSION agrees with the CHANGELOG release.
{
  const cmake = read('CMakeLists.txt');
  const declared = cmake.match(/^project\(\S+\s+VERSION\s+(\d+\.\d+\.\d+)/m);
  assert.ok(declared, 'superbuild project() carries a VERSION');
  const changelog = read('CHANGELOG.txt');
  const top = changelog.match(/^v(\d+\.\d+\.\d+)/m);
  assert.ok(top, 'CHANGELOG top entry is versioned');
  assert.equal(declared[1], top[1], 'CMake VERSION mirrors the CHANGELOG release');
}

// Both app shells bake the truth into a /api/version route.
for (const app of ['app/linux', 'app/windows']) {
  const lists = read(`${app}/CMakeLists.txt`);
  assert.ok(lists.includes('AURORA_VERSION'), `${app} defines AURORA_VERSION`);
  const main = read(`${app}/src/main.cpp`);
  assert.ok(main.includes('"/api/version"'), `${app} registers /api/version`);
  assert.ok(main.includes('{"version", AURORA_VERSION}'), `${app} serves the baked version`);
}

// Both dashboards probe the route and render into the footer slot.
for (const screen of [
  'web/ui/screens/DashboardScreen.js',
  'web/demo/vendor/webui/screens/DashboardScreen.js',
]) {
  const js = read(screen);
  assert.ok(js.includes('class="db-version"') || js.includes('db-version'), `${screen} mounts the footer slot`);
  assert.ok(js.includes("fetch('/api/version')"), `${screen} probes /api/version`);
  assert.ok(js.includes('.db-version'), `${screen} renders into the footer slot`);
}

// Both stylesheets pin the footer contract: centered, secondary color,
// 13px house small size, bottom inset from the shared top-padding token.
for (const cssPath of ['web/ui/styles/dashboard.css', 'web/demo/vendor/webui/styles/dashboard.css']) {
  const m = read(cssPath).match(/\.db-version\s*\{([^}]*)\}/);
  assert.ok(m, `${cssPath} styles the footer`);
  assert.ok(/text-align\s*:\s*center/.test(m[1]), 'footer is centered');
  assert.ok(/color\s*:\s*var\(--aurora-text-secondary\)/.test(m[1]), 'footer uses secondary text');
  assert.ok(/font-size\s*:\s*13px/.test(m[1]), 'footer uses the house small size');
  assert.ok(
    /margin-top\s*:\s*var\(--aurora-space-3\)/.test(m[1]),
    'footer leads with the inter-accordion gap',
  );
  assert.ok(
    /margin-bottom\s*:\s*calc\(var\(--aurora-space-4\)\s*-\s*var\(--aurora-space-8\)\)/.test(m[1]),
    'footer pulls up to the shared top-padding inset',
  );
}

console.log('version.test.mjs: ok');
