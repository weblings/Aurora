// Mac audio permission block (Aurora-tjoq, h457): short copy, Retry first
// (a grant does not revive a running grabber; the reload rebuilds it), then
// the Settings link. Run with `node MacPermissionRecovery.test.mjs`.
import assert from 'node:assert/strict';
import { renderAudioPermissionBanner } from './MacPermissionRecovery.js';

const html = renderAudioPermissionBanner({ retryId: 'r1' });
assert.ok(html.includes('System Audio Recording Only'));
assert.ok(html.includes('id="r1"'), 'Retry button carries the shell-assigned id');
assert.ok(html.indexOf('Retry</button>') < html.indexOf('Open Settings'), 'Retry first, Settings second');
assert.ok(html.includes('com.apple.preference.security?Privacy_AudioCapture'));
assert.ok(html.replace(/<[^>]+>/g, '').length < 260, 'copy stays short');

console.log('MacPermissionRecovery tests passed');
