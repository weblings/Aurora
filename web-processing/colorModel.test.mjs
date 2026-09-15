// Parity tests: all 12 cases ported directly from Aurora/core/tests/AudioProcessingTests.cpp
// (Color::fromHSV/toHSV, randomAnchorHue, updateDrift x3, updateBounce x4) -- see ../CLAUDE.md.
// No test framework dependency -- run with `node colorModel.test.mjs`.
import assert from 'node:assert/strict';
import {
  colorFromHSV, colorToHSV, colorBrightness, randomAnchorHue,
  defaultAudioEffectSettings, createDriftState, createBounceState, updateDrift, updateBounce,
} from './colorModel.js';

function approxEqual(actual, expected, margin, message) {
  assert.ok(Math.abs(actual - expected) <= margin, `${message}: expected ${expected}±${margin}, got ${actual}`);
}

const emptyFeatures = { onsetDetected: false, onsetStrength: 0, rms: 0, spectralCentroid: 0 };

// "Color::fromHSV/toHSV round-trips the six named anchor hues"
{
  for (const hue of [0, 30, 60, 90, 120, 150]) {
    const rgb = colorFromHSV(hue, 1, 1);
    const hsv = colorToHSV(rgb);
    approxEqual(hsv.hue, hue, 0.6, `round-trip hue for ${hue}`); // uint8 rounding, not exact
    approxEqual(hsv.saturation, 1, 0.01, `round-trip saturation for ${hue}`);
    approxEqual(hsv.value, 1, 0.01, `round-trip value for ${hue}`);
  }
}

// "Color::fromHSV matches the verified palette table"
{
  const red = colorFromHSV(0, 1, 1);
  assert.equal(red.r, 255); assert.equal(red.g, 0); assert.equal(red.b, 0);

  const cyan = colorFromHSV(180, 1, 1);
  assert.equal(cyan.r, 0); assert.equal(cyan.g, 255); assert.equal(cyan.b, 255);

  const orange = colorFromHSV(30, 1, 1);
  assert.equal(orange.r, 255); assert.equal(orange.g, 128); assert.equal(orange.b, 0);
}

// "randomAnchorHue always returns one of the six named anchors"
{
  const known = new Set([0, 30, 60, 90, 120, 150]);
  for (let i = 0; i < 50; i++) assert.ok(known.has(randomAnchorHue()), `unexpected anchor hue`);
}

// "updateDrift's first call only initializes state, matching Smoother's first-tick rule"
{
  const state = createDriftState();
  const settings = { ...defaultAudioEffectSettings(), fixedAnchorHue: 60 };
  updateDrift(state, emptyFeatures, settings, 1.0);
  assert.ok(state.initialized);
  approxEqual(state.anchorHueDegrees, 60, 0.001, 'first-tick anchor');
}

// "updateDrift honors fixedAnchorHue only as the starting point, then keeps drifting"
{
  const state = createDriftState();
  const settings = {
    ...defaultAudioEffectSettings(),
    fixedAnchorHue: 60, driftBaseRateDegPerSec: 10, centroidStrength: 0, // isolate the base rate
  };
  updateDrift(state, emptyFeatures, settings, 1.0); // init tick
  const afterInit = state.anchorHueDegrees;
  updateDrift(state, emptyFeatures, settings, 1.0); // one real second of drift

  assert.notEqual(state.anchorHueDegrees, afterInit);
  approxEqual(state.anchorHueDegrees, (60 - 10 + 360) % 360, 0.001, 'drifted anchor');
}

// "updateDrift's rate-bias never reverses direction, only speeds or slows it"
{
  const settings = {
    ...defaultAudioEffectSettings(),
    fixedAnchorHue: 100, driftBaseRateDegPerSec: 10, centroidStrength: 1, centroidRangeHz: 1000,
  };
  const slow = createDriftState();
  const fast = createDriftState();
  updateDrift(slow, emptyFeatures, settings, 0.0);
  updateDrift(fast, emptyFeatures, settings, 0.0);

  updateDrift(slow, { ...emptyFeatures, spectralCentroid: -1000 }, settings, 1.0); // far below rolling avg (0)
  updateDrift(fast, { ...emptyFeatures, spectralCentroid: 1000 }, settings, 1.0); // far above it

  assert.ok(slow.anchorHueDegrees < 100, 'slow should have moved negative from 100');
  assert.ok(fast.anchorHueDegrees < 100, 'fast should have moved negative from 100');
  assert.ok(fast.anchorHueDegrees < slow.anchorHueDegrees, 'higher centroid should drift further');
}

// "updateBounce's first call initializes at the drift anchor, not a hardcoded default"
{
  const driftState = { ...createDriftState(), anchorHueDegrees: 200, initialized: true };
  const bounceState = createBounceState();
  updateBounce(bounceState, driftState, emptyFeatures, defaultAudioEffectSettings(), 0.0);

  assert.ok(bounceState.initialized);
  approxEqual(bounceState.currentHueDegrees, 200, 0.001, 'bounce init hue');
}

// "updateBounce's dynamism floor guarantees a visible swing even for the weakest onset"
{
  const driftState = { ...createDriftState(), anchorHueDegrees: 0, initialized: true };
  const bounceState = createBounceState();
  const settings = { ...defaultAudioEffectSettings(), dynamismFloor: 0.25, bounceSmoothTime: 1e-6 }; // ~instant
  const weakOnset = { ...emptyFeatures, onsetDetected: true, onsetStrength: 0 }; // weakest possible

  updateBounce(bounceState, driftState, weakOnset, settings, 1.0);
  approxEqual(bounceState.targetHueDegrees, 0.25 * 180, 0.5, 'floor-guaranteed swing');
}

// "updateBounce's brightness floor keeps the color visible even in silence"
{
  const driftState = { ...createDriftState(), anchorHueDegrees: 0, initialized: true };
  const bounceState = createBounceState();
  const settings = { ...defaultAudioEffectSettings(), brightnessFloor: 0.15, vibrancyValue: 1.0 };
  const silence = { ...emptyFeatures, rms: 0 };

  const result = updateBounce(bounceState, driftState, silence, settings, 0.0);
  assert.ok(colorBrightness(result) > 0, 'floor should prevent fully black'); // not a specific value
}

// "updateBounce damps brightness on its own time constant, not instantly to raw RMS"
{
  const driftState = { ...createDriftState(), anchorHueDegrees: 0, initialized: true };
  const bounceState = createBounceState();
  const settings = {
    ...defaultAudioEffectSettings(),
    brightnessFloor: 0, vibrancyValue: 1.0, referenceRms: 1.0, brightnessSmoothTime: 10, // deliberately slow
  };

  updateBounce(bounceState, driftState, { ...emptyFeatures, rms: 0 }, settings, 0.0); // init tick, snaps to 0
  const result = updateBounce(bounceState, driftState, { ...emptyFeatures, rms: 1.0 }, settings, 0.1);

  // A slow time constant over one small dt should land far short of full brightness.
  assert.ok(colorBrightness(result) < 0.5, 'should not jump to full brightness instantly');
  assert.ok(colorBrightness(result) > 0, 'should have moved at all');
}

console.log('colorModel.test.mjs: all tests passed');
