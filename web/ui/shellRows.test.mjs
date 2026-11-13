// The error shell's row model (Aurora-9hqa.1): order, keys, the collapse layout, the collapsed
// label, and the html per row. No DOM. Run with `node shellRows.test.mjs`.
import assert from 'node:assert/strict';
import { SOURCE_PREFIX, bannerHtml, bannerRows, clockText, collapsedLabel, errorSentence, layoutRows, orderRows, renderRow } from './shellRows.js';

// Words.
assert.equal(SOURCE_PREFIX.startup, "Couldn't start: ");
assert.equal(errorSentence({ source: 'startup', message: 'port in use' }, 'failed'), "Couldn't start: port in use");
assert.equal(errorSentence({ source: 'effect', message: 'Fire busy' }, 'running'), 'Fire busy');
assert.equal(errorSentence({ source: 'mystery', message: 'x' }, 'running'), 'x', 'unknown source: bare');
assert.equal(errorSentence({ source: 'reload', message: 'boom' }, 'paused'), "Couldn't apply settings: boom");
assert.ok(errorSentence({ source: 'reload', message: 'boom' }, 'running').startsWith("Saved, but couldn't apply: boom."));
assert.equal(collapsedLabel(1), '1 problem');
assert.equal(collapsedLabel(2), '2 problems');
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

// Collapse layout (rules unchanged): one problem open; two or more fold to a summary, notices stay.
const problems = (n) => orderRows({ errors: Array.from({ length: n }, (_, i) => ({ source: `s${i}`, message: 'm' })) });
assert.deepEqual(layoutRows(problems(1), false).map((row) => row.kind), ['error']);
assert.deepEqual(layoutRows(problems(2), false).map((row) => [row.kind, row.count]), [['summary', 2]]);
assert.deepEqual(layoutRows(problems(2), true).map((row) => row.kind), ['error', 'error', 'less']);
const withTest = orderRows({ lightTest: { holder: null, endsAtMs: null }, errors: [{ source: 'a', message: '1' }, { source: 'b', message: '2' }] });
assert.deepEqual(layoutRows(withTest, false).map((row) => row.kind), ['light-test', 'summary'], 'a light test is not a problem');
assert.deepEqual(layoutRows(orderRows({ lightTest: { holder: null, endsAtMs: null }, pairings: [{ ref: 'r' }] }), false).map((row) => row.kind), ['light-test', 'pairing']);

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
const two = layoutRows(problems(2), false);
assert.equal(renderRow(two[0], ctx), '<button type="button" class="shell-banner-summary" id="shell-banner-expand" data-action="expand" data-key="summary"><span class="warn-glyph" aria-hidden="true"></span> 2 problems <span class="accordion-chevron" aria-hidden="true"></span></button>');
assert.ok(renderRow({ kind: 'less', key: 'less' }, ctx).includes('data-action="collapse" data-key="less"'));

// bannerRows and bannerHtml: signatures leave the countdown out; no rows is ''.
const at = (nowMs) => bannerRows({ lightTest: { holder: { session: 'x' }, endsAtMs: 100_000 } }, { nowMs })[0];
assert.notEqual(at(0).html, at(10_000).html);
assert.equal(at(0).sig, at(10_000).sig, 'a ticking clock is not a change');
assert.equal(bannerHtml([]), '');
assert.equal(bannerHtml(bannerRows({ notes: ['n'] })).startsWith('<div class="shell-banner"><div class="shell-banner-inner"><div class="shell-banner-row"'), true);
assert.notEqual(bannerRows({ errors: [{ source: 'reload', message: 'm', id: 1 }] }, { hostState: 'running' })[0].sig, bannerRows({ errors: [{ source: 'reload', message: 'm', id: 1 }] }, { hostState: 'paused' })[0].sig, 'same key, new content: replaced');

console.log('shellRows checks passed.');
