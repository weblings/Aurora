#pragma once

// AudioProcessing::extractFeatures()'s output -- the interpreted signals
// the color model (updateDrift/updateBounce) actually consumes. Two
// different kinds of signal, not one blended value: onset* is discrete
// (only meaningful the tick a beat fires), rms/spectralCentroid are
// continuous. See Analysis/AudioAnalysis.md's vocabulary section.
namespace Aurora::Contracts
{
  struct AudioFeatures
  {
    bool onsetDetected = false;    // true only on the tick a new onset fires
    float onsetStrength = 0.0f;    // onset-detection function's peak magnitude; only meaningful when onsetDetected
    float rms = 0.0f;              // continuous windowed loudness envelope
    float spectralCentroid = 0.0f; // Hz, continuous
  };
}
