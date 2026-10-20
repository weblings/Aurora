#pragma once

#include <complex>
#include <vector>

#include <Aurora/Contracts/AudioBuffer.hpp>

// Bass/mid/treble levels from a Hann-windowed FFT over the most recent
// window of samples. Levels are band RMS in sample units, so a sine of
// amplitude A reads A/sqrt(2) in its band, matching AudioFeatures::rms.
namespace Aurora::Processing
{
  namespace AudioProcessing
  {
    struct BandLevels
    {
      float bass = 0.0f;
      float mid = 0.0f;
      float treble = 0.0f;
    };

    class AudioBandAnalyzer
    {
    public:
      explicit AudioBandAnalyzer(unsigned windowSize = 1024);

      // Folds the buffer into a sliding window and returns the levels of the
      // latest window. Holds the previous levels until a full window exists.
      // Bass is below bassMaxHz, treble at or above trebleMinHz, mid between.
      BandLevels process(const Contracts::AudioBuffer& buffer, float bassMaxHz, float trebleMinHz);

    private:
      unsigned m_size;
      std::vector<float> m_window;
      std::vector<float> m_history;
      std::vector<std::complex<float>> m_fft;
      float m_windowPower;
      BandLevels m_last{};
    };
  }
}
