// Config -> live pipeline mapping (Phase 4). Pure and tested
// (demo-tuning.test.mjs); main.js applies the result to the running scene,
// demo-boot feeds it from the shim's onConfigPatch hook + one initial apply.
//
// Audio keys land on the live 'midpoint' settings object in place (drift and
// bounce state persist across edits, same as native editing the settings
// struct). fixedAnchorHue follows the native rule: < 0 means unset/random
// (Config.hpp), which the ported model spells `undefined`.

export const AUDIO_KEYS = [
  'audioFixedAnchorHue',
  'audioBounceSmoothTime',
  'audioDynamismFloor',
  'audioCentroidStrength',
  'audioDriftBaseRateDegPerSec',
  'audioVibrancySaturation',
  'audioVibrancyValue',
  'audioReferenceRms',
  'audioBrightnessFloor',
  'audioCentroidRangeHz',
  'audioBrightnessSmoothTime',
];

// Keys that round-trip through the shim store (the Dashboard displays them
// back) but have no demo effect. Each entry says why -- a slider that moves
// yet changes nothing must be a listed decision, never an accident.
export const NO_OP_KEYS = {
  refreshRate: 'daemon tick rate; the scene runs on rAF',
  activeMonitorName: 'no capture device in the demo (displayed back only)',
  audioTargetSinkName: 'no capture device in the demo (displayed back only)',
  interpolation: 'native applies it in capture rescale; the demo downscales via drawImage',
};

const AUDIO_OUT_KEYS = [
  'fixedAnchorHue',
  'bounceSmoothTime',
  'dynamismFloor',
  'centroidStrength',
  'driftBaseRateDegPerSec',
  'vibrancySaturation',
  'vibrancyValue',
  'referenceRms',
  'brightnessFloor',
  'centroidRangeHz',
  'brightnessSmoothTime',
];

export function configToPipeline(config) {
  const audio = {};
  for (let i = 0; i < AUDIO_KEYS.length; i++) {
    const value = config[AUDIO_KEYS[i]];
    audio[AUDIO_OUT_KEYS[i]] = value;
  }
  // The native optional spelled the ported model's way.
  if (audio.fixedAnchorHue < 0) audio.fixedAnchorHue = undefined;

  return {
    audio,
    // Same lerp-factor quantity as Smoother::smooth (0 = instant). Seeded 0
    // natively, so a default config un-smooths the demo's old 0.85 -- that
    // visual change IS parity with the app, not a regression.
    transitionSmoothing: config.transitionSmoothing,
    // 0 means "derive" natively; the demo's derive analogue is its built-in
    // 160px sampling width. Nonzero widths apply live to the video path
    // (test-pattern canvases stay at build width -- acceptable, those paths
    // have no Dashboard-driven UI).
    sampleWidth: config.subsampleWidth > 0 ? config.subsampleWidth : null,
    // probeState's own rule (app.js): empty input + audio input = audio.
    mode: (!config.activeInputName && config.activeAudioInputName) ? 'audio' : 'video',
  };
}
