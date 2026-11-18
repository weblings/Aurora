// builtin-graphs.js must match the server samples it is generated from.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BUILTIN_GRAPHS } from './builtin-graphs.js';

for (const mode of ['video', 'audio']) {
  const url = new URL(`../graph-editor/src/graph/server-samples/builtin.${mode}.json`, import.meta.url);
  const sample = JSON.parse(fs.readFileSync(url, 'utf8')).graph;
  assert.deepEqual(BUILTIN_GRAPHS[mode], sample, `stale: run python web/demo/gen-builtin-graphs.py (${mode})`);
}
console.log('builtin-graphs matches the server samples.');
