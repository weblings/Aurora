// Pairing helpers (Aurora-5ipy.6): status probe verdicts, the global 401
// hook (any 401 but the handshake's own routes), device-name guess.
// Run with `node Pairing.test.mjs`.
import assert from 'node:assert/strict';
import { fetchPairingStatus, needsPairing, canManagePairing, installPairingFetchHook, guessDeviceName } from './Pairing.js';

const answer = (status, body) => async () => ({ status, ok: status < 300, json: async () => body });

// Status: loopback, unpaired LAN, paired LAN, broken probe.
{
  const local = await fetchPairingStatus(answer(200, { required: false, scope: 'admin' }));
  assert.equal(needsPairing(local), false);
  assert.equal(canManagePairing(local), true, 'loopback approves');

  const unpaired = await fetchPairingStatus(answer(200, { required: true, scope: 'none' }));
  assert.equal(needsPairing(unpaired), true, 'unpaired LAN browser pairs');
  assert.equal(canManagePairing(unpaired), false);

  const paired = await fetchPairingStatus(answer(200, { required: true, scope: 'admin' }));
  assert.equal(needsPairing(paired), false);
  assert.equal(canManagePairing(paired), true, 'paired admin phone approves');

  const adapter = await fetchPairingStatus(answer(200, { required: true, scope: 'read' }));
  assert.equal(needsPairing(adapter), false);
  assert.equal(canManagePairing(adapter), false, 'lower scope cannot approve');

  assert.equal(await fetchPairingStatus(async () => { throw new Error('down'); }), null);
  assert.equal(await fetchPairingStatus(answer(404, 'not json')), null, 'old daemon reads as unknown');
  assert.equal(needsPairing(null), false, 'unknown never blocks boot');
  assert.equal(canManagePairing(null), false);
}

// 401 hook: fires for a guarded write, not for 200/403 or the handshake,
// and always hands the response back untouched.
{
  const statuses = new Map([['/api/state', 401], ['/api/config', 200], ['/api/pairing/request', 401], ['/api/pairing/request/abc', 401], ['/api/x', 403]]);
  const target = { fetch: async (input) => ({ status: statuses.get(input.url ?? input) }) };
  let fired = 0;
  const uninstall = installPairingFetchHook(target, () => { fired++; });

  const response = await target.fetch('/api/state', { method: 'PUT' });
  assert.equal(response.status, 401, 'response passes through');
  assert.equal(fired, 1);
  await target.fetch('/api/config');
  await target.fetch('/api/x');
  assert.equal(fired, 1, '200 and 403 ignored');
  await target.fetch('/api/pairing/request');
  await target.fetch('/api/pairing/request/abc');
  assert.equal(fired, 1, 'handshake routes ignored');
  await target.fetch({ url: '/api/state' });
  assert.equal(fired, 2, 'Request objects count too');

  uninstall();
  await target.fetch('/api/state');
  assert.equal(fired, 2, 'uninstall restores fetch');
}

// Name guess: phone first, desktop OS, generic fallback.
{
  assert.equal(guessDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), 'iPhone');
  assert.equal(guessDeviceName('Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile Safari'), 'Android phone');
  assert.equal(guessDeviceName('Mozilla/5.0 (Linux; Android 15; Tab)'), 'Android tablet');
  assert.equal(guessDeviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'Windows PC');
  assert.equal(guessDeviceName(''), 'Browser');
}

console.log('Pairing checks passed.');
