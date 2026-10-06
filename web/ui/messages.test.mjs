// One wording for "daemon unreachable" across web/ui and the demo's vendored
// copy (Aurora-jm6s): every screen uses the shared constant, so no source
// file spells the message out or reverts to the 'Could not' form. Run with
// `node messages.test.mjs`.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAEMON_UNREACHABLE } from './messages.js';

assert.equal(DAEMON_UNREACHABLE, "Couldn't reach the daemon.");

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(path);
    return entry.name.endsWith('.js') && entry.name !== 'messages.js' ? [path] : [];
  });
}

const roots = [
  fileURLToPath(new URL('.', import.meta.url)),
  fileURLToPath(new URL('../demo/vendor/webui/', import.meta.url)),
];
for (const root of roots) {
  for (const file of jsFiles(root)) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/reach the daemon/i.test(text.replace(/\/\/.*$/gm, '')), `${file} spells out the unreachable message instead of importing it`);
  }
}

console.log('messages checks passed.');
