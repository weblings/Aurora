// LAN pairing client side (Aurora-5ipy.6, backend Aurora-5ipy.5): loopback is
// trusted, any other device needs a token to write (ExternalControl.md, Phase 4).

// GET /api/pairing/status -> { required, scope }, or null when the probe
// failed. Unauthenticated by design, so it never 401s.
export async function fetchPairingStatus(fetchImpl = globalThis.fetch) {
  try {
    const body = await (await fetchImpl('/api/pairing/status')).json();
    if (typeof body?.required !== 'boolean') return null;
    return { required: body.required, scope: typeof body.scope === 'string' ? body.scope : 'none' };
  } catch {
    return null;
  }
}

// An unpaired LAN device: reads still work, every write would 401.
export function needsPairing(status) {
  return status !== null && status.required && status.scope === 'none';
}

// Admin approves requests and manages devices: loopback, or a paired browser.
export function canManagePairing(status) {
  return status !== null && status.scope === 'admin';
}

// Global 401 handler: only the pairing guard answers 401, so any 401 means
// "pair this device". The handshake's own routes are open and never do.
export function installPairingFetchHook(target, onPairingRequired) {
  const original = target.fetch.bind(target);
  target.fetch = async (input, init) => {
    const response = await original(input, init);
    if (response.status === 401 && !isPairingHandshake(input)) onPairingRequired();
    return response;
  };
  return () => { target.fetch = original; };
}

function isPairingHandshake(input) {
  const url = typeof input === 'string' ? input : input?.url ?? '';
  return url.includes('/api/pairing/request') || url.includes('/api/pairing/status');
}

// Prefill for the device-name field; the user can edit it.
export function guessDeviceName(userAgent = '') {
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Android/.test(userAgent)) return /Mobile/.test(userAgent) ? 'Android phone' : 'Android tablet';
  if (/Macintosh/.test(userAgent)) return 'Mac';
  if (/Windows/.test(userAgent)) return 'Windows PC';
  if (/CrOS/.test(userAgent)) return 'Chromebook';
  if (/Linux/.test(userAgent)) return 'Linux PC';
  return 'Browser';
}
