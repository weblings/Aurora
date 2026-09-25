// Audio source (gj0.5 slice 3): analyser frames -> one shared color broadcast
// to every target. One implementation of the color-provider contract (see
// main.js): sampleFrame takes ({zones, targets}) and returns
// [{zoneId, color:{r,g,b} 0..1}], matching native's AudioOrchestrator shape
// (no per-zone spatial concept) rather than the video path's per-zone
// sampling. Inactive zones go dark here (demo legibility deviation, see
// tuning-ledger.md); native holds last color instead.
import * as THREE from 'three';
import { dbToLinear, computeRms, computeSpectralCentroid, OnsetDetector } from './audioFeatures.js';
import {
  defaultAudioEffectSettings, createDriftState, createBounceState, updateDrift, updateBounce,
} from './colorModel.js';

// Hand-rolled against AnalyserNode rather than aubio-via-WASM or BeatDetector -- see
// docs/AudioAnalysis.md; audioFeatures.js has the ported/tested pure math.
const audioTrack = new Audio('assets/Electro Cabello.mp3');
audioTrack.loop = true;

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioContext.createAnalyser();
analyser.fftSize = 1024; // matches AudioFeatureExtractor's default bufSize -- comparable bin resolution
analyser.smoothingTimeConstant = 0; // OnsetDetector does its own rolling-average smoothing (see audioFeatures.js)
// createMediaElementSource silently reroutes the element's own audio output through this graph --
// connecting to destination is required for audioTrack to actually be audible at all.
audioContext.createMediaElementSource(audioTrack).connect(analyser).connect(audioContext.destination);

const onsetDetector = new OnsetDetector();
const freqDataDb = new Float32Array(analyser.frequencyBinCount);
const freqDataLinear = new Float32Array(analyser.frequencyBinCount);
const timeData = new Float32Array(analyser.fftSize);
let audioHueDegrees = 0; // placeholder model's own state, see placeholderAudioColor() below

// Real ported model (colorModel.js), three presets sharing the same functions/state shape --
// 'ported' is native's own listening-tuned defaults (for real Hue bulbs); 'tuned' is a first
// guess at a punchier demo-screen preset (see the A/B discussion this came out of), specifically
// making brightness react much faster -- a viewer's eye reads brightness-lag-behind-the-beat as
// "boring" more than hue lag, so that's the one knob turned hardest. 'midpoint' is halfway
// between 'ported' and 'tuned' on all four tuned fields -- the settled-on choice, now also
// native's own new Config.hpp defaults (see docs/RuntimeAnalysis.md).
const audioEffectSettingsByModel = {
  ported: defaultAudioEffectSettings(),
  tuned: {
    ...defaultAudioEffectSettings(),
    bounceSmoothTime: 0.12,
    brightnessSmoothTime: 0.08,
    dynamismFloor: 0.3,
    driftBaseRateDegPerSec: 14,
  },
  midpoint: {
    ...defaultAudioEffectSettings(),
    bounceSmoothTime: 0.285,
    brightnessSmoothTime: 0.265,
    dynamismFloor: 0.26,
    driftBaseRateDegPerSec: 10,
  },
};
const driftStateByModel = { ported: createDriftState(), tuned: createDriftState(), midpoint: createDriftState() };
const bounceStateByModel = { ported: createBounceState(), tuned: createBounceState(), midpoint: createBounceState() };
let lastAudioColorTime = null; // audioContext.currentTime as of the previous frame, for real dt

// 'placeholder' | 'ported' | 'tuned' | 'midpoint' | 'attack'. Wired to the
// (currently hidden) model select by the page; defaults to midpoint.
let audioColorModel = 'midpoint';
export function setColorModel(model) {
  audioColorModel = model;
}

// Live-apply entry: tuning lands in place on the running midpoint object
// (state persists across edits, as natively).
export function applyAudioTuning(audio) {
  Object.assign(audioEffectSettingsByModel.midpoint, audio);
}

export function setPlaying(playing, isAudioMode) {
  if (!playing) return audioTrack.pause();
  // AudioContext needs the same user-gesture unlock video/audio elements do -- resume() is a
  // no-op once already running, so calling it every time this fires is harmless.
  audioContext.resume();
  audioTrack.play().catch(() => {
    document.body.addEventListener('click', () => { if (isAudioMode()) audioTrack.play(); }, { once: true });
  });
}

// Simple hue-jump-on-onset response -- deliberately not the real color model, see
// placeholderAudioColor() vs. the ported one for how they actually differ in feel.
function placeholderAudioColor({ onsetDetected, onsetStrength, rms }) {
  if (onsetDetected) audioHueDegrees = (audioHueDegrees + 30 + onsetStrength * 60) % 360;
  const brightness = Math.min(1, 0.4 + rms * 1.5); // 0.4 floor so it's never fully dark
  return new THREE.Color().setHSL(audioHueDegrees / 360, 0.9, 0.5 * brightness);
}

// The real ported updateDrift/updateBounce, either preset -- needs a genuine elapsed-time dt
// (their damping is exponential-in-time, unlike the placeholder's instant snap), tracked via
// AudioContext's clock. Shared timer is fine since only one model runs per frame.
function dampedAudioColor(model, features) {
  const now = audioContext.currentTime;
  const dt = lastAudioColorTime === null ? 0 : now - lastAudioColorTime;
  lastAudioColorTime = now;

  const settings = audioEffectSettingsByModel[model];
  const driftState = driftStateByModel[model];
  const bounceState = bounceStateByModel[model];
  updateDrift(driftState, features, settings, dt);
  const { r, g, b } = updateBounce(bounceState, driftState, features, settings, dt);
  return new THREE.Color(r / 255, g / 255, b / 255);
}

// Option D: an experimental attack/decay flash layered on the *ported* preset's own smooth base
// (shares its state, so switching 'ported' <-> 'attack' isolates just this layer) -- demo-only
// for now, deliberately not in colorModel.js since native's updateBounce has no such mechanism
// yet. If this reads well, native already has everything needed to add a real one (a per-tick
// dt, persistent state, a tunable settings struct) -- see AudioOrchestrator.cpp.
const FLASH_DECAY_TIME = 0.12; // seconds; short so it reads as a hit, not a second bounce
const FLASH_INTENSITY = 0.5; // how much the flash adds on top of the smoothed base brightness
let flashLevel = 0;
let lastFlashTime = null;

function attackAudioColor(features) {
  const baseColor = dampedAudioColor('ported', features);

  const now = audioContext.currentTime;
  const dt = lastFlashTime === null ? 0 : now - lastFlashTime;
  lastFlashTime = now;

  if (features.onsetDetected) flashLevel = Math.max(flashLevel, features.onsetStrength);
  flashLevel *= Math.exp(-dt / FLASH_DECAY_TIME);

  const hsl = {};
  baseColor.getHSL(hsl);
  hsl.l = Math.min(1, hsl.l + flashLevel * FLASH_INTENSITY);
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

export function sampleFrame({ zones, targets }) {
  analyser.getFloatFrequencyData(freqDataDb);
  for (let i = 0; i < freqDataDb.length; i++) freqDataLinear[i] = dbToLinear(freqDataDb[i]);
  analyser.getFloatTimeDomainData(timeData);

  const rms = computeRms(timeData);
  const spectralCentroid = computeSpectralCentroid(freqDataLinear, audioContext.sampleRate, analyser.fftSize);
  const { onsetDetected, onsetStrength } = onsetDetector.process(freqDataLinear, audioContext.currentTime);
  const features = { onsetDetected, onsetStrength, rms, spectralCentroid };

  const audioColor = audioColorModel === 'placeholder' ? placeholderAudioColor(features)
    : audioColorModel === 'attack' ? attackAudioColor(features)
    : dampedAudioColor(audioColorModel, features);

  // Looked up live so Dashboard Active toggles land: inactive targets go
  // dark, everything else takes the shared color -- same loop the old
  // driveLightsFromAudio() ran, now returning entries for the orchestrator.
  const liveById = new Map(zones.map((z) => [z.zoneId, z]));
  return targets.map(({ zoneId }) => {
    if (liveById.get(zoneId)?.active === false) return { zoneId, color: { r: 0, g: 0, b: 0 } };
    return { zoneId, color: { r: audioColor.r, g: audioColor.g, b: audioColor.b } };
  });
}
