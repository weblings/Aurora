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

// One count part: '1 notice', '2 notices', '1 error', '2 errors'.
function countPart(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// The collapsed bar's label as plain text: notices first, then errors, each part left out at zero
// ('1 notice 2 errors', '3 errors', '1 notice'). The bar draws each part with its own mark.
export function collapsedLabel(notices, errors) {
  return [notices > 0 ? countPart(notices, 'notice') : '', errors > 0 ? countPart(errors, 'error') : ''].filter(Boolean).join(' ');
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

// What the collapse covers (Aurora-u8jx.5). Pairing requests stay above the shell and outside it
// (each waits on a click) until Aurora-9hqa.4. Everything else folds as one: the light test is a
// notice; conditions, host errors and the page's own notes are errors.
const isCollapsible = (row) => row.kind !== 'pairing';
const isNotice = (row) => row.kind === 'light-test';

// The keys of the rows the collapse covers, in drawn order.
export function collapsibleKeys(rows) {
  return rows.filter(isCollapsible).map((row) => row.key);
}

function sameKeys(a, b) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((key) => set.has(key));
}

// Collapsed state is a stored snapshot of the row keys taken when the shell collapsed, or null for
// open. The shell shows collapsed only while the current keys equal it, so a new row or a changed
// message (a new key) opens it, and the light-test countdown (not part of a key) never does.
export function isCollapsed(rows, snapshot) {
  return Array.isArray(snapshot) && snapshot.length > 0 && sameKeys(collapsibleKeys(rows), snapshot);
}

// The snapshot to keep after a draw: dropped once the rows no longer match it (the shell opened,
// so it stays open) or when they clear (reset), else unchanged.
export function reconcileSnapshot(rows, snapshot) {
  return isCollapsed(rows, snapshot) ? snapshot : null;
}

// The baseline, taken from the first /api/state reply and again on recovery from the takeover:
// two or more rows start collapsed, a lone row starts open.
export function baselineSnapshot(rows) {
  const keys = collapsibleKeys(rows);
  return keys.length >= 2 ? keys : null;
}

// The rows as drawn: pairing requests, then either the collapsed bar alone or every row plus the
// same toggle (label swapped to Show less). A lone row can collapse too, so any collapsible row
// brings the toggle.
/**
 * @param {Array<Record<string, any>>} rows
 * @param {string[] | null} snapshot
 * @returns {Array<Record<string, any>>}
 */
export function layoutRows(rows, snapshot) {
  const covered = rows.filter(isCollapsible);
  const pairings = rows.filter((row) => !isCollapsible(row));
  if (covered.length === 0) return pairings;
  const collapsed = isCollapsed(rows, snapshot);
  const notices = covered.filter(isNotice).length;
  const toggle = { kind: 'toggle', key: 'toggle', collapsed, notices, errors: covered.length - notices };
  return collapsed ? [...pairings, toggle] : [...pairings, ...covered, toggle];
}

// The marks: Grille's circled-exclamation (errors, error red) and circled-info (notices, default
// colour) as CSS-mask spans, the way .warn-glyph is drawn (styles/shell.css).
const ERROR_MARK = '<span class="shell-mark shell-mark-error" aria-hidden="true"></span>';
const INFO_MARK = '<span class="shell-mark shell-mark-info" aria-hidden="true"></span>';

// An error row's html from a shared string (the permission and local-network rows) carries the old
// warning triangle; the shell's error rows draw the circled-exclamation instead.
export function markErrors(html) {
  return html.replaceAll('<span class="warn-glyph" aria-hidden="true"></span>', ERROR_MARK);
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
  return html === null ? null : markErrors(html.replace(`id="${retryId}"`, `id="${retryId}" data-action="retry" data-key="${escapeHtml(key)}"`));
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
      <p class="status-text shell-pairing-title">${INFO_MARK} ${lightTesterSentence(row.holder)}${clock}</p>
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
        ? markErrors(renderLocalNetworkBanner())
        : `<p class="status-text status-text-error">${ERROR_MARK} ${escapeHtml(row.condition.message ?? '')}</p>`;
      return `<div class="shell-banner-row" data-key="${key}"><div class="shell-banner-content">${inner}</div></div>`;
    }
    case 'error': {
      const error = row.error;
      const retryId = `shell-banner-retry-${escapeHtml(error.source)}`;
      const inner = permissionRowHtml(error, platform, row.key)
        ?? `<p class="status-text status-text-error">${ERROR_MARK} ${escapeHtml(errorSentence(error, hostState))}</p>
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
      return `<div class="shell-banner-row" data-key="${key}"><div class="shell-banner-content"><p class="status-text status-text-error">${ERROR_MARK} ${escapeHtml(row.text)}</p></div></div>`;
    case 'toggle': {
      // One button for both states, so it is the same node across a toggle and keeps focus.
      if (!row.collapsed) {
        return `<button type="button" class="shell-banner-summary shell-banner-collapse shell-banner-quiet" id="shell-banner-toggle" aria-expanded="true" ${act('toggle')}>Show less <span class="accordion-chevron shell-banner-chevron-up" aria-hidden="true"></span></button>`;
      }
      const part = (n, word, mark, tone) => (n > 0 ? `<span class="shell-count${tone}">${mark} ${countPart(n, word)}</span>` : '');
      return `<button type="button" class="shell-banner-summary" id="shell-banner-toggle" aria-expanded="false" ${act('toggle')}>${part(row.notices, 'notice', INFO_MARK, '')}${part(row.errors, 'error', ERROR_MARK, ' shell-count-error')} <span class="accordion-chevron" aria-hidden="true"></span></button>`;
    }
    default:
      return '';
  }
}

// The laid-out rows with their html and a patch signature. The signature is what decides keep or
// replace for a row whose key is unchanged: the html, except that the light-test countdown is left
// out (its own timer ticks it, so a poll must not replace the row and drop focus on Stop test).
export function bannerRows(input, { snapshot = null, hostState = null, platform = '', nowMs = Date.now() } = {}) {
  return layoutRows(orderRows(input), snapshot).map((row) => {
    const html = renderRow(row, { hostState, platform, nowMs });
    const sig = row.kind === 'light-test' ? html.replace(/(<span id="shell-light-test-time">)[^<]*/, '$1') : html;
    return { ...row, html, sig, inPlace: row.kind === 'toggle' };
  });
}

// The whole banner as the slot holds it, or '' for no rows.
export function bannerHtml(rows) {
  return rows.length === 0
    ? ''
    : `<div class="shell-banner"><div class="shell-banner-inner">${rows.map((row) => row.html).join('')}</div></div>`;
}
