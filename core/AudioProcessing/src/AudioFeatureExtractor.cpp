#include <Aurora/Processing/AudioFeatureExtractor.hpp>
#include <Aurora/Processing/AudioProcessing.hpp>

#include <algorithm>
#include <cstring>

#include <aubio/aubio.h>

namespace Aurora::Processing
{
  namespace AudioProcessing
  {
    struct AudioFeatureExtractor::Impl
    {
      aubio_onset_t* onset = nullptr;
      aubio_pvoc_t* pvoc = nullptr;
      aubio_specdesc_t* specdesc = nullptr;
      fvec_t* hopIn = nullptr;
      fvec_t* onsetOut = nullptr;
      cvec_t* spectrum = nullptr;
      fvec_t* centroidOut = nullptr;

      unsigned sampleRate;
      unsigned bufSize;

      bool lastOnsetDetected = false;
      float lastOnsetStrength = 0.0f;
      float lastCentroidHz = 0.0f;

      // Leaky-max envelope, normalizing aubio's raw (unbounded) onset
      // descriptor into [0,1] -- aubio hands back a magnitude in whatever
      // units that detection method uses, not a normalized strength (see
      // AudioAnalysis.md's onset-strength/RMS split). Decay rate is a
      // first-cut starting point, not listening-tested.
      float rollingMaxStrength = 0.0f;
      static constexpr float kRollingMaxDecay = 0.999f;

      Impl(unsigned sampleRate_, unsigned bufSize_, unsigned hopSize_):
      sampleRate(sampleRate_),
      bufSize(bufSize_)
      {
        onset = new_aubio_onset(const_cast<char_t*>("default"), bufSize_, hopSize_, sampleRate_);
        pvoc = new_aubio_pvoc(bufSize_, hopSize_);
        specdesc = new_aubio_specdesc(const_cast<char_t*>("centroid"), bufSize_);
        hopIn = new_fvec(hopSize_);
        onsetOut = new_fvec(1);
        spectrum = new_cvec(bufSize_);
        centroidOut = new_fvec(1);
      }

      ~Impl()
      {
        if(onset) del_aubio_onset(onset);
        if(pvoc) del_aubio_pvoc(pvoc);
        if(specdesc) del_aubio_specdesc(specdesc);
        if(hopIn) del_fvec(hopIn);
        if(onsetOut) del_fvec(onsetOut);
        if(spectrum) del_cvec(spectrum);
        if(centroidOut) del_fvec(centroidOut);
      }

      void processHop(const float* samples, unsigned count)
      {
        for(unsigned i = 0; i < count; ++i){
          fvec_set_sample(hopIn, samples[i], i);
        }

        aubio_onset_do(onset, hopIn, onsetOut);
        lastOnsetDetected = fvec_get_sample(onsetOut, 0) != 0.0f;

        float rawStrength = lastOnsetDetected
          ? static_cast<float>(aubio_onset_get_descriptor(onset))
          : 0.0f;

        // Onset detection does its own internal spectral analysis --
        // separately, feed the same hop through an explicit phase vocoder
        // for the centroid, since aubio_specdesc_t needs an FFT spectrum,
        // not raw samples. The FFT is genuinely computed twice per hop;
        // known first-cut inefficiency, not a bug (see header comment).
        aubio_pvoc_do(pvoc, hopIn, spectrum);
        aubio_specdesc_do(specdesc, spectrum, centroidOut);
        float centroidBin = fvec_get_sample(centroidOut, 0);
        lastCentroidHz = aubio_bintofreq(
          centroidBin,
          static_cast<smpl_t>(sampleRate),
          static_cast<smpl_t>(bufSize)
        );

        if(lastOnsetDetected){
          rollingMaxStrength = std::max(rawStrength, rollingMaxStrength * kRollingMaxDecay);
        }
        else{
          rollingMaxStrength *= kRollingMaxDecay;
        }

        lastOnsetStrength = rollingMaxStrength > 1e-6f
          ? std::clamp(rawStrength / rollingMaxStrength, 0.0f, 1.0f)
          : 0.0f;
      }
    };


    AudioFeatureExtractor::AudioFeatureExtractor(unsigned sampleRate, unsigned bufSize, unsigned hopSize):
    m_impl(std::make_unique<Impl>(sampleRate, bufSize, hopSize)),
    m_hopSize(hopSize)
    {}

    AudioFeatureExtractor::~AudioFeatureExtractor() = default;


    Contracts::AudioFeatures AudioFeatureExtractor::process(const Contracts::AudioBuffer& buffer)
    {
      // rms is genuinely stateless -- reuse the already-tested free
      // function, recomputed fresh from this call's raw samples.
      Contracts::AudioFeatures features = extractFeatures(buffer);

      if(buffer.channelCount == 0 || buffer.samples.empty()){
        return features;
      }

      // Mono downmix, same as extractFeatures() -- duplicated here rather
      // than shared because this loop feeds the ring buffer sample-by-sample
      // as it downmixes, not building a second full-size intermediate buffer.
      size_t frameCount = buffer.samples.size() / buffer.channelCount;
      for(size_t frame = 0; frame < frameCount; ++frame){
        float sum = 0.0f;
        for(unsigned ch = 0; ch < buffer.channelCount; ++ch){
          sum += buffer.samples[frame * buffer.channelCount + ch];
        }
        m_ringBuffer.push_back(sum / static_cast<float>(buffer.channelCount));
      }

      bool anyOnsetThisCall = false;
      float lastStrength = 0.0f;

      while(m_ringBuffer.size() >= m_hopSize){
        m_impl->processHop(m_ringBuffer.data(), m_hopSize);
        m_ringBuffer.erase(m_ringBuffer.begin(), m_ringBuffer.begin() + m_hopSize);

        if(m_impl->lastOnsetDetected){
          anyOnsetThisCall = true;
          lastStrength = m_impl->lastOnsetStrength;
        }
        features.spectralCentroid = m_impl->lastCentroidHz;
      }

      features.onsetDetected = anyOnsetThisCall;
      features.onsetStrength = lastStrength;

      return features;
    }
  }
}
