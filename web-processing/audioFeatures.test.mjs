// Parity tests: same synthetic-signal methodology as Aurora/core/tests/AudioFeatureExtractorTests.cpp
// and AudioProcessingTests.cpp -- see ../CLAUDE.md. No test framework dependency (matches this
// directory's no-build-step, no-npm approach) -- run with `node audioFeatures.test.mjs`.
//
// Genre/real-music robustness testing was explicitly deferred (see docs/AudioAnalysis.md) --
// these check the math against known-answer synthetic signals, not detection quality on real songs.
import assert from 'node:assert/strict';
import { dbToLinear, computeRms, computeSpectralCentroid, OnsetDetector } from './audioFeatures.js';

const SAMPLE_RATE = 44100;

// dbToLinear inverts the spec's power-dB convention: 20*log10(x) round-trips through 10^(dB/20).
{
  approxEqual(dbToLinear(0), 1, 0.0001, 'dbToLinear(0)');
  approxEqual(dbToLinear(-20), 0.1, 0.0001, 'dbToLinear(-20)');
  approxEqual(dbToLinear(20), 10, 0.0001, 'dbToLinear(20)');
}
const FFT_SIZE = 1024;

function sineWave(freqHz, sampleCount, sampleRate = SAMPLE_RATE, amplitude = 0.8) {
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) samples[i] = amplitude * Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  return samples;
}

// A real (if naive, O(n^2)) DFT -- exercises actual signal-to-spectrum conversion, the same way
// the native tests run sineWave() through aubio's real FFT rather than hand-building a spectrum.
// Blackman-windowed first: verified against the real Web Audio API spec that AnalyserNode's own
// frequency-domain output always has a Blackman window applied -- skipping it here would test
// against unrealistic (leakage-heavy) spectra the real pipeline never actually produces.
function dftMagnitudes(samples) {
  const n = samples.length;
  const windowed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (n - 1));
    windowed[i] = samples[i] * w;
  }

  const magnitudes = new Float32Array(n / 2);
  for (let bin = 0; bin < n / 2; bin++) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * bin * i) / n;
      re += windowed[i] * Math.cos(angle);
      im -= windowed[i] * Math.sin(angle);
    }
    magnitudes[bin] = Math.sqrt(re * re + im * im);
  }
  return magnitudes;
}

function approxEqual(actual, expected, margin, message) {
  assert.ok(Math.abs(actual - expected) <= margin, `${message}: expected ${expected}±${margin}, got ${actual}`);
}

// Mirrors "AudioFeatureExtractor's centroid lands near a pure tone's actual frequency".
{
  const magnitudes = dftMagnitudes(sineWave(1000, FFT_SIZE));
  const centroid = computeSpectralCentroid(magnitudes, SAMPLE_RATE, FFT_SIZE);
  // Bin resolution at 1024/44100Hz is ~43Hz -- same tolerance the native test uses.
  approxEqual(centroid, 1000, 100, 'centroid of a 1000Hz tone');
}

// Mirrors "AudioFeatureExtractor's centroid is higher for a higher-pitched tone".
{
  const lowCentroid = computeSpectralCentroid(dftMagnitudes(sineWave(500, FFT_SIZE)), SAMPLE_RATE, FFT_SIZE);
  const highCentroid = computeSpectralCentroid(dftMagnitudes(sineWave(4000, FFT_SIZE)), SAMPLE_RATE, FFT_SIZE);
  assert.ok(highCentroid > lowCentroid, `expected 4000Hz centroid (${highCentroid}) > 500Hz centroid (${lowCentroid})`);
}

// Mirrors "AudioFeatureExtractor still computes real RMS" -- same fixed sample array.
{
  const rms = computeRms(new Float32Array([0.5, -0.5, 0.5, -0.5]));
  approxEqual(rms, 0.5, 0.001, 'RMS of a constant-magnitude signal');
}

// Mirrors "detects an onset on a sudden loud transient after silence".
{
  const detector = new OnsetDetector();
  const silence = new Float32Array(FFT_SIZE / 2); // zero magnitudes, a silent spectrum

  let time = 0;
  const hopSeconds = 0.0116; // ~512 samples at 44100Hz, same hop rate the native default uses
  for (let i = 0; i < 20; i++, time += hopSeconds) detector.process(silence, time);

  const loudSpectrum = dftMagnitudes(sineWave(440, FFT_SIZE, SAMPLE_RATE, 1.0));
  let detectedAny = false;
  for (let i = 0; i < 5; i++, time += hopSeconds) {
    const { onsetDetected } = detector.process(loudSpectrum, time);
    detectedAny = detectedAny || onsetDetected;
  }
  assert.ok(detectedAny, 'expected a sudden loud transient after silence to register as an onset');
}

// Mirrors "onsetStrength is normalized to [0,1]".
{
  const detector = new OnsetDetector();
  const silence = new Float32Array(FFT_SIZE / 2);
  let time = 0;
  const hopSeconds = 0.0116;
  for (let i = 0; i < 20; i++, time += hopSeconds) detector.process(silence, time);

  const loudSpectrum = dftMagnitudes(sineWave(440, FFT_SIZE, SAMPLE_RATE, 1.0));
  for (let i = 0; i < 5; i++, time += hopSeconds) {
    const { onsetStrength } = detector.process(loudSpectrum, time);
    assert.ok(onsetStrength >= 0 && onsetStrength <= 1, `onsetStrength out of [0,1]: ${onsetStrength}`);
  }
}

// Refractory gate: a sustained loud signal shouldn't re-fire every single call.
{
  const detector = new OnsetDetector({ minIntervalSeconds: 0.1 });
  const silence = new Float32Array(FFT_SIZE / 2);
  let time = 0;
  const hopSeconds = 0.0116; // well under minIntervalSeconds -- many calls per refractory window
  for (let i = 0; i < 20; i++, time += hopSeconds) detector.process(silence, time);

  const loudSpectrum = dftMagnitudes(sineWave(440, FFT_SIZE, SAMPLE_RATE, 1.0));
  let onsetCount = 0;
  for (let i = 0; i < 20; i++, time += hopSeconds) {
    if (detector.process(loudSpectrum, time).onsetDetected) onsetCount++;
  }
  // ~0.23s of sustained loud signal over a 0.1s refractory period should fire a handful of
  // times, not once (undetected) and not ~20 times (no gate at all).
  assert.ok(onsetCount >= 1 && onsetCount <= 5, `expected a few gated onsets, got ${onsetCount}`);
}

console.log('audioFeatures.test.mjs: all tests passed');
