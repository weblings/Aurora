// Video/Audio and capture-source logic shared by the Capture source
// onboarding screen (ModeDeviceScreen) and the Dashboard (Aurora-kea).
//
// Sections follow capability flags, not a Video/Audio mode:
// usesVideoInput (monitor picker), usesAudioInput (audio device +
// permission banner), samplesZones (Zone Mapping). GET /api/state reports
// them for the running pipeline. The flags are independent, so both true
// is valid (a later mixed effect shows both pickers).
//
// The Video/Audio toggle is still a mode, so mode helpers live here too,
// until Aurora-kep2's Effect picker replaces the toggle.

// Plugin registry names ("linux", "windows", "pipewire", ...) are never shown
// as choices; these resolve one on the user's behalf.
export function pickVideoInputName(inputs, current) {
  if (current && current !== 'dummy' && inputs.includes(current)) return current;
  for (const preferred of ['linux', 'windows']) {
    if (inputs.includes(preferred)) return preferred;
  }
  const real = inputs.filter((n) => n !== 'dummy');
  return real[0] ?? inputs[0] ?? '';
}

export function pickAudioInputName(audioInputs, current) {
  if (current && audioInputs.includes(current)) return current;
  return audioInputs[0] ?? '';
}

// Pipeline::build's rule: audio only when no video input is named and an
// audio one is. Nothing named and both named read as video.
export function modeFromConfig(config) {
  return (!config?.activeInputName && config?.activeAudioInputName) ? 'audio' : 'video';
}

// Whether the saved config names an input this build actually has.
export function isModeConfigValid(config, inputs, audioInputs) {
  return modeFromConfig(config) === 'video'
    ? inputs.includes(config?.activeInputName)
    : audioInputs.includes(config?.activeAudioInputName);
}

// The flags a Video or Audio choice implies. The Capture source screen
// shows the user's choice before it runs, so it uses these directly.
export function flagsForMode(mode) {
  const audio = mode === 'audio';
  return { usesVideoInput: !audio, usesAudioInput: audio, samplesZones: !audio };
}

export function runningFlags(state) {
  return {
    usesVideoInput: state?.usesVideoInput === true,
    usesAudioInput: state?.usesAudioInput === true,
    samplesZones: state?.samplesZones === true,
  };
}

// The toggle choice the running flags read as. Audio only when an audio
// input runs without video; both-true (a later mixed effect) and idle both
// read as video, matching modeFromConfig's rule.
export function modeFromFlags(flags) {
  return (flags.usesAudioInput && !flags.usesVideoInput) ? 'audio' : 'video';
}

// Whether the running pipeline's inputs match a Video/Audio choice. Only
// the input pair is compared: zone sampling follows the effect, so a video
// pipeline that doesn't sample zones still confirms video.
export function flagsMatchMode(state, mode) {
  const running = runningFlags(state);
  const want = flagsForMode(mode);
  return running.usesVideoInput === want.usesVideoInput
    && running.usesAudioInput === want.usesAudioInput;
}

// Whether a switch to `mode` is confirmed: the save landed, the reload
// reported no error, AND the running pipeline's flags agree with the
// choice. The flag check covers reload() returning success while paused
// without building (Pipeline.cpp): succeeded + no reloadError is not
// "running". A later health signal (Aurora-5ipy.2) upgrades this from
// "the right pipeline runs" to "lights actually react".
export function isSwitchConfirmed(putResult, stateAfter, mode) {
  return putResult?.succeeded === true
    && !putResult?.reloadError
    && flagsMatchMode(stateAfter, mode);
}

// Whether a lingering switch error is stale: the running pipeline is now
// the mode the failed switch was heading to (a confirmed retry, or a
// resume/relaunch starting the mode the failed switch saved to config). No
// state probe or no remembered mode keeps the error. Aurora-tazx.
export function isSwitchErrorStale(state, errorMode) {
  return !!state && !!errorMode && flagsMatchMode(state, errorMode);
}

export function isIdle(flags) {
  return !flags.usesVideoInput && !flags.usesAudioInput && !flags.samplesZones;
}

// What the Dashboard shows: what runs. With nothing running (fresh
// install, a failed build at launch, no /api/state) it falls back to the
// saved mode, as before kea; a fresh install gets the monitor picker.
// Aurora-t9iq owns a real design for that state.
export function effectiveFlags(state, config) {
  const running = runningFlags(state);
  return isIdle(running) ? flagsForMode(modeFromConfig(config)) : running;
}

// Route listing audio devices for the sink dropdown, or null when this
// build has none (the field then says it uses the system default).
export function audioDevicesUrlFrom(state) {
  const url = state?.audioDevicesUrl;
  return typeof url === 'string' && url ? url : null;
}

// GET /api/state, or null when unreachable or malformed; callers fall back
// as effectiveFlags() does.
export async function loadPipelineState() {
  try {
    const state = await (await fetch('/api/state')).json();
    return state && typeof state === 'object' ? state : null;
  } catch {
    return null;
  }
}

// A device field edit saves the device of each running input: the monitor
// for video, the sink for audio, both when both run.
export function devicePatch(flags, { selectedMonitorName, sinkName }) {
  const patch = {};
  if (flags.usesVideoInput) patch.activeMonitorName = selectedMonitorName;
  if (flags.usesAudioInput) patch.audioTargetSinkName = sinkName.trim();
  return patch;
}

// A Video/Audio toggle click: that mode's input plus the device shown for
// it, so the switch lands on the device the user sees. Monitors are only
// known while video runs; without them the saved monitor stays as is.
export function modeSwitchPatch(mode, {
  inputs, audioInputs, currentActiveInputName, currentActiveAudioInputName,
  monitors, selectedMonitorName, sinkName,
}) {
  if (mode === 'video') {
    return {
      activeInputName: pickVideoInputName(inputs, currentActiveInputName),
      ...(monitors.length > 0 ? { activeMonitorName: selectedMonitorName } : {}),
    };
  }
  return {
    activeInputName: '',
    activeAudioInputName: pickAudioInputName(audioInputs, currentActiveAudioInputName),
    audioTargetSinkName: sinkName.trim(),
  };
}

// The save behind every Video/Audio switch: PUT the patch, which also
// reloads. Resolves to the parsed result ({succeeded, reloadError?}).
export async function putModeSwitch(patch) {
  return (await fetch('/api/config', { method: 'PUT', body: JSON.stringify(patch) })).json();
}
