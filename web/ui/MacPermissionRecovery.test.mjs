// Mac audio permission block (Aurora-tjoq, h457): short copy, Retry first
// (a grant does not revive a running grabber; the reload rebuilds it), then
// the Settings link. Run with `node MacPermissionRecovery.test.mjs`.
import assert from 'node:assert/strict';
import { renderAudioPermissionBanner, renderLocalNetworkBanner } from './MacPermissionRecovery.js';

const html = renderAudioPermissionBanner({ retryId: 'r1' });
assert.ok(html.includes('System Audio Recording Only'));
assert.ok(html.includes('id="r1"'), 'Retry button carries the shell-assigned id');
assert.ok(html.indexOf('Retry</button>') < html.indexOf('Open Settings'), 'Retry first, Settings second');
assert.ok(html.includes('com.apple.preference.security?Privacy_AudioCapture'));
assert.ok(html.replace(/<[^>]+>/g, '').length < 260, 'copy stays short');

// Local Network condition row (Aurora-rbp3): Settings link only -- the
// daemon clears the condition itself, so no Retry.
{
  const ln = renderLocalNetworkBanner();
  assert.ok(ln.includes('href="x-apple.systempreferences:com.apple.preference.security"'), 'Privacy & Security, no dead anchor');
  assert.ok(ln.includes('click Local Network'), 'copy names the last click');
  assert.ok(ln.includes('Open Settings'));
  assert.ok(!ln.includes('Retry'), 'no Retry on a condition');
  assert.ok(ln.replace(/<[^>]+>/g, '').length < 260, 'copy stays short');
}

console.log('MacPermissionRecovery tests passed');
