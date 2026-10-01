// Tuning slider ranges come from the backend's param schema (Aurora-ta5):
// /api/descriptors -> Tooltips' param cache -> slidersFromParams tuples.
// No DOM needed -- run with `node TuningFields.test.mjs`.
import assert from 'node:assert/strict';
import { descriptorsSettled, ensureTooltips, paramFor, tooltipFor } from './Tooltips.js';
import { slidersFromParams } from './TuningFields.js';

const centroid = { label: 'Centroid range', min: 100, max: 8000, step: 10, unit: 'Hz', default: 2250, allowsUnset: false };

// Before the fetch settles: nothing known, nothing invented.
{
  assert.equal(descriptorsSettled(), false);
  assert.equal(paramFor('audio.centroidRangeHz'), null);
  assert.deepEqual(slidersFromParams(['audioCentroidRangeHz']), []);
}

// Fetch lands: param and tooltip cached from the same entry; entries
// without a param (bool, dropdown) have none.
{
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/descriptors');
    return {
      json: async () => ({
        descriptors: [
          { key: 'audio.centroidRangeHz', kind: 'slider', description: 'Pitch span affecting drift', param: centroid },
          { key: 'audio.fixedHueEnabled', kind: 'bool', description: 'Drift starts at chosen hue' },
          { key: 'video.transitionSmoothing', kind: 'slider', description: 'Easing', param: { label: 'Transition smoothing', min: 0, max: 0.97, step: 0.01, unit: '', default: 0, allowsUnset: false } },
        ],
      }),
    };
  };
  await ensureTooltips();
  assert.equal(descriptorsSettled(), true);
  assert.deepEqual(paramFor('audio.centroidRangeHz'), centroid);
  assert.equal(paramFor('audio.fixedHueEnabled'), null);
  assert.equal(tooltipFor('audio.centroidRangeHz'), 'Pitch span affecting drift');
}

// Config keys map onto descriptor keys (audio* -> audio.*, else video.*),
// tuples keep sliderGroupHtml's [key, label, min, max, step, unit] order,
// and order follows the requested layout.
{
  const sliders = slidersFromParams(['transitionSmoothing', 'audioCentroidRangeHz']);
  assert.deepEqual(sliders, [
    ['transitionSmoothing', 'Transition smoothing', 0, 0.97, 0.01, ''],
    ['audioCentroidRangeHz', 'Centroid range', 100, 8000, 10, 'Hz'],
  ]);
}

// A key the backend doesn't describe is skipped (TuningFields then shows
// its "couldn't load slider ranges" notice) rather than rendered.
{
  assert.deepEqual(slidersFromParams(['audioCentroidRangeHz', 'audioNotARealSetting']), [
    ['audioCentroidRangeHz', 'Centroid range', 100, 8000, 10, 'Hz'],
  ]);
}

// Injectable lookup, for callers that hold their own schema map.
{
  const sliders = slidersFromParams(['audioDynamismFloor'], (key) => (
    key === 'audio.dynamismFloor' ? { label: 'Dynamism floor', min: 0, max: 1, step: 0.01, unit: '' } : null
  ));
  assert.deepEqual(sliders, [['audioDynamismFloor', 'Dynamism floor', 0, 1, 0.01, '']]);
}

console.log('TuningFields.test.mjs: ok');
