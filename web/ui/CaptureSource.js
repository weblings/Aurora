// Video/Audio and capture-source logic shared by the Capture source
// onboarding screen (ModeDeviceScreen) and the Dashboard (Aurora-kea).
//
// Sections follow capability flags, not a Video/Audio mode:
// usesVideoInput (monitor picker), usesAudioInput (audio device +
// permission banner), samplesZones (Zone Mapping). GET /api/state reports
// them for the running pipeline. The flags are independent, so both true
// is valid (a later mixed effect shows both pickers).
//
// The Video/Audio toggle is still a mode, so mode helpers live here too.
// The effect picker beside it (Aurora-kep2.1) switches by effect id.

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

// The effect id picks the mode (runsAudioMode in core). An id that doesn't
// say (unset, a custom graph) keeps the older rule: audio only when no video
// input is named and an audio one is.
export function modeFromConfig(config) {
  if (config?.activeEffectId === 'builtin.audio') return 'audio';
  if (config?.activeEffectId === 'builtin.video') return 'video';
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
    && !customEffectRunning(stateAfter)
    && flagsMatchMode(stateAfter, mode);
}

// The graph editor's address for the running effect (Aurora-pvxx.8), or null
// when nothing is running. The editor reads `effect` from its query string.
export function graphEditorHref(state) {
  const id = state?.effect;
  return typeof id === 'string' && id ? `/graph-editor/?effect=${encodeURIComponent(id)}` : null;
}

// Whether a custom (non-built-in) effect is the one running now. The
// effect picker's trigger takes the fill then, not Video or Audio.
export function customEffectRunning(state) {
  const id = state?.effect;
  return typeof id === 'string' && id !== '' && !id.startsWith('builtin.');
}

// Whether a switch to effect `id` is confirmed: saved, no reload error,
// and the pipeline runs it (not its built-in fallback).
export function isEffectSwitchConfirmed(putResult, stateAfter, id) {
  return putResult?.succeeded === true
    && !putResult?.reloadError
    && stateAfter?.effect === id;
}

// The save behind an effect-picker choice: PUT /api/effects with its id.
// Resolves to the parsed result ({succeeded, reloadError?}).
export async function putEffectSwitch(id) {
  return (await fetch('/api/effects', { method: 'PUT', body: JSON.stringify({ activeEffectId: id }) })).json();
}

// GET /api/effects' list ({id, builtin, title, description}), or [] when
// unreachable or malformed: the picker then hides.
export async function loadEffects() {
  try {
    const effects = (await (await fetch('/api/effects')).json()).effects;
    return Array.isArray(effects) ? effects.filter((e) => typeof e?.id === 'string' && e.id) : [];
  } catch {
    return [];
  }
}

export function effectTitle(effect) {
  return effect.title || effect.id;
}

// Picker rows: built-ins, then customs under a divider. The selected row is
// the running effect (never the pick), so a failed switch never looks chosen.
export function effectPickerOptions(effects, state) {
  const builtins = effects.filter((e) => e.builtin);
  const customs = effects.filter((e) => !e.builtin);
  return [...builtins, ...customs].map((e, i) => ({
    value: e.id,
    label: effectTitle(e),
    tooltip: e.description || null,
    selected: !lightTestActive(state) && state?.effect === e.id,
    dividerBefore: i === builtins.length && i > 0,
  }));
}

// The picker shows only with something beyond Video/Audio to pick, or while
// a light test runs (the old MCP toggle's rule).
export function effectPickerVisible(effects, state) {
  return effects.some((e) => !e.builtin) || lightTestActive(state);
}

// Trigger text: the running custom effect (or a light test) by name, else
// the menu's own name, since Video/Audio already carry the fill.
export function effectPickerLabel(effects, state) {
  if (lightTestActive(state)) return 'Light test';
  if (!customEffectRunning(state)) return 'All effects';
  const running = effects.find((e) => e.id === state.effect);
  return running ? effectTitle(running) : (state.effectTitle || state.effect);
}

// Whether a lingering switch error is stale: the running pipeline is now
// the mode the failed switch was heading to (a confirmed retry, or a
// resume/relaunch starting the mode the failed switch saved to config). No
// state probe or no remembered mode keeps the error. Aurora-tazx. A failed
// picker switch ('custom') is stale once its effect id runs.
export function isSwitchErrorStale(state, errorMode, errorEffectId = null) {
  if (errorMode === 'custom') return !!errorEffectId && state?.effect === errorEffectId;
  return !!state && !!errorMode && flagsMatchMode(state, errorMode);
}

// Whether an MCP light test is driving the lights (Aurora-zfre). The effect
// picker shows it as the running effect until it ends or is kept.
export function lightTestActive(state) {
  return state?.test?.active === true;
}

// What the running effect fills: 'video', 'audio', 'custom' (the effect
// picker's trigger), or null when nothing runs. Flags drive sections, not
// this fill, so a failed switch's saved config never shows.
export function runningToggle(state) {
  if (lightTestActive(state) || customEffectRunning(state)) return 'custom';
  if (state?.effect === 'builtin.video') return 'video';
  if (state?.effect === 'builtin.audio') return 'audio';
  return null;
}

export function isIdle(flags) {
  return !flags.usesVideoInput && !flags.usesAudioInput && !flags.samplesZones;
}

// What the Dashboard shows: what runs. With nothing running (fresh
// install, a failed build at launch, no /api/state) it falls back to the
// saved mode, as before kea; a fresh install gets the monitor picker.
// Aurora-t9iq owns a real design for that state.
export function effectiveFlags(state, config) {
  // A failed effect switch shows the inputs of the pick, which can fix it.
  if (state?.state === 'failed' && state.graphInputs) {
    return {
      usesVideoInput: state.graphInputs.video === true,
      usesAudioInput: state.graphInputs.audio === true,
      samplesZones: false,
    };
  }
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
// it, so the switch lands on the device the user sees. Neither name is
// blanked: the other mode's input stays saved for a later mixed effect. Monitors are only
// known while video runs; without them the saved monitor stays as is. It
// also names the mode's built-in as the active effect (Aurora-52oz.1), which
// drops a custom effect the user had selected.
export function modeSwitchPatch(mode, {
  inputs, audioInputs, currentActiveInputName, currentActiveAudioInputName,
  monitors, selectedMonitorName, sinkName,
}) {
  if (mode === 'video') {
    return {
      activeEffectId: 'builtin.video',
      activeInputName: pickVideoInputName(inputs, currentActiveInputName),
      ...(monitors.length > 0 ? { activeMonitorName: selectedMonitorName } : {}),
    };
  }
  return {
    activeEffectId: 'builtin.audio',
    activeAudioInputName: pickAudioInputName(audioInputs, currentActiveAudioInputName),
    audioTargetSinkName: sinkName.trim(),
  };
}

// The save behind every Video/Audio switch: PUT the patch, which also
// reloads. Resolves to the parsed result ({succeeded, reloadError?}).
export async function putModeSwitch(patch) {
  return (await fetch('/api/config', { method: 'PUT', body: JSON.stringify(patch) })).json();
}
