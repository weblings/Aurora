#include <Aurora/Processing/AudioBandAnalyzer.hpp>

#include <algorithm>
#include <cmath>
#include <numbers>

namespace Aurora::Processing
{
  namespace AudioProcessing
  {
    namespace
    {
      // In-place iterative radix-2; size must be a power of two.
      void fft(std::vector<std::complex<float>>& data)
      {
        const size_t n = data.size();
        for(size_t i = 1, j = 0; i < n; ++i){
          size_t bit = n >> 1;
          for(; j & bit; bit >>= 1){
            j ^= bit;
          }
          j ^= bit;
          if(i < j){
            std::swap(data[i], data[j]);
          }
        }
        for(size_t len = 2; len <= n; len <<= 1){
          const float angle = -2.0f * std::numbers::pi_v<float> / static_cast<float>(len);
          const std::complex<float> step(std::cos(angle), std::sin(angle));
          for(size_t start = 0; start < n; start += len){
            std::complex<float> twiddle(1.0f, 0.0f);
            for(size_t k = 0; k < len / 2; ++k){
              std::complex<float> even = data[start + k];
              std::complex<float> odd = data[start + k + len / 2] * twiddle;
              data[start + k] = even + odd;
              data[start + k + len / 2] = even - odd;
              twiddle *= step;
            }
          }
        }
      }

      unsigned roundToPowerOfTwo(unsigned value)
      {
        unsigned size = 64;
        while(size < value && size < 16384){
          size <<= 1;
        }
        return size;
      }
    }

    AudioBandAnalyzer::AudioBandAnalyzer(unsigned windowSize):
    m_size(roundToPowerOfTwo(windowSize)),
    m_window(m_size),
    m_fft(m_size),
    m_windowPower(0.0f)
    {
      for(unsigned i = 0; i < m_size; ++i){
        m_window[i] = 0.5f - 0.5f * std::cos(
          2.0f * std::numbers::pi_v<float> * static_cast<float>(i) / static_cast<float>(m_size));
        m_windowPower += m_window[i] * m_window[i];
      }
    }

    BandLevels AudioBandAnalyzer::process(
      const Contracts::AudioBuffer& buffer, float bassMaxHz, float trebleMinHz)
    {
      if(buffer.channelCount == 0 || buffer.samples.empty() || buffer.sampleRate == 0){
        return m_last;
      }

      const size_t frameCount = buffer.samples.size() / buffer.channelCount;
      for(size_t frame = 0; frame < frameCount; ++frame){
        float sum = 0.0f;
        for(unsigned ch = 0; ch < buffer.channelCount; ++ch){
          sum += buffer.samples[frame * buffer.channelCount + ch];
        }
        m_history.push_back(sum / static_cast<float>(buffer.channelCount));
      }
      if(m_history.size() > m_size){
        m_history.erase(m_history.begin(), m_history.end() - m_size);
      }
      if(m_history.size() < m_size){
        return m_last;
      }

      for(unsigned i = 0; i < m_size; ++i){
        m_fft[i] = m_history[i] * m_window[i];
      }
      fft(m_fft);

      // Sum |X|^2 per band over bins 1..N/2-1 (DC skipped), then convert the
      // one-sided power to mean-square by Parseval: 2 * sum / (N * sum w^2).
      const float binHz = static_cast<float>(buffer.sampleRate) / static_cast<float>(m_size);
      float power[3] = {0.0f, 0.0f, 0.0f};
      for(unsigned k = 1; k < m_size / 2; ++k){
        const float hz = static_cast<float>(k) * binHz;
        const int band = hz < bassMaxHz ? 0 : (hz < trebleMinHz ? 1 : 2);
        power[band] += std::norm(m_fft[k]);
      }
      const float scale = 2.0f / (static_cast<float>(m_size) * m_windowPower);
      m_last.bass = std::sqrt(power[0] * scale);
      m_last.mid = std::sqrt(power[1] * scale);
      m_last.treble = std::sqrt(power[2] * scale);
      return m_last;
    }
  }
}
