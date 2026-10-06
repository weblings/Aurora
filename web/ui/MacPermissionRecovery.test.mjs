// Mac audio permission block (Aurora-tjoq): empty unless the backend
// heuristic says the tap looks denied; the copy must say a grant applies
// live and clears by itself (quit+reopen only as a fallback), not tell the
// user to quit first. Run with `node MacPermissionRecovery.test.mjs`.
import assert from 'node:assert/strict';
import { renderAudioPermissionBanner } from './MacPermissionRecovery.js';

assert.equal(renderAudioPermissionBanner(false), '', 'nothing shown when not denied');

const html = renderAudioPermissionBanner(true);
assert.ok(html.includes('System Audio Recording Only'));
assert.ok(html.includes('clears by itself'), 'says the block clears on its own after a grant');
assert.ok(html.includes('only if it doesn\'t'), 'quit+reopen is a fallback line');
assert.ok(!html.includes('After enabling it, fully quit'), 'no longer demands a quit first');
assert.ok(html.includes('x-apple.systempreferences:com.apple.preference.security'));

console.log('MacPermissionRecovery tests passed');
