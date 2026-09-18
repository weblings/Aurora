// Closure check for the vendored WebUI Dashboard port.
//
// Verifies MANIFEST.json against the Aurora-WebUI *source* tree (sibling
// checkout): every module reachable from the entry via relative imports must
// be listed in modules, and every listed module must be reachable (unless
// flagged in deadModules). Run on every re-vendor:
//
//   node closure-check.mjs [path-to-Aurora-WebUI]
//
// Exits nonzero with the leak list when the closure outgrows the manifest.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(here, 'MANIFEST.json'), 'utf8'));
const sourceRoot = resolve(process.argv[2] ?? join(here, '..', '..', '..', 'Aurora-WebUI'));

const IMPORT_RE = /^import\s[^'"]*['"](\.[^'"]+)['"]/gm;

function localImports(absPath) {
  const text = readFileSync(absPath, 'utf8');
  const found = [];
  let m;
  while ((m = IMPORT_RE.exec(text)) !== null) {
    const target = resolve(dirname(absPath), m[1]);
    found.push(target.endsWith('.js') ? target : target + '.js');
  }
  return found;
}

const seen = new Set();
const stack = [join(sourceRoot, manifest.entry)];
while (stack.length) {
  const file = stack.pop();
  if (seen.has(file)) continue;
  if (!existsSync(file)) {
    console.error(`MISSING: ${file} (imported but not on disk)`);
    process.exitCode = 1;
    continue;
  }
  seen.add(file);
  stack.push(...localImports(file));
}

const rel = (abs) => abs.slice(sourceRoot.length + 1).replace(/\\/g, '/');
const reached = new Set([...seen].map(rel));
const listed = new Set(manifest.modules);
const dead = new Set(manifest.deadModules ?? []);

let failed = false;
for (const file of reached) {
  if (!listed.has(file)) {
    console.error(`LEAK: reachable but not in manifest.modules: ${file}`);
    failed = true;
  }
}
for (const file of listed) {
  if (!reached.has(file) && !dead.has(file)) {
    console.error(`STALE: listed but unreachable (add to deadModules if intentional): ${file}`);
    failed = true;
  }
}
// The demo boot provides its own app facade: app.js/shell.js must stay out.
for (const file of reached) {
  if (file === 'app.js' || file === 'shell.js') {
    console.error(`COUPLING: entry reaches ${file}, which is not vendored (needs a seam)`);
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`closure OK: ${reached.size} modules reachable, ${listed.size} listed (${dead.size} dead).`);
}
