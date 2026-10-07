// EntertainmentConfigSelect._select (Aurora-m0fy): a rejected switch reports
// through onError; a saved one reports through onChange only, carrying any
// reloadError (the shell banner owns that failure, not an inline message).
// No DOM needed. Run with `node EntertainmentConfigSelect.test.mjs`.
import assert from 'node:assert/strict';
import { EntertainmentConfigSelect } from './EntertainmentConfigSelect.js';

function selectWith(persisted) {
  const events = [];
  const sel = new EntertainmentConfigSelect({
    onChange: (id, result) => events.push(['change', id, result]),
    onError: (message) => events.push(['error', message]),
  });
  sel._persist = async () => persisted;
  return { sel, events };
}

{
  const { sel, events } = selectWith({ succeeded: false, error: 'nope' });
  await sel._select('a');
  assert.deepEqual(events, [['error', 'nope']]);
}

{
  const { sel, events } = selectWith({ succeeded: true, reloadError: 'boom' });
  await sel._select('a');
  assert.deepEqual(events, [['change', 'a', { reloadError: 'boom' }]], 'no onError for a reload failure');
}

{
  const { sel, events } = selectWith({ succeeded: true });
  await sel._select('a');
  assert.deepEqual(events, [['change', 'a', { reloadError: undefined }]]);
}

console.log('EntertainmentConfigSelect checks passed.');
