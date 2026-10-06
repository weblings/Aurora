// DeviceField audio-option contracts (Aurora-apn): option rows built
// from the sink list, and the open-refresh diff gate. Methods are
// prototype-called so no DOM is needed -- run with `node DeviceField.test.mjs`.
import assert from 'node:assert/strict';
import { DeviceField, sinkOptionsEqual, HINT_CLASS, VIDEO_HINT, AUDIO_HINT } from './DeviceField.js';

function rows(state) {
  return DeviceField.prototype._sinkOptions.call(state);
}

// Unloaded list: System default only.
{
  const out = rows({ _sinks: null, _sinkName: '' });
  assert.equal(out.length, 1);
  assert.equal(out[0].label, 'System default');
  assert.equal(out[0].selected, true);
}

// Loaded list: description-qualified labels, selection follows _sinkName.
{
  const out = rows({
    _sinks: [
      { name: 'a', description: 'A' },
      { name: 'b', description: 'b' },
    ],
    _sinkName: 'b',
  });
  assert.equal(out.length, 3);
  assert.equal(out[1].label, 'A');
  assert.equal(out[2].label, 'b');
  assert.equal(out[0].selected, false);
  assert.equal(out[2].selected, true);
}

// Duplicate names collapse to one row.
{
  const out = rows({ _sinks: [{ name: 'a' }, { name: 'a' }], _sinkName: '' });
  assert.equal(out.length, 2);
}

// Persisted name missing from the list still renders selected (unplugged
// device, failed first load) so the trigger never lies about the value.
{
  const out = rows({ _sinks: [{ name: 'a', description: 'A' }], _sinkName: 'gone' });
  assert.equal(out.length, 3);
  assert.deepEqual(out[2], { label: 'gone', value: 'gone', selected: true });
}

// Diff gate: identical rows (even distinct objects) skip the rebuild...
const base = [
  { label: 'System default', value: '', selected: true },
  { label: 'A', value: 'a', selected: false },
];
assert.equal(sinkOptionsEqual(base, structuredClone(base)), true);
// ...while any label/value/selected/length change rebuilds.
assert.equal(sinkOptionsEqual(base, base.slice(0, 1)), false);
assert.equal(sinkOptionsEqual(base, [{ ...base[0], label: 'Default' }, base[1]]), false);
assert.equal(sinkOptionsEqual(base, [base[0], { ...base[1], value: 'z' }]), false);
assert.equal(
  sinkOptionsEqual(base, [
    { ...base[0], selected: false },
    { ...base[1], selected: true },
  ]),
  false,
);

// Hints (Aurora-36b7): with no picker to show, the video and audio lines share
// one height class so a Video/Audio toggle doesn't move the content below...
function renderedHtml(props) {
  const container = { innerHTML: '', querySelector: () => null };
  new DeviceField(container, { monitors: [], ...props });
  return container.innerHTML;
}

{
  const video = renderedHtml({ usesVideoInput: true, usesAudioInput: false });
  const audio = renderedHtml({ usesVideoInput: false, usesAudioInput: true });
  assert.ok(video.includes(VIDEO_HINT));
  assert.ok(audio.includes(AUDIO_HINT));
  assert.ok(video.includes(`class="status-text ${HINT_CLASS}"`));
  assert.ok(audio.includes(`class="status-text ${HINT_CLASS}"`));
}

// ...and showHint:false renders neither (an error is showing for that input).
assert.equal(renderedHtml({ usesVideoInput: true, usesAudioInput: false, showHint: false }), '');
assert.equal(renderedHtml({ usesVideoInput: false, usesAudioInput: true, showHint: false }), '');

console.log('DeviceField.test.mjs: ok');
