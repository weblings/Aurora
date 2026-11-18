// Test on lights for the demo room, as core's LightTest: one test at a time, a Once
// test ends at the confirm limit, any test ends when heartbeats stop (Aurora-51nv.10).
// hooks.start(doc, inputs) puts the graph on the room, hooks.revert() puts the live one back.

export const TEST_OPTIONS = { confirmMs: 15000, heartbeatMs: 2000, lapseMs: 6000 };

export function createLightTest({
  hooks,
  options = TEST_OPTIONS,
  clock = () => Date.now(),
  setTimer = (fn, ms) => setInterval(fn, ms),
  clearTimer = (id) => clearInterval(id),
}) {
  let active = null; // {session, mode, doc, startedAt, lastBeat}
  let lastEnd = null;
  let watchdog = null;

  function end(reason) {
    active = null;
    lastEnd = reason;
    if (watchdog !== null) {
      clearTimer(watchdog);
      watchdog = null;
    }
  }

  function expire() {
    if (!active) return;
    const now = clock();
    let reason = null;
    if (active.mode === 'once' && now - active.startedAt >= options.confirmMs) reason = 'confirm_timeout';
    else if (now - active.lastBeat >= options.lapseMs) reason = 'heartbeat_lost';
    if (!reason) return;
    hooks.revert();
    end(reason);
  }

  const holderOf = () => (active ? { session: active.session, client: null } : null);
  const remaining = () => {
    if (!active || active.mode === 'live') return null;
    return Math.max(0, options.confirmMs - (clock() - active.startedAt));
  };

  return {
    options,
    // Returns '' or why the room cannot take the graph.
    start(session, doc, inputs, mode = 'once') {
      expire();
      const error = hooks.start(doc, inputs);
      if (error) return error;
      const replaced = active && active.session !== session;
      const now = clock();
      if (watchdog === null) watchdog = setTimer(expire, 500);
      active = { session, mode, doc, startedAt: now, lastBeat: now };
      if (replaced) lastEnd = 'replaced';
      return '';
    },
    heartbeat(session) {
      expire();
      if (!active || active.session !== session) return false;
      active.lastBeat = clock();
      return true;
    },
    revert(session) {
      expire();
      if (!active || active.session !== session) return false;
      hooks.revert();
      end('reverted');
      return true;
    },
    // Any holder, reason says why ('stopped' from the Dashboard, 'superseded' by an effect choice).
    stop(reason = 'stopped') {
      expire();
      if (!active) return false;
      hooks.revert();
      end(reason);
      return true;
    },
    // The GET /api/graph/test body.
    info() {
      expire();
      return {
        active: active !== null,
        mode: active ? active.mode : null,
        confirmRemainingMs: active ? remaining() : 0,
        revertAfterMs: active ? Math.max(0, options.lapseMs - (clock() - active.lastBeat)) : 0,
        holder: holderOf(),
        lastEnd,
      };
    },
    // The /api/state `test` member.
    stateTest() {
      expire();
      return {
        active: active !== null,
        mode: active ? active.mode : null,
        confirmRemainingMs: active ? remaining() : 0,
        holder: holderOf(),
      };
    },
  };
}
