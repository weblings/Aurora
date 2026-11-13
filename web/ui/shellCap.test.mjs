// The error shell's safety cap, the pure parts (Aurora-9hqa.3): which new row to scroll to and where
// to scroll. IntersectionObserver, scrollHeight and scrolling exist only in a browser, so they are
// covered by the browser checks dashboard-shell and graph-editor:error-shell, not stubbed here.
// Run with `node shellCap.test.mjs`.
import assert from 'node:assert/strict';
import { firstNewKey, scrollTopFor } from './shellCap.js';

// The first new row in drawn order, whatever order the fresh keys came in.
assert.equal(firstNewKey(['a', 'b', 'c', 'd'], ['d', 'b']), 'b');
// An older still-waiting row is not chosen: it is drawn first but is not in the fresh keys.
assert.equal(firstNewKey(['waiting', 'old', 'new1', 'new2'], ['new2', 'new1']), 'new1');
// Nothing new, or nothing new that is drawn (collapsed away): null.
assert.equal(firstNewKey(['a', 'b'], []), null);
assert.equal(firstNewKey(['a', 'b'], ['z']), null);
assert.equal(firstNewKey([], ['a']), null);

// scrollTopFor: a row already clear of both edges keeps the scroll; above or below moves it
// by the margin; a row taller than the window aligns its top; the top clamps at 0.
const win = { height: 250, margin: 28 };
assert.equal(scrollTopFor({ top: 100, bottom: 150, scrollTop: 40, ...win }), 40);
assert.equal(scrollTopFor({ top: 100, bottom: 150, scrollTop: 90, ...win }), 72);
assert.equal(scrollTopFor({ top: 400, bottom: 550, scrollTop: 0, ...win }), 328);
assert.equal(scrollTopFor({ top: 5, bottom: 60, scrollTop: 300, ...win }), 0);
assert.equal(scrollTopFor({ top: 300, bottom: 600, scrollTop: 0, ...win }), 272);

console.log('shellCap.test.mjs: ok');
