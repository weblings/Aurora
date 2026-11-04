// EffectPanelModel (Aurora-kep2.8): groups, trigger text, menus, the tree keyboard model, focus
// moves and outside changes. DOM-free. Run with `node EffectPanelModel.test.mjs`.
import assert from 'node:assert/strict';
import {
  actionAnnouncement, buildGroups, diffEffects, duplicateTitle, editorHref, fallbackBuiltinId, flatItems,
  focusAfterRemoval, freshEffectId, menuItems, positionIn, runningId, slugify, startPoints, switchAnnouncement,
  titleClash, treeKey, triggerLabel, typeAhead,
} from './EffectPanelModel.js';

const EFFECTS = [
  { id: 'builtin.video', builtin: true, title: 'Screen colors', order: 0 },
  { id: 'builtin.audio', builtin: true, title: 'Music pulse', order: 1 },
  { id: 'fire', builtin: false, title: 'Fire', order: 2 },
  { id: 'candle', builtin: false, title: 'Candle', order: 3 },
  { id: 'strobe', builtin: false, title: 'Strobe', hidden: true, order: 4 },
];
const ids = (g) => g.effects.map((e) => e.id);

// Groups render only when non-empty, hidden is a flag, audio-less builds drop Music pulse.
{
  const groups = buildGroups(EFFECTS);
  assert.deepEqual(groups.map((g) => g.id), ['builtin', 'custom', 'hidden']);
  assert.deepEqual(ids(groups[0]), ['builtin.video', 'builtin.audio']);
  assert.deepEqual(ids(groups[1]), ['fire', 'candle']);
  assert.deepEqual(buildGroups(EFFECTS, { hasAudio: false })[0].effects.map((e) => e.id), ['builtin.video']);
  const bothBuiltinsHidden = EFFECTS.map((e) => (e.builtin ? { ...e, hidden: true } : e));
  assert.deepEqual(buildGroups(bothBuiltinsHidden).map((g) => g.id), ['custom', 'hidden'], 'no Built-in header when empty');
  assert.deepEqual(buildGroups(EFFECTS.filter((e) => e.builtin)).map((g) => g.id), ['builtin']);
  const reordered = buildGroups([{ id: 'b', title: 'B', order: 5 }, { id: 'a', title: 'A', order: 2 }]);
  assert.deepEqual(ids(reordered[0]), ['a', 'b'], 'saved order');
}

// The check and trigger follow what runs.
{
  const running = { effect: 'fire', state: 'running' };
  assert.equal(runningId(running), 'fire');
  assert.equal(runningId({ effect: '' }), null);
  assert.equal(runningId({ effect: 'fire', test: { active: true } }), null, 'a light test is no row');
  assert.equal(triggerLabel(EFFECTS, running), 'Fire');
  assert.equal(triggerLabel(EFFECTS, { effect: 'fire', state: 'paused' }), 'Fire', 'paused keeps the name');
  assert.equal(triggerLabel(EFFECTS, { effect: null, state: 'failed' }), 'No effect running', 'failed switch');
  assert.equal(triggerLabel(EFFECTS, { effect: 'fire', test: { active: true } }), 'Light test');
  assert.equal(triggerLabel(EFFECTS, null, 'Fire'), 'Fire', 'dead bridge keeps the name');
  assert.equal(triggerLabel([], { effect: 'x', effectTitle: 'From state' }), 'From state');
  assert.equal(triggerLabel([], { effect: 'x' }), 'x');
}

// Row menus per kep2.2 and kep2.6, gated items left out.
{
  const [video, , fire, candle, strobe] = EFFECTS;
  assert.deepEqual(menuItems(video, {}), ['Edit graph', 'Duplicate', 'Hide']);
  assert.deepEqual(menuItems(video, { running: true }), ['Edit graph', 'Duplicate'], 'running omits Hide');
  assert.deepEqual(menuItems(fire, { first: true }), ['Edit graph', 'Rename', 'Duplicate', 'Move down', 'Hide', 'Delete']);
  assert.deepEqual(menuItems(candle, { last: true }), ['Edit graph', 'Rename', 'Duplicate', 'Move up', 'Hide', 'Delete']);
  assert.deepEqual(menuItems(strobe, {}), ['Edit graph', 'Rename', 'Unhide', 'Duplicate', 'Delete']);
  assert.deepEqual(menuItems({ ...video, hidden: true }, {}), ['Edit graph', 'Unhide', 'Duplicate']);
  assert.deepEqual(menuItems(fire, { canEdit: false, canDelete: false, first: true, last: true }), ['Rename', 'Duplicate', 'Hide'], 'no editor, not Admin');
  assert.deepEqual(menuItems(video, { canEdit: false, running: true }), ['Duplicate'], 'never empty');
  assert.equal(menuItems(fire, { testBase: true }).includes('Delete'), false, 'deleting the test base would end the test');
}

// Flat sequence: headers, rows of expanded groups, New effect last.
const groups = buildGroups(EFFECTS);
const open = new Set(['builtin', 'custom']);
const flat = flatItems(groups, open);
const keys = (items) => items.map((i) => (i.type === 'row' ? i.id : i.type === 'group' ? `g:${i.id}` : 'new'));
assert.deepEqual(keys(flat), ['g:builtin', 'builtin.video', 'builtin.audio', 'g:custom', 'fire', 'candle', 'g:hidden', 'new']);
assert.deepEqual(keys(flatItems(groups, open, { canEdit: false })).at(-1), 'g:hidden', 'no editor: no New effect');

// Tree keys: arrows only move focus, rows commit on Enter or Space, Right opens the menu.
{
  const at = (k) => keys(flat).indexOf(k);
  assert.deepEqual(treeKey(flat, at('fire'), 'ArrowDown'), { focus: at('candle') });
  assert.deepEqual(treeKey(flat, at('g:builtin'), 'ArrowUp'), {}, 'no wrap at the top');
  assert.deepEqual(treeKey(flat, at('new'), 'ArrowDown'), {}, 'no wrap at the bottom');
  assert.deepEqual(treeKey(flat, 3, 'Home'), { focus: 0 });
  assert.deepEqual(treeKey(flat, 0, 'End'), { focus: flat.length - 1 });
  assert.deepEqual(treeKey(flat, at('fire'), 'Enter'), { commit: 'fire' });
  assert.deepEqual(treeKey(flat, at('fire'), ' '), { commit: 'fire' });
  assert.equal(treeKey(flat, at('fire'), 'ArrowDown').commit, undefined, 'arrows never commit');
  assert.deepEqual(treeKey(flat, at('fire'), 'ArrowRight'), { menu: 'fire' });
  assert.deepEqual(treeKey(flat, at('fire'), 'ContextMenu'), { menu: 'fire' });
  assert.deepEqual(treeKey(flat, at('fire'), 'F10', { shift: true }), { menu: 'fire' });
  assert.equal(treeKey(flat, at('fire'), 'F10'), null, 'plain F10 is not ours');
  assert.deepEqual(treeKey(flat, at('fire'), 'ArrowLeft'), { focus: at('g:custom') }, 'Left goes to the group');
  assert.deepEqual(treeKey(flat, at('g:custom'), 'ArrowLeft', { expanded: open }), { collapse: 'custom' });
  assert.deepEqual(treeKey(flat, at('g:custom'), 'ArrowRight', { expanded: open }), { focus: at('fire') }, 'open group: Right enters');
  assert.deepEqual(treeKey(flat, at('g:hidden'), 'ArrowRight', { expanded: open }), { expand: 'hidden' });
  assert.deepEqual(treeKey(flat, at('g:custom'), 'Enter', { expanded: open }), { toggle: 'custom' });
  assert.deepEqual(treeKey(flat, at('new'), 'Enter'), { newEffect: true });
  assert.deepEqual(treeKey(flat, at('new'), 'ArrowRight'), {}, 'New effect has no menu');
  assert.equal(treeKey(flat, at('fire'), 'q'), null, 'letters fall through to type-ahead');

  const labels = ['Built-in', 'Screen colors', 'Music pulse', 'Custom', 'Fire', 'Candle', 'Hidden', 'New effect'];
  assert.equal(typeAhead(labels, 0, 'ca'), 5);
  assert.equal(typeAhead(labels, 5, 'ca'), 5, 'wraps back to itself');
  assert.equal(typeAhead(labels, 4, 'm'), 2, 'wraps past the end');
  assert.equal(typeAhead(labels, 0, 'zz'), null);
}

// Focus after a row leaves: next in its group, else previous, else the group.
{
  assert.equal(focusAfterRemoval(flat, 'fire'), 'candle');
  assert.equal(focusAfterRemoval(flat, 'candle'), 'fire');
  const single = flatItems(buildGroups(EFFECTS.filter((e) => e.id !== 'candle')), open);
  assert.equal(focusAfterRemoval(single, 'fire'), 'custom', 'only row: its group');
  assert.equal(focusAfterRemoval(flat, 'nope'), null);
  const collapsed = flatItems(groups, new Set(['builtin']));
  assert.equal(focusAfterRemoval(collapsed, 'fire'), null, 'a collapsed row is not in the sequence');
}

// Outside changes patch by effect id.
{
  const next = [
    ...EFFECTS.filter((e) => e.id !== 'candle').map((e) => (e.id === 'fire' ? { ...e, title: 'Fire 2' } : e)),
    { id: 'new-one', builtin: false, title: 'New one', order: 9 },
  ];
  assert.deepEqual(diffEffects(EFFECTS, next), { added: ['new-one'], removed: ['candle'], changed: ['fire'] });
  assert.deepEqual(diffEffects(EFFECTS, EFFECTS), { added: [], removed: [], changed: [] });
}

// The polite live region reads settled switches only.
{
  assert.equal(switchAnnouncement({ title: 'Fire', outcome: 'success' }), 'Switched to Fire');
  assert.equal(switchAnnouncement({ title: 'Fire', outcome: 'failed', reason: 'no audio input is set up' }), "Couldn't start Fire: no audio input is set up");
  assert.equal(switchAnnouncement({ title: 'Fire', outcome: 'failed' }), "Couldn't start Fire");
  assert.equal(switchAnnouncement({ title: 'Fire', outcome: 'pending' }), null);
}


// Row actions (Aurora-kep2.9): duplicate naming, rename clashes, delete fallback, start points.
{
  assert.equal(duplicateTitle('Fire', ['Fire']), 'Fire (Copy)');
  assert.equal(duplicateTitle('Fire', ['Fire', 'Fire (Copy)']), 'Fire (Copy 2)');
  assert.equal(duplicateTitle('Fire', ['fire', 'FIRE (copy)', 'Fire (Copy 2)']), 'Fire (Copy 3)', 'case-insensitive');
  assert.equal(slugify('Fire (Copy 2)'), 'fire-copy-2');
  assert.equal(slugify('!!!'), 'effect');
  assert.equal(freshEffectId('Fire (Copy)', ['fire-copy']), 'fire-copy-2');
  assert.equal(titleClash(' candle ', EFFECTS, 'fire'), 'Candle');
  assert.equal(titleClash('Fire', EFFECTS, 'fire'), null, 'its own title is no clash');
  assert.equal(titleClash('Screen colors', EFFECTS, 'fire'), 'Screen colors', 'built-in titles count');
  assert.equal(fallbackBuiltinId({ activeInputName: '' }), 'builtin.audio');
  assert.equal(fallbackBuiltinId({ activeInputName: 'Monitor 1' }), 'builtin.video');
  assert.equal(fallbackBuiltinId({ activeInputName: '', hasAudio: false }), 'builtin.video');
  const hiddenVideo = EFFECTS.map((e) => (e.id === 'builtin.video' ? { ...e, hidden: true } : e));
  assert.deepEqual(startPoints(hiddenVideo).map((e) => e.id), ['builtin.video', 'builtin.audio'], 'hidden ones included');
  assert.deepEqual(startPoints(EFFECTS, { hasAudio: false }).map((e) => e.id), ['builtin.video']);
  assert.equal(editorHref('a b'), '/graph-editor/?effect=a%20b');
}

// Live region sentences and the Move position.
{
  assert.equal(actionAnnouncement('Hide', 'Fire'), 'Fire hidden.');
  assert.equal(actionAnnouncement('Unhide', 'Fire'), 'Fire unhidden.');
  assert.equal(actionAnnouncement('Delete', 'Fire'), 'Fire deleted.');
  assert.equal(actionAnnouncement('Duplicate', 'Fire', { to: 'Fire (Copy)' }), 'Duplicated as Fire (Copy).');
  assert.equal(actionAnnouncement('Rename', 'Fire', { to: 'Blaze' }), 'Renamed to Blaze.');
  assert.equal(actionAnnouncement('Move up', 'Fire', { position: { index: 0, size: 2 } }), 'Fire moved up, 1 of 2.');
  assert.equal(actionAnnouncement('Hide', 'Fire', { ok: false }), "Couldn't hide Fire.");
  assert.deepEqual(positionIn(buildGroups(EFFECTS), 'candle'), { index: 1, size: 2 });
  assert.equal(positionIn(buildGroups(EFFECTS), 'nope'), null);
}

console.log('EffectPanelModel.test.mjs: ok');
