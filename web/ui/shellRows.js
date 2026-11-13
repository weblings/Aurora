import { friendlyReloadError } from './messages.js';
import { testerName } from './testHolder.js';
import { parseMacPermissionError, renderAudioPermissionBanner, renderLocalNetworkBanner, renderReloadError } from './MacPermissionRecovery.js';

// The error shell's row model (Aurora-9hqa.1), shared by the Dashboard (shell.js) and the graph
// editor (graph-editor/src/ErrorShell.tsx) so both pages hold the same rows, in the same order,
// under the same keys and words. Plain JS with no DOM: shell.js draws the html strings with a keyed
// patch (shellPatch.js), the editor renders its own JSX from the same ordered rows and keys.
// Design: docs/planning/ErrorOverlay.md, 'The banner' (Rows).
//
// Order (top to bottom): notices (the light-test row, then pairing requests), conditions as the
// daemon sent them, host errors newest first by id, then notes the page supplies itself (the
// editor's own). The daemon's error array is first-seen order (it replaces in place), so errors
// are sorted here; conditions are appended and replaced in place, so they are kept as sent.
//
// Row key: what identifies a row across polls. Errors and conditions: source + message, so a
// changed message is a different row (replaced, not patched). Light test: holder + Live/Once; the
// countdown is not part of it. Pairing: the request's ref.

// Row prefix per error source, so the raw server reason reads as a sentence
// ("Couldn't start: <reason>"). Unknown sources show the message bare.
export const SOURCE_PREFIX = {
  startup: "Couldn't start: ",
  resume: "Couldn't resume: ",
  reload: "Couldn't apply settings: ",
  effect: '', // the message already names the effect (Aurora-kep2.4)
};

// The row's sentence. A reload error on a running host means the old setup still drives the lights.
export function errorSentence(error, hostState) {
  const message = friendlyReloadError(error.message);
  return hostState === 'running' && error.source === 'reload'
    ? `Saved, but couldn't apply: ${message}. Aurora is still running your previous setup and will try the new one next time it starts.`
    : (SOURCE_PREFIX[error.source] ?? '') + message;
}

// The collapsed summary's count, singular and plural.
export function collapsedLabel(count) {
  return count === 1 ? '1 problem' : `${count} problems`;
}

// m:ss left on a light test.
export function clockText(endsAtMs, nowMs = Date.now()) {
  const seconds = Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function lightTesterSentence(holder) {
  const who = testerName(holder);
  return `${who[0].toUpperCase()}${who.slice(1)} is testing an effect on the lights.`;
}

// Same source, same text: two rows must never share a key (the patch finds rows by it).
function uniqueKeys(rows) {
  const seen = new Map();
  for (const row of rows) {
    const n = seen.get(row.key) ?? 0;
    seen.set(row.key, n + 1);
    if (n > 0) row.key = `${row.key}#${n + 1}`;
  }
  return rows;
}

// The rows in order, without the collapse layout or any html.
//   input: { conditions, errors, notes, lightTest: {holder, endsAtMs|null}|null, pairings }
// Kinds: 'light-test' | 'pairing' | 'condition' | 'error' | 'note'.
/**
 * @param {{conditions?: any[], errors?: any[], notes?: string[], lightTest?: any, pairings?: any[]}} [input]
 * @returns {Array<Record<string, any>>}
 */
export function orderRows({ conditions = [], errors = [], notes = [], lightTest = null, pairings = [] } = {}) {
  const rows = [];
  if (lightTest) {
    const live = lightTest.endsAtMs === null || lightTest.endsAtMs === undefined;
    rows.push({ kind: 'light-test', key: `test:${lightTest.holder?.session ?? ''}:${live ? 'live' : 'once'}`, holder: lightTest.holder ?? null, endsAtMs: live ? null : lightTest.endsAtMs });
  }
  for (const request of pairings) rows.push({ kind: 'pairing', key: `pairing:${request.ref}`, request });
  for (const condition of conditions) rows.push({ kind: 'condition', key: `condition:${condition.source}:${condition.message ?? ''}`, condition });
  const newestFirst = errors
    .map((error, index) => ({ error, index }))
    .sort((a, b) => (Number.isInteger(b.error.id) ? b.error.id : -Infinity) - (Number.isInteger(a.error.id) ? a.error.id : -Infinity) || a.index - b.index);
  for (const { error } of newestFirst) rows.push({ kind: 'error', key: `error:${error.source}:${error.message ?? ''}`, source: error.source, error });
  for (const text of notes) rows.push({ kind: 'note', key: `note:${text}`, text });
  return uniqueKeys(rows);
}

// Conditions, errors and notes are 'problems'; the light test and pairing requests are not.
const isProblem = (row) => row.kind === 'condition' || row.kind === 'error' || row.kind === 'note';

// The collapse rule (unchanged by 9hqa.1): two or more problems collapse to one summary row the
// user expands, and expanded they gain a Show less row. A single problem always shows in full.
/**
 * @param {Array<Record<string, any>>} rows
 * @param {boolean} expanded
 * @returns {Array<Record<string, any>>}
 */
export function layoutRows(rows, expanded) {
  const problems = rows.filter(isProblem);
  const collapsible = problems.length > 1;
  if (!collapsible) return rows;
  if (!expanded) {
    const at = rows.findIndex(isProblem);
    return [...rows.slice(0, at), { kind: 'summary', key: 'summary', count: problems.length }];
  }
  return [...rows, { kind: 'less', key: 'less' }];
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// A Mac permission row or the audio row: shared html strings whose Retry is found by id; this
// adds the data attributes the shell's one delegated click handler reads. null for any other row.
export function permissionRowHtml(error, platform, key) {
  const retryId = `shell-banner-retry-${escapeHtml(error.source)}`;
  const html = error.source === 'audio_permission'
    ? renderAudioPermissionBanner({ retryId })
    : platform === 'mac' && parseMacPermissionError(error.message)
      ? renderReloadError(error.message, platform, { retryId })
      : null;
  return html === null ? null : html.replace(`id="${retryId}"`, `id="${retryId}" data-action="retry" data-key="${escapeHtml(key)}"`);
}

// A pairing request's access line: browsers ask for admin and read as before; below admin is an
// agent token (aurora-mcp --pair), so the approver sees what it can do.
function pairingAccess(scope) {
  const access = {
    read: 'View only.',
    draft: 'Edit drafts, not the lights.',
    apply: 'Change effects and test on the lights, not settings.',
  }[scope];
  return access ? `<li><span class="shell-pairing-label">Access:</span> ${scope[0].toUpperCase()}${scope.slice(1)}. ${access}</li>` : '';
}

// One row's html. Its root element carries data-key; its buttons carry data-action and data-key.
//   ctx: { hostState, platform, nowMs }
export function renderRow(row, { hostState = null, platform = '', nowMs = Date.now() } = {}) {
  const key = escapeHtml(row.key);
  const act = (action) => `data-action="${action}" data-key="${key}"`;
  switch (row.kind) {
    case 'light-test': {
      // No Keep here: that stays with the agent (confirm needs an effect id the user has not chosen).
      const clock = row.endsAtMs === null ? '' : ` Will revert in: <span id="shell-light-test-time">${clockText(row.endsAtMs, nowMs)}</span>`;
      return `<div class="shell-banner-row" data-key="${key}"><div class="shell-banner-content">
      <p class="status-text shell-pairing-title">${lightTesterSentence(row.holder)}${clock}</p>
      <div class="shell-banner-actions">
        <button type="button" class="btn btn-secondary" id="shell-light-test-stop" ${act('stop-test')}>Stop test</button>
      </div>
    </div></div>`;
    }
    case 'pairing': {
      const request = row.request;
      const ref = escapeHtml(request.ref);
      // The code is the user's check that the request is their own device.
      return `<div class="shell-banner-row" data-key="${key}"><div class="shell-banner-content">
      <p class="status-text shell-pairing-title">Pair a device with Aurora?</p>
      <ul class="shell-pairing-details">
        <li><span class="shell-pairing-label">Device:</span> ${escapeHtml(request.name ?? '')}</li>
        ${request.from ? `<li><span class="shell-pairing-label">From:</span> ${escapeHtml(request.from)}</li>` : ''}
        ${pairingAccess(request.scope)}
        <li><span class="shell-pairing-label">Code:</span> <strong class="shell-pairing-code">${escapeHtml(request.code ?? '')}</strong>. Approve only if the device shows the same code.</li>
      </ul>
      <div class="shell-banner-actions">
        <button type="button" class="btn btn-primary" id="shell-pairing-approve-${ref}" ${act('approve')}>Approve</button>
        <button type="button" class="btn btn-secondary" id="shell-pairing-deny-${ref}" ${act('deny')}>Deny</button>
      </div>
    </div></div>`;
    }
    case 'condition': {
      // Standing facts, not failures: no Retry (the daemon re-checks and clears them itself) and no X.
      // A new known source adds an entry here, not a branch in the shell.
      const inner = row.condition.source === 'local_network'
        ? renderLocalNetworkBanner()
        : `<p class="status-text status-text-error"><span class="warn-glyph" aria-hidden="true"></span> ${escapeHtml(row.condition.message ?? '')}</p>`;
      return `<div class="shell-banner-row" data-key="${key}"><div class="shell-banner-content">${inner}</div></div>`;
    }
    case 'error': {
      const error = row.error;
      const retryId = `shell-banner-retry-${escapeHtml(error.source)}`;
      const inner = permissionRowHtml(error, platform, row.key)
        ?? `<p class="status-text status-text-error"><span class="warn-glyph" aria-hidden="true"></span> ${escapeHtml(errorSentence(error, hostState))}</p>
         ${error.retry === false ? '' : `<button type="button" class="btn btn-secondary" id="${retryId}" ${act('retry')} style="margin-top: var(--aurora-space-3);">Retry</button>`}`;
      // X only while the old setup still works (ErrorOverlay.md, 'Dismiss'): a paused or failed
      // host's row is the reason there are no lights.
      const dismiss = hostState === 'running' && Number.isInteger(error.id)
        ? `<button type="button" class="shell-banner-dismiss" id="shell-banner-dismiss-${escapeHtml(error.source)}" ${act('dismiss')} aria-label="Dismiss">×</button>`
        : '';
      // Content wrapped so the row can flex dismiss-beside-text (see shell.css).
      return `<div class="shell-banner-row" data-key="${key}"><div class="shell-banner-content">${inner}</div>${dismiss}</div>`;
    }
    case 'note':
      return `<div class="shell-banner-row" data-key="${key}"><div class="shell-banner-content"><p class="status-text status-text-error"><span class="warn-glyph" aria-hidden="true"></span> ${escapeHtml(row.text)}</p></div></div>`;
    case 'summary':
      // Same chevron-down.svg the accordions use (dashboard.css's .accordion-chevron).
      return `<button type="button" class="shell-banner-summary" id="shell-banner-expand" ${act('expand')}><span class="warn-glyph" aria-hidden="true"></span> ${collapsedLabel(row.count)} <span class="accordion-chevron" aria-hidden="true"></span></button>`;
    case 'less':
      return `<button type="button" class="shell-banner-summary shell-banner-collapse" id="shell-banner-collapse" ${act('collapse')}>Show less <span class="accordion-chevron shell-banner-chevron-up" aria-hidden="true"></span></button>`;
    default:
      return '';
  }
}

// The laid-out rows with their html and a patch signature. The signature is what decides keep or
// replace for a row whose key is unchanged: the html, except that the light-test countdown is left
// out (its own timer ticks it, so a poll must not replace the row and drop focus on Stop test).
export function bannerRows(input, { expanded = false, hostState = null, platform = '', nowMs = Date.now() } = {}) {
  return layoutRows(orderRows(input), expanded).map((row) => {
    const html = renderRow(row, { hostState, platform, nowMs });
    const sig = row.kind === 'light-test' ? html.replace(/(<span id="shell-light-test-time">)[^<]*/, '$1') : html;
    return { ...row, html, sig };
  });
}

// The whole banner as the slot holds it, or '' for no rows.
export function bannerHtml(rows) {
  return rows.length === 0
    ? ''
    : `<div class="shell-banner"><div class="shell-banner-inner">${rows.map((row) => row.html).join('')}</div></div>`;
}
