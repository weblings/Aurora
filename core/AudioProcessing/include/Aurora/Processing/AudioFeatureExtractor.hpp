#pragma once

#include <memory>
#include <vector>

#include <Aurora/Contracts/AudioBuffer.hpp>
#include <Aurora/Contracts/AudioFeatures.hpp>

// Wraps aubio's onset/phase-vocoder/spectral-descriptor objects. Unlike the
// rest of AudioProcessing, this is deliberately NOT a pure function --
// verified against aubio's real C API first (see Analysis/AudioAnalysis.md):
// onset detection inherently needs history across calls (aubio_onset_t is
// constructed once, fed repeatedly), so there's nowhere to keep that state
// in a stateless design. Two separate aubio pipelines run per hop (onset
// detection does its own internal spectral analysis; centroid needs an
// explicit phase-vocoder -> spectral-descriptor -> bin-to-Hz chain) --
// the FFT genuinely gets computed twice, a known first-cut inefficiency,
// not a bug.
namespace Aurora::Processing
{
  namespace AudioProcessing
  {
    class AudioFeatureExtractor
    {
    public:
      // bufSize: phase vocoder/FFT window size. hopSize: samples aubio
      // consumes per internal call -- does NOT need to match whatever size
      // IAudioInput happens to deliver; process() re-chunks internally via
      // a ring buffer, since aubio requires an exact hopSize-length vector
      // per call and no plugin is expected to guarantee that.
      explicit AudioFeatureExtractor(unsigned sampleRate, unsigned bufSize = 1024, unsigned hopSize = 512);
      ~AudioFeatureExtractor();

      AudioFeatureExtractor(const AudioFeatureExtractor&) = delete;
      AudioFeatureExtractor& operator=(const AudioFeatureExtractor&) = delete;

      // rms is recomputed fresh from this call's own raw samples every time
      // (genuinely stateless, reuses extractFeatures() internally).
      // onsetDetected/onsetStrength/spectralCentroid reflect the last full
      // aubio hop actually processed this call -- zero, one, or several
      // hops may complete depending on how the ring buffer fills, since
      // IAudioInput's buffer size isn't fixed.
      Contracts::AudioFeatures process(const Contracts::AudioBuffer& buffer);

    private:
      struct Impl;
      std::unique_ptr<Impl> m_impl;

      unsigned m_hopSize;
      std::vector<float> m_ringBuffer;
    };
  }
}
