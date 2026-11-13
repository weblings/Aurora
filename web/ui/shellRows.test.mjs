// The error shell's row model (Aurora-9hqa.1): order, keys, the collapse layout, the collapsed
// label, and the html per row. No DOM. Run with `node shellRows.test.mjs`.
import assert from 'node:assert/strict';
import { SOURCE_PREFIX, arrivalAnnouncement, arrivedKeys, bannerHtml, bannerRows, baselineReady, baselineSnapshot, clockText, collapsedLabel, collapsibleKeys, errorSentence, isCollapsed, layoutRows, markErrors, orderRows, reconcileSnapshot, renderRow } from './shellRows.js';

// Words.
assert.equal(SOURCE_PREFIX.startup, "Couldn't start: ");
assert.equal(errorSentence({ source: 'startup', message: 'port in use' }, 'failed'), "Couldn't start: port in use");
assert.equal(errorSentence({ source: 'effect', message: 'Fire busy' }, 'running'), 'Fire busy');
assert.equal(errorSentence({ source: 'mystery', message: 'x' }, 'running'), 'x', 'unknown source: bare');
assert.equal(errorSentence({ source: 'reload', message: 'boom' }, 'paused'), "Couldn't apply settings: boom");
assert.ok(errorSentence({ source: 'reload', message: 'boom' }, 'running').startsWith("Saved, but couldn't apply: boom."));
// Collapsed label: notices first, then errors, singular and plural, a part omitted at zero.
assert.equal(collapsedLabel(0, 1), '1 error');
assert.equal(collapsedLabel(0, 3), '3 errors');
assert.equal(collapsedLabel(1, 0), '1 notice');
assert.equal(collapsedLabel(2, 0), '2 notices');
assert.equal(collapsedLabel(1, 1), '1 notice 1 error');
assert.equal(collapsedLabel(2, 3), '2 notices 3 errors');
assert.equal(collapsedLabel(0, 0), '');
assert.equal(clockText(100_000, 0), '1:40');
assert.equal(clockText(0, 5), '0:00');

// Order: light test, pairing, conditions as sent, errors newest id first, notes. Errors with no id last.
const rows = orderRows({
  errors: [{ source: 'startup', message: 's' }, { source: 'reload', message: 'old', id: 2 }, { source: 'effect', message: 'new', id: 9 }],
  conditions: [{ source: 'b', message: '2' }, { source: 'a', message: '1' }],
  notes: ['note one'],
  lightTest: { holder: { session: 'x', client: 'mcp' }, endsAtMs: 5000 },
  pairings: [{ ref: 'r1' }, { ref: 'r2' }],
});
assert.deepEqual(rows.map((row) => row.kind), ['light-test', 'pairing', 'pairing', 'condition', 'condition', 'error', 'error', 'error', 'note']);
assert.deepEqual(rows.filter((row) => row.kind === 'condition').map((row) => row.condition.source), ['b', 'a'], 'conditions as sent');
assert.deepEqual(rows.filter((row) => row.kind === 'error').map((row) => row.error.message), ['new', 'old', 's']);

// Keys.
assert.deepEqual(rows.map((row) => row.key), ['test:x:once', 'pairing:r1', 'pairing:r2', 'condition:b:2', 'condition:a:1', 'error:effect:new', 'error:reload:old', 'error:startup:s', 'note:note one']);
assert.equal(orderRows({ lightTest: { holder: { session: 'x' }, endsAtMs: null } })[0].key, 'test:x:live');
assert.equal(orderRows({ lightTest: { holder: null, endsAtMs: 9 } })[0].key, 'test::once');
const countdown = (ms) => orderRows({ lightTest: { holder: { session: 'x' }, endsAtMs: ms } })[0].key;
assert.equal(countdown(1000), countdown(2000), 'the countdown is not part of the key');
const changed = (message) => orderRows({ errors: [{ source: 'reload', message }] })[0].key;
assert.notEqual(changed('a'), changed('b'), 'a changed message is a new row');
assert.deepEqual(orderRows({ errors: [{ source: 's', message: 'm' }, { source: 's', message: 'm' }] }).map((row) => row.key), ['error:s:m', 'error:s:m#2'], 'duplicates stay distinct');

// Collapse (Aurora-u8jx.5). The state is a snapshot of the row keys, or null for open.
const problems = (n) => orderRows({ errors: Array.from({ length: n }, (_, i) => ({ source: `s${i}`, message: 'm' })) });
const kinds = (list, snapshot) => layoutRows(list, snapshot).map((row) => row.kind);
// Baseline: 2+ rows start collapsed, a lone row open, none is null.
assert.equal(baselineSnapshot(problems(0)), null);
assert.equal(baselineSnapshot(problems(1)), null, 'a lone row starts open');
assert.deepEqual(baselineSnapshot(problems(2)), ['error:s0:m', 'error:s1:m']);
assert.equal(baselineSnapshot(orderRows({ lightTest: { holder: null, endsAtMs: null }, errors: [{ source: 'a', message: '1' }] })).length, 2, 'the light test counts toward 2+');
assert.deepEqual(baselineSnapshot(orderRows({ pairings: [{ ref: 'r' }], errors: [{ source: 'a', message: '1' }] })), ['pairing:r', 'error:a:1'], 'a pairing request counts toward 2+');
assert.equal(baselineSnapshot(orderRows({ pairings: [{ ref: 'r' }] })), null, 'a lone request starts open');
// The baseline waits (Aurora-9hqa.4): the state reply, the canApprove answer, and, only when this
// browser can approve, the first pending result.
assert.equal(baselineReady({ stateReplied: false, canApprove: false, pendingLoaded: false }), false, 'no state reply yet');
assert.equal(baselineReady({ stateReplied: true, canApprove: null, pendingLoaded: false }), false, 'canApprove not read yet');
assert.equal(baselineReady({ stateReplied: true, canApprove: true, pendingLoaded: false }), false, 'waits on the first pending result');
assert.equal(baselineReady({ stateReplied: true, canApprove: true, pendingLoaded: true }), true);
assert.equal(baselineReady({ stateReplied: true, canApprove: false, pendingLoaded: false }), true, 'cannot approve: nothing to wait for');
// Open: every row, then the one toggle (a lone row too). Collapsed: the toggle alone.
assert.deepEqual(kinds(problems(1), null), ['error', 'toggle'], 'a lone row can collapse: it has the toggle');
assert.deepEqual(kinds(problems(2), null), ['error', 'error', 'toggle']);
assert.deepEqual(kinds(problems(2), baselineSnapshot(problems(2))), ['toggle']);
assert.deepEqual(kinds(problems(1), collapsibleKeys(problems(1))), ['toggle'], 'a lone row, collapsed by the user');
assert.deepEqual(kinds(problems(0), null), [], 'no rows, no toggle');
const toggleOf = (list, snapshot) => layoutRows(list, snapshot).find((row) => row.kind === 'toggle');
// Counts: the light test and pairing requests are notices; conditions, errors and notes are errors.
const mixed = orderRows({ lightTest: { holder: null, endsAtMs: null }, errors: [{ source: 'a', message: '1' }], conditions: [{ source: 'c', message: 'x' }], notes: ['n'] });
assert.deepEqual([toggleOf(mixed, null).notices, toggleOf(mixed, null).errors], [1, 3]);
// Snapshot equality: collapsed only while the keys equal it, in any order.
const snap = collapsibleKeys(problems(2));
assert.equal(isCollapsed(problems(2), snap), true);
assert.equal(isCollapsed(problems(2), [...snap].reverse()), true, 'order is not part of it');
assert.equal(isCollapsed(problems(2), null), false);
assert.equal(isCollapsed(problems(3), snap), false, 'a new row re-opens');
assert.equal(isCollapsed(problems(1), snap), false);
const withMessage = (message) => orderRows({ errors: [{ source: 's0', message: 'm' }, { source: 's1', message }] });
assert.equal(isCollapsed(withMessage('m'), snap), true);
assert.equal(isCollapsed(withMessage('changed'), snap), false, 'a changed message re-opens');
// The light-test countdown is not part of the key.
const testRows = (ms) => orderRows({ lightTest: { holder: { session: 'x' }, endsAtMs: ms }, errors: [{ source: 'a', message: '1' }] });
const testSnap = collapsibleKeys(testRows(60_000));
assert.equal(isCollapsed(testRows(59_000), testSnap), true, 'a ticking countdown never re-opens');
assert.equal(isCollapsed(orderRows({ lightTest: { holder: { session: 'x' }, endsAtMs: null }, errors: [{ source: 'a', message: '1' }] }), testSnap), false, 'Once to Live is a different row');
// reconcile: kept while matching, dropped when it stops matching or the rows clear (reset).
assert.equal(reconcileSnapshot(problems(2), snap), snap);
assert.equal(reconcileSnapshot(problems(3), snap), null, 'once re-opened it stays open');
assert.equal(reconcileSnapshot(problems(0), snap), null, 'rows clearing resets');
assert.equal(reconcileSnapshot(problems(2), null), null);
// Pairing requests are inside the collapse and count as notices, after the light test.
const paired = orderRows({ lightTest: { holder: null, endsAtMs: null }, pairings: [{ ref: 'r' }, { ref: 'q' }], errors: [{ source: 'a', message: '1' }] });
assert.deepEqual(kinds(paired, baselineSnapshot(paired)), ['toggle']);
assert.deepEqual(kinds(paired, null), ['light-test', 'pairing', 'pairing', 'error', 'toggle']);
assert.deepEqual([toggleOf(paired, null).notices, toggleOf(paired, null).errors], [3, 1], 'light test and both requests are notices');
assert.ok(renderRow(toggleOf(paired, collapsibleKeys(paired)), { hostState: 'running', platform: '', nowMs: 0 }).includes('3 notices'));
assert.equal(isCollapsed(orderRows({ pairings: [{ ref: 'r' }, { ref: 'q' }] }), ['pairing:r', 'pairing:q']), true);
assert.equal(isCollapsed(orderRows({ pairings: [{ ref: 'r' }, { ref: 'q' }, { ref: 'z' }] }), ['pairing:r', 'pairing:q']), false, 'a new request re-opens');

// Html per row: root carries data-key, buttons carry data-action and data-key.
const ctx = { hostState: 'running', platform: '', nowMs: 0 };
const error = orderRows({ errors: [{ source: 'reload', message: 'a "q" <b>', id: 1 }] })[0];
const html = renderRow(error, ctx);
assert.ok(html.startsWith('<div class="shell-banner-row" data-key="error:reload:a &quot;q&quot; &lt;b&gt;">'), 'key escaped on the root');
assert.ok(html.includes('id="shell-banner-retry-reload" data-action="retry" data-key="error:reload:a &quot;q&quot; &lt;b&gt;"'));
assert.ok(html.includes('id="shell-banner-dismiss-reload" data-action="dismiss"'), 'X on a running host with an id');
assert.ok(html.includes('a &quot;q&quot; &lt;b&gt;</p>') || html.includes('apply: a &quot;q&quot;') || html.includes('&lt;b&gt;'), 'message escaped');
assert.ok(!renderRow(error, { ...ctx, hostState: 'paused' }).includes('shell-banner-dismiss'), 'no X when not running');
assert.ok(!renderRow(orderRows({ errors: [{ source: 'effect', message: 'x', retry: false, id: 1 }] })[0], ctx).includes('shell-banner-retry'), 'retry false: no Retry');
const mac = renderRow(orderRows({ errors: [{ source: 'reload', message: 'permission_denied: no', id: 1 }] })[0], { ...ctx, platform: 'mac' });
assert.ok(mac.includes('Screen Recording is off.') && mac.includes('id="shell-banner-retry-reload" data-action="retry" data-key='), 'permission row: shared html, delegated Retry');
const audio = renderRow(orderRows({ errors: [{ source: 'audio_permission', message: 's', id: 1 }] })[0], ctx);
assert.ok(audio.includes('id="shell-banner-retry-audio_permission" data-action="retry"'));
const condition = renderRow(orderRows({ conditions: [{ source: 'x', message: '<i>' }] })[0], ctx);
assert.ok(condition.includes('&lt;i&gt;') && !condition.includes('<button'), 'condition: escaped, no buttons');
assert.ok(renderRow(orderRows({ conditions: [{ source: 'local_network', message: '' }] })[0], ctx).includes("reach devices"), 'local_network row');
const note = renderRow(orderRows({ notes: ['hi & bye'] })[0], ctx);
assert.ok(note.includes('hi &amp; bye') && !note.includes('<button'));
const test = renderRow(orderRows({ lightTest: { holder: { session: 'x', client: 'mcp' }, endsAtMs: 100_000 } })[0], ctx);
assert.ok(test.includes('An agent is testing an effect on the lights. Will revert in: <span id="shell-light-test-time">1:40</span>'));
assert.ok(test.includes('id="shell-light-test-stop" data-action="stop-test" data-key="test:x:once"'));
assert.ok(!renderRow(orderRows({ lightTest: { holder: null, endsAtMs: null } })[0], ctx).includes('Will revert'), 'live: no countdown');
const pairing = renderRow(orderRows({ pairings: [{ ref: 'r<1', name: 'Phone', scope: 'apply', code: 'K7Q2X', from: '10.0.0.2' }] })[0], ctx);
assert.ok(pairing.includes('data-action="approve"') && pairing.includes('data-action="deny"'));
assert.ok(pairing.includes('Access:</span> Apply.') && pairing.includes('From:</span> 10.0.0.2'));
assert.ok(pairing.includes('id="shell-pairing-approve-r&lt;1"'));
assert.ok(pairing.includes('shell-pairing-title"><span class="shell-mark shell-mark-info" aria-hidden="true"></span> Pair a device'), 'a request carries the circled-info, like the light test');
// The toggle: one id, aria-expanded, label swaps; marks and tones per part.
const closedBar = renderRow(toggleOf(mixed, collapsibleKeys(mixed)), ctx);
assert.ok(closedBar.startsWith('<button type="button" class="shell-banner-summary" id="shell-banner-toggle" aria-expanded="false" data-action="toggle" data-key="toggle">'));
assert.ok(closedBar.includes('<span class="shell-count"><span class="shell-mark shell-mark-info" aria-hidden="true"></span> 1 notice</span><span class="shell-count shell-count-error"><span class="shell-mark shell-mark-error" aria-hidden="true"></span> 3 errors</span>'));
const openBar = renderRow(toggleOf(mixed, null), ctx);
assert.ok(openBar.includes('id="shell-banner-toggle" aria-expanded="true"') && openBar.includes('shell-banner-quiet') && openBar.includes('Show less'));
assert.ok(!renderRow(toggleOf(problems(1), collapsibleKeys(problems(1))), ctx).includes('notice'), 'a zero part is omitted');
// Open rows carry the marks: error rows the circled-exclamation, the light test the circled-info.
assert.ok(renderRow(mixed.find((row) => row.kind === 'error'), ctx).includes('shell-mark-error') && !renderRow(mixed.find((row) => row.kind === 'error'), ctx).includes('warn-glyph'));
assert.ok(renderRow(mixed.find((row) => row.kind === 'light-test'), ctx).includes('shell-mark-info'));
assert.ok(renderRow(mixed.find((row) => row.kind === 'note'), ctx).includes('shell-mark-error'));
assert.equal(markErrors('<span class="warn-glyph" aria-hidden="true"></span> x'), '<span class="shell-mark shell-mark-error" aria-hidden="true"></span> x');

// bannerRows and bannerHtml: signatures leave the countdown out; no rows is ''.
const at = (nowMs) => bannerRows({ lightTest: { holder: { session: 'x' }, endsAtMs: 100_000 } }, { nowMs })[0];
assert.notEqual(at(0).html, at(10_000).html);
assert.equal(at(0).sig, at(10_000).sig, 'a ticking clock is not a change');
assert.equal(bannerHtml([]), '');
assert.equal(bannerHtml(bannerRows({ notes: ['n'] })).startsWith('<div class="shell-banner"><div class="shell-banner-inner"><div class="shell-banner-row"'), true);
assert.notEqual(bannerRows({ errors: [{ source: 'reload', message: 'm', id: 1 }] }, { hostState: 'running' })[0].sig, bannerRows({ errors: [{ source: 'reload', message: 'm', id: 1 }] }, { hostState: 'paused' })[0].sig, 'same key, new content: replaced');

// Arrivals (Aurora-9hqa.2): a key the previous render did not hold is new; nothing before the baseline.
{
  const input = (extra = {}) => ({ errors: [{ source: 'startup', message: 'a', id: 1 }], ...extra });
  const rowsOf = (extra) => orderRows(input(extra));
  assert.deepEqual(arrivedKeys(rowsOf(), null), [], 'before the baseline: nothing is new');
  assert.deepEqual(arrivedKeys(rowsOf(), undefined), []);
  assert.deepEqual(arrivedKeys(rowsOf(), ['error:startup:a']), [], 'the same rows: nothing new');
  assert.deepEqual(arrivedKeys(rowsOf(), new Set(['error:startup:a'])), [], 'a Set works too');
  assert.deepEqual(arrivedKeys(rowsOf({ notes: ['n'] }), ['error:startup:a']), ['note:n'], 'an arrival');
  assert.deepEqual(arrivedKeys(orderRows({ errors: [{ source: 'startup', message: 'b', id: 2 }] }), ['error:startup:a']), ['error:startup:b'], 'a changed message is a new key');
  assert.deepEqual(arrivedKeys(rowsOf(), []), ['error:startup:a'], 'known and empty: everything is new');
  // The countdown is not part of the key; the toggle is never a row of orderRows.
  const test = (ms) => orderRows({ lightTest: { holder: { session: 's' }, endsAtMs: ms } });
  assert.deepEqual(arrivedKeys(test(5000), test(90_000).map((row) => row.key)), [], 'a ticking countdown is not new');
  assert.ok(!arrivedKeys(layoutRows(rowsOf(), null), []).includes('toggle'), 'the toggle never pulses');
  // Pairing rows arrive like any other row.
  assert.deepEqual(arrivedKeys(rowsOf({ pairings: [{ ref: 'r1' }] }), ['error:startup:a']), ['pairing:r1']);
  // bannerRows flags only the fresh keys, and the html and the sig do not change with it.
  const plain = bannerRows(input({ pairings: [{ ref: 'r1' }] }));
  const flagged = bannerRows(input({ pairings: [{ ref: 'r1' }] }), { fresh: ['pairing:r1'] });
  assert.deepEqual(flagged.filter((row) => row.isNew).map((row) => row.key), ['pairing:r1']);
  assert.ok(plain.every((row) => !row.isNew), 'no fresh keys: nothing flagged');
  assert.deepEqual(flagged.map((row) => [row.html, row.sig]), plain.map((row) => [row.html, row.sig]), 'data-new is state, not part of the html or the sig');
  assert.ok(!flagged.find((row) => row.kind === 'toggle').isNew);
}

// Announcement words, one per row kind, joined in drawn order; no buttons, no countdown, no code.
{
  const all = orderRows({
    lightTest: { holder: { session: 's', client: 'mcp' }, endsAtMs: 90_000 },
    pairings: [{ ref: 'r1', name: 'Kitchen <tablet>', code: 'K7Q2X' }, { ref: 'r2' }],
    conditions: [{ source: 'local_network' }, { source: 'other', message: 'Something is off' }],
    errors: [{ source: 'startup', message: 'port in use', id: 1 }, { source: 'audio_permission', message: 'silent', id: 2 }],
    notes: ["Couldn't save Fire: nope"],
  });
  const say = (kind, index = 0) => arrivalAnnouncement(all, all.filter((row) => row.kind === kind).slice(index, index + 1).map((row) => row.key), { hostState: 'running', platform: 'mac' });
  assert.equal(say('light-test'), 'An agent is testing an effect on the lights.');
  assert.equal(say('pairing'), 'Pair a device with Aurora? Kitchen <tablet>.');
  assert.equal(say('pairing', 1), 'Pair a device with Aurora?', 'no device name: the question alone');
  assert.equal(say('condition'), "Aurora can't reach devices on your network. In Settings, click Local Network and allow Aurora.");
  assert.equal(say('condition', 1), 'Something is off');
  assert.equal(say('error'), 'Aurora can\'t hear any audio. If needed, allow Aurora under "System Audio Recording Only" in System Settings.', 'newest id first: the audio row');
  assert.equal(say('error', 1), "Couldn't start: port in use");
  assert.equal(say('note'), "Couldn't save Fire: nope");
  assert.ok(!all.map((row) => arrivalAnnouncement(all, [row.key])).join(' ').includes('K7Q2X'), 'the code is read on screen, not announced');
  assert.equal(arrivalAnnouncement(all, [all[0].key, all[all.length - 1].key]), 'An agent is testing an effect on the lights. ' + "Couldn't save Fire: nope", 'one announcement, in drawn order');
  assert.equal(arrivalAnnouncement(all, []), '', 'nothing arrived: nothing said');
}

console.log('shellRows checks passed.');
