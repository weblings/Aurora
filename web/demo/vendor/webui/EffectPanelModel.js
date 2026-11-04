// Pure rules behind EffectPanel.js (Aurora-kep2.8), kept DOM-free so node can test
// them. Spec: the Aurora-kep2.2 design field and the kep2.6 row menu decisions.
import { effectTitle, lightTestActive } from './CaptureSource.js';

export const GROUPS = [
  { id: 'builtin', name: 'Built-in' },
  { id: 'custom', name: 'Custom' },
  { id: 'hidden', name: 'Hidden' },
];

// Groups render only when they hold an effect. Music pulse is left out of a build with
// no audio input. Rows keep the server's order (built-ins first, then the saved order).
export function buildGroups(effects, { hasAudio = true } = {}) {
  const listed = effects.filter((e) => hasAudio || e.id !== 'builtin.audio');
  const byOrder = [...listed].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  const groupOf = (e) => (e.hidden ? 'hidden' : e.builtin ? 'builtin' : 'custom');
  return GROUPS
    .map((g) => ({ ...g, effects: byOrder.filter((e) => groupOf(e) === g.id) }))
    .filter((g) => g.effects.length > 0);
}

// The id of the effect the lights show: never the pick. A light test is no row.
export function runningId(state) {
  if (lightTestActive(state)) return null;
  return typeof state?.effect === 'string' && state.effect !== '' ? state.effect : null;
}

// Trigger text is what Aurora is running. Nothing running, including a failed switch, reads
// "No effect running". An unreachable bridge (no state) keeps the last label.
export function triggerLabel(effects, state, previous = 'No effect running') {
  if (lightTestActive(state)) return 'Light test';
  if (!state) return previous;
  const id = runningId(state);
  if (!id) return 'No effect running';
  const effect = effects.find((e) => e.id === id);
  return effect ? effectTitle(effect) : (state.effectTitle || id);
}

// Menu items per kep2.2/kep2.6. Gated items are left out, never disabled. `first` and `last`
// are the row's place among its group's visible rows.
export function menuItems(effect, { running = false, canEdit = true, canDelete = true, first = false, last = false, testBase = false } = {}) {
  const hidden = !!effect.hidden;
  const items = [];
  if (canEdit) items.push('Edit graph');
  if (!effect.builtin) items.push('Rename');
  if (hidden) items.push('Unhide');
  items.push('Duplicate');
  if (!effect.builtin && !hidden) {
    if (!first) items.push('Move up');
    if (!last) items.push('Move down');
  }
  if (!hidden && !running) items.push('Hide');
  // Deleting the effect under a light test would end the test.
  if (!effect.builtin && canDelete && !testBase) items.push('Delete');
  return items;
}

// Focus order of the panel: headers, the rows of expanded groups, then New effect last.
export function flatItems(groups, expanded, { canEdit = true } = {}) {
  const out = [];
  for (const g of groups) {
    out.push({ type: 'group', id: g.id });
    if (expanded.has(g.id)) for (const e of g.effects) out.push({ type: 'row', id: e.id, group: g.id });
  }
  if (canEdit) out.push({ type: 'new', id: 'new' });
  return out;
}

// Rows in arrow order. Group headers and New effect are plain buttons reached by Tab.
export function rowItems(items) {
  return items.filter((i) => i.type === 'row');
}

// A key on the row button at `at` (index into rowItems). Returns what the view should do:
// { focus: index } | { actions: id } | { menu: id } | null for keys left to the browser (Enter and
// Space click the button) or to type-ahead. Arrows only move focus and never commit.
export function rowKey(rows, at, key, { shift = false } = {}) {
  const row = rows[at];
  if (!row) return null;
  switch (key) {
    case 'ArrowDown': return at + 1 < rows.length ? { focus: at + 1 } : {};
    case 'ArrowUp': return at > 0 ? { focus: at - 1 } : {};
    case 'Home': return { focus: 0 };
    case 'End': return { focus: rows.length - 1 };
    case 'ArrowRight': return { actions: row.id };
    case 'ContextMenu': return { menu: row.id };
    case 'F10': return shift ? { menu: row.id } : null;
    default: return null;
  }
}

// Type-ahead: the next item after `at` (wrapping) whose label starts with `typed`.
export function typeAhead(labels, at, typed) {
  const prefix = typed.toLowerCase();
  const order = [...labels.keys()].slice(at + 1).concat([...labels.keys()].slice(0, at + 1));
  const hit = order.find((i) => labels[i].toLowerCase().startsWith(prefix));
  return hit === undefined ? null : hit;
}

// Where focus lands when the row at `at` leaves the sequence (Hide, Unhide, Delete, an outside
// removal): the next row of its group, else the previous, else the group header, else the first item.
export function focusAfterRemoval(items, id) {
  const at = items.findIndex((i) => i.type === 'row' && i.id === id);
  if (at === -1) return null;
  const group = items[at].group;
  const next = items[at + 1];
  if (next?.type === 'row' && next.group === group) return next.id;
  const prev = items[at - 1];
  if (prev?.type === 'row' && prev.group === group) return prev.id;
  return group;
}

// Ids the panel must patch after an outside change, by effect id.
export function diffEffects(before, after) {
  const prev = new Map(before.map((e) => [e.id, e]));
  const next = new Map(after.map((e) => [e.id, e]));
  return {
    added: after.filter((e) => !prev.has(e.id)).map((e) => e.id),
    removed: before.filter((e) => !next.has(e.id)).map((e) => e.id),
    changed: after.filter((e) => prev.has(e.id) && JSON.stringify(prev.get(e.id)) !== JSON.stringify(e)).map((e) => e.id),
  };
}

// The polite live region text for a settled switch, or null while it is still pending.
// `reason` is the banner sentence's reason, passed through verbatim.
export function switchAnnouncement({ title, outcome, reason = '' }) {
  if (outcome === 'success') return `Switched to ${title}`;
  if (outcome === 'failed') return reason ? `Couldn't start ${title}: ${reason}` : `Couldn't start ${title}`;
  return null;
}

// --- row actions (Aurora-kep2.9) ------------------------------------------------------------

// The id slug the server accepts, as the graph editor's slugify/freshEffectId.
export function slugify(title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/g, '');
  return slug || 'effect';
}

export function freshEffectId(title, taken) {
  const used = new Set(taken);
  const base = slugify(title);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

// "X (Copy)", then "X (Copy 2)", "X (Copy 3)". Compared trimmed and case-insensitive.
export function duplicateTitle(title, takenTitles) {
  const norm = (t) => t.trim().toLowerCase();
  const used = new Set([...takenTitles].map(norm));
  const base = title.trim();
  if (!used.has(norm(`${base} (Copy)`))) return `${base} (Copy)`;
  for (let n = 2; ; n++) if (!used.has(norm(`${base} (Copy ${n})`))) return `${base} (Copy ${n})`;
}

// The title of another effect that already shows `title` (trimmed, case-insensitive), else null.
export function titleClash(title, effects, selfId) {
  const want = title.trim().toLowerCase();
  const hit = effects.find((e) => e.id !== selfId && effectTitle(e).trim().toLowerCase() === want);
  return hit ? effectTitle(hit) : null;
}

// The built-in the server runs for an empty activeEffectId (runsAudioMode): Music pulse unless
// a screen input is saved, and Screen colors on a build with no audio input.
export function fallbackBuiltinId({ activeInputName = '', hasAudio = true } = {}) {
  return activeInputName || !hasAudio ? 'builtin.video' : 'builtin.audio';
}

// Built-ins the "Start from" menu offers, hidden ones included.
export function startPoints(effects, { hasAudio = true } = {}) {
  return effects.filter((e) => e.builtin && (hasAudio || e.id !== 'builtin.audio'));
}

// The editor address for an effect id.
export function editorHref(id) {
  return `/graph-editor/?effect=${encodeURIComponent(id)}`;
}

// Live region text for a settled row action. `position` is { index, size } for Move.
export function actionAnnouncement(action, title, { ok = true, to = '', position = null } = {}) {
  if (!ok) return `Couldn't ${action.toLowerCase()} ${title}.`;
  switch (action) {
    case 'Hide': return `${title} hidden.`;
    case 'Unhide': return `${title} unhidden.`;
    case 'Delete': return `${title} deleted.`;
    case 'Duplicate': return `Duplicated as ${to}.`;
    case 'Rename': return `Renamed to ${to}.`;
    case 'Move up':
    case 'Move down': {
      const where = position ? `, ${position.index + 1} of ${position.size}` : '';
      return `${title} moved ${action === 'Move up' ? 'up' : 'down'}${where}.`;
    }
    default: return '';
  }
}

// Position of a row among its group's rows after a change, for the Move announcement.
export function positionIn(groups, id) {
  for (const g of groups) {
    const index = g.effects.findIndex((e) => e.id === id);
    if (index !== -1) return { index, size: g.effects.length };
  }
  return null;
}
