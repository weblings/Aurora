// The error shell's patch planner (Aurora-9hqa.1): which drawn rows to keep, replace, insert or
// remove for the next rows, pure and DOM-free. The DOM applier is covered by the browser check
// dashboard-shell. Run with `node shellPatch.test.mjs`.
import assert from 'node:assert/strict';
import { planPatch } from './shellPatch.js';

const r = (key, sig = key) => ({ key, sig });

// Nothing drawn: every row is an insert, in order.
assert.deepEqual(planPatch([], [r('a'), r('b')]), [{ op: 'insert', key: 'a' }, { op: 'insert', key: 'b' }]);

// Nothing wanted: every drawn row goes.
assert.deepEqual(planPatch([r('a'), r('b')], []), [{ op: 'remove', key: 'a' }, { op: 'remove', key: 'b' }]);

// Same keys, same signatures: all kept (focus survives a poll).
assert.deepEqual(planPatch([r('a'), r('b')], [r('a'), r('b')]), [{ op: 'keep', key: 'a' }, { op: 'keep', key: 'b' }]);

// Same key, new signature: replaced, and only that row.
assert.deepEqual(planPatch([r('a'), r('b', 'x')], [r('a'), r('b', 'y')]), [{ op: 'keep', key: 'a' }, { op: 'replace', key: 'b' }]);

// A changed message is a new key: the old row is removed (first), the new one inserted.
assert.deepEqual(planPatch([r('a'), r('b')], [r('a'), r('b2')]), [
  { op: 'remove', key: 'b' },
  { op: 'keep', key: 'a' },
  { op: 'insert', key: 'b2' },
]);

// An arrival in the middle, a departure at the front.
assert.deepEqual(planPatch([r('a'), r('c')], [r('b'), r('c')]), [
  { op: 'remove', key: 'a' },
  { op: 'insert', key: 'b' },
  { op: 'keep', key: 'c' },
]);

// A reorder keeps every row; the op order is the new order.
assert.deepEqual(planPatch([r('a'), r('b'), r('c')], [r('c'), r('a'), r('b')]).map((o) => o.key), ['c', 'a', 'b']);
assert.ok(planPatch([r('a'), r('b'), r('c')], [r('c'), r('a'), r('b')]).every((o) => o.op === 'keep'));

console.log('shellPatch checks passed.');
