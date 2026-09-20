// Hand-ported from Aurora/core/AudioProcessing/src/AudioProcessing.cpp's updateDrift/
// updateBounce/randomAnchorHue and Aurora/core/Contracts/include/Aurora/Contracts/Color.hpp's
// fromHSV/toHSV -- see ../docs/AudioAnalysis.md for the design reasoning and formulas this
// mirrors exactly. Pure, stable math (unlike AudioFeatureExtractor's onset detection), so this
// is a straight port, not a redesign -- see ../CLAUDE.md: keep in sync with the C++ source.

// Mirrors Color::fromHSV -- standard HSV->RGB sector formula, rounded to uint8 like the native
// ChannelDepth cast does.
export function colorFromHSV(hueDegrees, saturation, value) {
  let h = hueDegrees % 360;
  if (h < 0) h += 360;

  const c = value * saturation;
  const hPrime = h / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  const m = value - c;

  let r1 = 0, g1 = 0, b1 = 0;
  if (hPrime < 1) { r1 = c; g1 = x; b1 = 0; }
  else if (hPrime < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (hPrime < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (hPrime < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (hPrime < 5) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

// Mirrors Color::toHSV -- the inverse, hue 0 (not undefined) for a fully desaturated color.
export function colorToHSV({ r, g, b }) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const maxC = Math.max(rn, gn, bn);
  const minC = Math.min(rn, gn, bn);
  const delta = maxC - minC;

  let hue = 0;
  if (delta > 1e-6) {
    if (maxC === rn) hue = 60 * (((gn - bn) / delta) % 6);
    else if (maxC === gn) hue = 60 * ((bn - rn) / delta + 2);
    else hue = 60 * ((rn - gn) / delta + 4);
  }
  if (hue < 0) hue += 360;

  const saturation = maxC <= 1e-6 ? 0 : delta / maxC;
  return { hue, saturation, value: maxC };
}

// Mirrors Color::brightness() -- perceptual-weighted luminance, used by tests below to check
// "visible, not fully black" without asserting an exact RGB triple.
export function colorBrightness({ r, g, b }) {
  return (r * 0.3 + g * 0.59 + b * 0.11) / 255;
}

// The six named vibrant complementary pairs' anchor side -- see AudioAnalysis.md's palette
// table (Red/Cyan, Orange/Azure, ...). Mirrors randomAnchorHue().
const ANCHOR_HUES = [0, 30, 60, 90, 120, 150];
export function randomAnchorHue() {
  return ANCHOR_HUES[Math.floor(Math.random() * ANCHOR_HUES.length)];
}

function wrapDegrees(degrees) {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

// RockyRoad's shortest-arc formula, same as native's private helper of the same name.
function shortestArcDelta(target, current) {
  const delta = target - current;
  return (((delta + 180) % 360) + 360) % 360 - 180;
}

// Tunable knobs -- defaults copied from AudioEffectSettings, each tuned natively against a real
// listening test (see AudioAnalysis.md). Pass overrides via { ...defaultAudioEffectSettings(), ... }.
export function defaultAudioEffectSettings() {
  return {
    fixedAnchorHue: undefined, // unset = random pick among the six anchors at cold start
    bounceSmoothTime: 0.45,
    dynamismFloor: 0.22,
    centroidStrength: 0.3,
    driftBaseRateDegPerSec: 6.0,
    vibrancySaturation: 0.95,
    vibrancyValue: 0.95,
    referenceRms: 0.5,
    brightnessFloor: 0.4,
    centroidRangeHz: 2250.0,
    brightnessSmoothTime: 0.45,
  };
}

export function createDriftState() {
  return { anchorHueDegrees: 0, rollingCentroid: 0, initialized: false };
}

export function createBounceState() {
  return { currentHueDegrees: 0, targetHueDegrees: 0, smoothedBrightnessFactor: 0, initialized: false };
}

// Slow process: the anchor hue creeps at a fixed rate in a fixed rotational direction (negative
// -- opposite bounce's positive direction), nudged by spectralCentroid via a rolling-average-
// referenced rate-bias. Mutates state in place, mirroring native's reference-parameter shape.
export function updateDrift(state, features, settings, dt) {
  if (!state.initialized) {
    state.anchorHueDegrees = wrapDegrees(settings.fixedAnchorHue ?? randomAnchorHue());
    state.rollingCentroid = features.spectralCentroid;
    state.initialized = true;
    return; // first tick only establishes state, same as Smoother's first-tick rule
  }

  const rollingAlpha = 0.02;
  state.rollingCentroid += (features.spectralCentroid - state.rollingCentroid) * rollingAlpha;

  const centroidDelta = features.spectralCentroid - state.rollingCentroid;
  const normalizedCentroidDelta = Math.min(1, Math.max(-1, centroidDelta / settings.centroidRangeHz));

  // Rate-bias, not offset-bias: never reverses direction, only speeds/slows it.
  let rate = settings.driftBaseRateDegPerSec * (1 + settings.centroidStrength * normalizedCentroidDelta);
  rate = Math.max(rate, 0);

  const driftDirection = -1; // opposite bounce's +1
  state.anchorHueDegrees = wrapDegrees(state.anchorHueDegrees + driftDirection * rate * dt);
}

// Fast process: continuous exponential damping toward a target that advances (bounce's fixed
// positive direction) by a fraction of 180 degrees on each detected onset, scaled by strength
// with a dynamism floor. Returns { r, g, b }, combining hue with RMS-scaled brightness.
export function updateBounce(state, driftState, features, settings, dt) {
  const bounceDirection = 1; // opposite drift's -1

  const brightnessFactor = Math.min(1, Math.max(
    settings.brightnessFloor,
    features.rms / Math.max(settings.referenceRms, 1e-4),
  ));

  if (!state.initialized) {
    state.currentHueDegrees = driftState.anchorHueDegrees;
    state.targetHueDegrees = driftState.anchorHueDegrees;
    state.smoothedBrightnessFactor = brightnessFactor; // no fade-in from zero on the first tick
    state.initialized = true;
  }

  if (features.onsetDetected) {
    const normalizedStrength = Math.min(1, Math.max(0, features.onsetStrength));
    const swingFraction = settings.dynamismFloor + (1 - settings.dynamismFloor) * normalizedStrength;
    state.targetHueDegrees = wrapDegrees(state.targetHueDegrees + bounceDirection * swingFraction * 180);
  }

  // Continuous exponential damping toward the target, applied unconditionally -- this is why
  // silence needs no special-cased logic, it naturally relaxes toward the ambient drift position.
  const delta = shortestArcDelta(state.targetHueDegrees, state.currentHueDegrees);
  const smoothTime = Math.max(settings.bounceSmoothTime, 1e-4);
  state.currentHueDegrees = wrapDegrees(state.currentHueDegrees + delta * (1 - Math.exp(-dt / smoothTime)));

  // Own damping constant, deliberately separate from bounceSmoothTime -- raw RMS jitters faster
  // than the beat itself (see AudioAnalysis.md).
  const brightnessSmoothTime = Math.max(settings.brightnessSmoothTime, 1e-4);
  state.smoothedBrightnessFactor +=
    (brightnessFactor - state.smoothedBrightnessFactor) * (1 - Math.exp(-dt / brightnessSmoothTime));

  const effectiveValue = settings.vibrancyValue * state.smoothedBrightnessFactor;
  return colorFromHSV(state.currentHueDegrees, settings.vibrancySaturation, effectiveValue);
}
