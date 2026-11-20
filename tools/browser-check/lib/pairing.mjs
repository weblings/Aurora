// Real LAN pairing requests for the shell checks (Aurora-9hqa.4). POST /api/pairing/request is
// scope None and the browser-check stack answers loopback as admin, so a request raised from node
// shows in GET /api/pairing/pending exactly as an adapter's would, and Approve / Deny in the page
// reach the server. Every request is named with PREFIX so cleanup can find what a run left behind.
export const PREFIX = 'bc-9hqa4'

export function pairingApi(aurora) {
  const call = async (method, path, body) => {
    const res = await fetch(`${aurora}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, json: await res.json().catch(() => ({})) }
  }
  const pending = async () => (await call('GET', '/api/pairing/pending')).json.pending ?? []
  return {
    call,
    pending,
    // Raises a request; resolves { name, pollKey, code, ref } once it is in the pending list.
    async raise(name, scope = 'read') {
      const full = `${PREFIX} ${name}`
      const res = await call('POST', '/api/pairing/request', { name: full, scope })
      if (res.status !== 202) throw new Error(`POST /api/pairing/request answered ${res.status}: ${JSON.stringify(res.json)}`)
      const item = (await pending()).find((p) => p.name === full)
      if (!item) throw new Error(`request "${full}" is not in /api/pairing/pending`)
      return { name: full, pollKey: res.json.pollKey, code: res.json.code, ref: item.ref }
    },
    // The requester's view of the decision (GET /api/pairing/request/:pollKey): 200 approved,
    // 403 denied. A 429 slow_down is retried after the interval.
    async outcome(pollKey) {
      for (let i = 0; i < 4; i += 1) {
        const res = await call('GET', `/api/pairing/request/${pollKey}`)
        if (res.status !== 429) return res
        await new Promise((r) => setTimeout(r, 5200))
      }
      throw new Error('pairing poll kept answering slow_down')
    },
    // Denies what is still pending and revokes the devices this run approved.
    async cleanup() {
      for (const item of await pending().catch(() => [])) {
        if (item.name?.startsWith(PREFIX)) await call('POST', `/api/pairing/pending/${encodeURIComponent(item.ref)}/deny`).catch(() => {})
      }
      const devices = (await call('GET', '/api/pairing/devices').catch(() => ({ json: {} }))).json.devices ?? []
      for (const d of devices) if (d.name?.startsWith(PREFIX)) await call('DELETE', `/api/pairing/devices/${encodeURIComponent(d.id)}`).catch(() => {})
    },
  }
}
