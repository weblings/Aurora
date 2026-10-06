// ModeDeviceScreen audio notes (Aurora-9swq): Audio mode says what it does
// for the user's lights without naming the Zone Mapping step they haven't met,
// and neither that note nor DeviceField's hint renders beside a switch error --
// after a refused Video switch the Audio pipeline is still the running one, so
// its notes would sit under an error about screen capture. No DOM: prototype-
// called _render against container doubles. Run with
// `node screens/ModeDeviceScreen.test.mjs`.
import assert from 'node:assert/strict';
import { ModeDeviceScreen } from './ModeDeviceScreen.js';

function makeEl() {
  return {
    innerHTML: '',
    textContent: '',
    classList: { add() {}, remove() {} },
    setAttribute() {},
    addEventListener() {},
    removeAttribute() {},
    querySelector() {
      return makeEl();
    },
  };
}

// Returns the rendered body html (toggle, note, device slot, error) and the
// device slot's own html (DeviceField's hint or picker).
function render(overrides) {
  const body = makeEl();
  const deviceSlot = makeEl();
  body.querySelector = (sel) => (sel === '.md-device' ? deviceSlot : makeEl());
  const inst = Object.create(ModeDeviceScreen.prototype);
  Object.assign(inst, {
    container: { querySelector: (sel) => (sel === '.md-body' ? body : makeEl()) },
    mode: 'audio',
    pendingMode: null,
    hasAudio: true,
    platform: 'mac',
    error: null,
    monitors: [],
    audioDevicesUrl: null,
    selectedMonitorName: '',
    sinkName: '',
    showBack: true,
    onBack() {},
    onComplete() {},
    deviceField: null,
  }, overrides);
  inst._render();
  return { body: body.innerHTML, device: deviceSlot.innerHTML };
}

const NOTE = 'In Audio mode, all your lights react to sound together.';
const AUDIO_HINT = "Uses your system's default audio device.";

// Audio, no error: the note and the device hint both show; no jargon.
{
  const { body, device } = render({});
  assert.ok(body.includes(NOTE));
  assert.ok(device.includes(AUDIO_HINT));
  assert.ok(!/per-zone|mapping step|Zones react/i.test(body), 'no zone-mapping wording');
}

// Audio mode with an error showing (a refused switch): neither Audio notes.
{
  const { body, device } = render({ error: 'permission_denied: Screen Recording' });
  assert.ok(!body.includes(NOTE), 'note hidden under an error');
  assert.ok(!device.includes(AUDIO_HINT), 'device hint hidden under an error');
  assert.ok(body.includes('Screen Recording'), 'the error itself still renders');
}

// Video mode never shows the Audio note.
{
  const { body } = render({ mode: 'video' });
  assert.ok(!body.includes(NOTE));
}

console.log('ModeDeviceScreen.test.mjs: ok');
