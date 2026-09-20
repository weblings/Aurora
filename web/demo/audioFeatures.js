// Hand-ported from Aurora/core/AudioProcessing/src/AudioFeatureExtractor.cpp and
// AudioProcessing.cpp, adapted for the browser's AnalyserNode instead of aubio -- see
// ../Analysis/AudioAnalysis.md for why aubio itself isn't used here (no WASM build exists yet)
// and ../../Aurora-Demo-Web/main.js for the AudioContext/AnalyserNode wiring that feeds this.
//
// Real, deliberate difference from native: onset *detection* is a much simpler energy-ratio
// heuristic here, not aubio's actual algorithm -- that part was explicitly flagged as the
// "substantial, risky to re-derive" piece the native code leans on a mature library for.
// What *is* ported directly, because it's generic pure math independent of aubio specifics:
// RMS, the bin-to-Hz spectral centroid formula, and the leaky-max onsetStrength normalization.

// AnalyserNode's frequency-domain getters return dB, not linear magnitude -- verified against
// the real spec's own algorithm order (window -> FFT -> smoothing -> "Convert to dB"), not
// assumed. computeSpectralCentroid/OnsetDetector below both expect linear input; convert each
// bin with this first. (getFloatTimeDomainData, what computeRms consumes, is unaffected --
// that conversion only applies to the frequency-domain getters.)
export function dbToLinear(db) {
  return Math.pow(10, db / 20);
}

// Mirrors AudioProcessing.cpp's extractFeatures(): sqrt(mean(x^2)) over mono samples.
// Callers here pass an already-mono Float32Array (AnalyserNode's own analysis is single-channel).
export function computeRms(samples) {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i];
  return Math.sqrt(sumSquares / samples.length);
}

// Mirrors aubio_specdesc's "centroid" method + aubio_bintofreq(): a magnitude-weighted average
// bin index, converted to Hz via bin * sampleRate / fftSize (same simple bin-to-Hz relationship
// aubio uses, fftSize playing the role of aubio's bufSize).
export function computeSpectralCentroid(magnitudes, sampleRate, fftSize) {
  let weightedSum = 0;
  let magnitudeSum = 0;
  for (let bin = 0; bin < magnitudes.length; bin++) {
    weightedSum += bin * magnitudes[bin];
    magnitudeSum += magnitudes[bin];
  }
  if (magnitudeSum === 0) return 0;
  const centroidBin = weightedSum / magnitudeSum;
  return (centroidBin * sampleRate) / fftSize;
}

// The feeding AnalyserNode should have smoothingTimeConstant = 0 -- its own default (0.8) would
// stack with this class's own rolling energy history and blunt a real transient below threshold.
//
// Stateful, like AudioFeatureExtractor -- onset detection inherently needs history (a rolling
// energy baseline, a leaky-max for strength normalization, a refractory gate against re-firing
// mid-transient). Time-based (seconds), not hop-count-based: AnalyserNode gets polled once per
// animation frame, not at a fixed sample-domain hop rate the way aubio is fed.
export class OnsetDetector {
  constructor({ historyWindowSeconds = 1.0, sensitivity = 1.3, minIntervalSeconds = 0.1 } = {}) {
    this.historyWindowSeconds = historyWindowSeconds;
    this.sensitivity = sensitivity;
    this.minIntervalSeconds = minIntervalSeconds;
    this.energyHistory = []; // [{ time, energy }], pruned to historyWindowSeconds each call
    this.lastOnsetTime = -Infinity;
    // Same leaky-max envelope as native's Impl::rollingMaxStrength -- normalizes this
    // detector's own raw (unbounded) descriptor into [0,1], independent of its actual scale.
    this.rollingMaxStrength = 0;
  }

  static kRollingMaxDecay = 0.999;

  // magnitudes: one AnalyserNode frame's frequency-domain data. currentTimeSeconds: monotonic
  // clock (e.g. AudioContext.currentTime), not wall time -- used for both the history window
  // and the refractory gate.
  process(magnitudes, currentTimeSeconds) {
    let instantEnergy = 0;
    for (let i = 0; i < magnitudes.length; i++) instantEnergy += magnitudes[i];

    this.energyHistory.push({ time: currentTimeSeconds, energy: instantEnergy });
    while (this.energyHistory.length > 0 && this.energyHistory[0].time < currentTimeSeconds - this.historyWindowSeconds) {
      this.energyHistory.shift();
    }

    const averageEnergy = this.energyHistory.reduce((sum, e) => sum + e.energy, 0) / this.energyHistory.length;
    const rawStrength = Math.max(0, instantEnergy - this.sensitivity * averageEnergy);

    const pastRefractory = currentTimeSeconds - this.lastOnsetTime >= this.minIntervalSeconds;
    const onsetDetected = pastRefractory && instantEnergy > this.sensitivity * averageEnergy && rawStrength > 0;

    if (onsetDetected) {
      this.lastOnsetTime = currentTimeSeconds;
      this.rollingMaxStrength = Math.max(rawStrength, this.rollingMaxStrength * OnsetDetector.kRollingMaxDecay);
    } else {
      this.rollingMaxStrength *= OnsetDetector.kRollingMaxDecay;
    }

    const onsetStrength = onsetDetected && this.rollingMaxStrength > 1e-6
      ? Math.min(1, Math.max(0, rawStrength / this.rollingMaxStrength))
      : 0;

    return { onsetDetected, onsetStrength };
  }
}
