#include <Aurora/Processing/AudioProcessing.hpp>

#include <algorithm>
#include <array>
#include <cmath>
#include <random>

namespace Aurora::Processing
{
  namespace AudioProcessing
  {
    Contracts::AudioFeatures extractFeatures(const Contracts::AudioBuffer& buffer)
    {
      Contracts::AudioFeatures features;

      if(buffer.samples.empty() || buffer.channelCount == 0){
        return features;
      }

      // Mono downmix -- aubio's onset/pitch functions expect mono;
      // centralized here rather than per-plugin, keeping IAudioInput's
      // contract genuinely raw (see AudioAnalysis.md).
      size_t frameCount = buffer.samples.size() / buffer.channelCount;
      double sumSquares = 0.0;
      for(size_t frame = 0; frame < frameCount; ++frame){
        float sum = 0.0f;
        for(unsigned ch = 0; ch < buffer.channelCount; ++ch){
          sum += buffer.samples[frame * buffer.channelCount + ch];
        }
        float monoSample = sum / static_cast<float>(buffer.channelCount);
        sumSquares += static_cast<double>(monoSample) * monoSample;
      }

      features.rms = frameCount > 0
        ? static_cast<float>(std::sqrt(sumSquares / static_cast<double>(frameCount)))
        : 0.0f;

      // Placeholders -- see this function's header comment. Onset detection
      // and spectral centroid need aubio (or an FFT) wired in as a
      // follow-up, once its real C API is verified against real behavior
      // rather than assumed.
      features.onsetDetected = false;
      features.onsetStrength = 0.0f;
      features.spectralCentroid = 0.0f;

      return features;
    }


    float randomAnchorHue()
    {
      // The six named vibrant complementary pairs' anchor side -- see
      // AudioAnalysis.md's palette table (Red/Cyan, Orange/Azure, ...).
      static const std::array<float, 6> anchors{0.0f, 30.0f, 60.0f, 90.0f, 120.0f, 150.0f};
      static std::mt19937 rng{std::random_device{}()};
      std::uniform_int_distribution<size_t> dist(0, anchors.size() - 1);
      return anchors[dist(rng)];
    }


    namespace
    {
      float wrapDegrees(float degrees)
      {
        float wrapped = std::fmod(degrees, 360.0f);
        if(wrapped < 0.0f){
          wrapped += 360.0f;
        }
        return wrapped;
      }

      // RockyRoad's shortest-arc formula (xr/index.ts), degrees instead of
      // radians -- see AudioAnalysis.md.
      float shortestArcDelta(float target, float current)
      {
        float delta = target - current;
        return std::fmod(std::fmod(delta + 180.0f, 360.0f) + 360.0f, 360.0f) - 180.0f;
      }
    }


    void updateDrift(
      DriftState& state,
      const Contracts::AudioFeatures& features,
      const AudioEffectSettings& settings,
      float dt
    )
    {
      if(!state.initialized){
        state.anchorHueDegrees = wrapDegrees(settings.fixedAnchorHue.value_or(randomAnchorHue()));
        state.rollingCentroid = features.spectralCentroid;
        state.initialized = true;
        return; // first tick only establishes state, same as Smoother's first-tick rule
      }

      // Rolling average, not a fixed reference -- a consistently bright/dark
      // track shouldn't just permanently peg the nudge to one extreme.
      // Warm-up behavior during the first few seconds isn't decided yet.
      const float rollingAlpha = 0.02f;
      state.rollingCentroid += (features.spectralCentroid - state.rollingCentroid) * rollingAlpha;

      float centroidDelta = features.spectralCentroid - state.rollingCentroid;
      float normalizedCentroidDelta = std::clamp(centroidDelta / settings.centroidRangeHz, -1.0f, 1.0f);

      // Rate-bias, not offset-bias: never reverses direction, only
      // speeds/slows it -- preserves the fixed-opposite-directions property
      // bounce/drift were assigned specifically for.
      float rate = settings.driftBaseRateDegPerSec * (1.0f + settings.centroidStrength * normalizedCentroidDelta);
      rate = std::max(rate, 0.0f);

      const float driftDirection = -1.0f; // opposite bounce's +1
      state.anchorHueDegrees = wrapDegrees(state.anchorHueDegrees + driftDirection * rate * dt);
    }


    Contracts::Color updateBounce(
      BounceState& state,
      const DriftState& driftState,
      const Contracts::AudioFeatures& features,
      const AudioEffectSettings& settings,
      float dt
    )
    {
      const float bounceDirection = 1.0f; // opposite drift's -1

      float brightnessFactor = std::clamp(
        features.rms / std::max(settings.referenceRms, 1e-4f),
        settings.brightnessFloor,
        1.0f
      );

      if(!state.initialized){
        state.currentHueDegrees = driftState.anchorHueDegrees;
        state.targetHueDegrees = driftState.anchorHueDegrees;
        state.smoothedBrightnessFactor = brightnessFactor; // no fade-in from zero on the first tick
        state.initialized = true;
      }

      if(features.onsetDetected){
        float normalizedStrength = std::clamp(features.onsetStrength, 0.0f, 1.0f);
        float swingFraction = settings.dynamismFloor + (1.0f - settings.dynamismFloor) * normalizedStrength;
        state.targetHueDegrees = wrapDegrees(state.targetHueDegrees + bounceDirection * swingFraction * 180.0f);
      }

      // Continuous exponential damping toward the target, applied
      // unconditionally (not gated on "an onset just fired") -- this is why
      // silence needs no special-cased logic, it naturally relaxes toward
      // wherever the ambient drift position currently is.
      float delta = shortestArcDelta(state.targetHueDegrees, state.currentHueDegrees);
      float smoothTime = std::max(settings.bounceSmoothTime, 1e-4f);
      state.currentHueDegrees = wrapDegrees(
        state.currentHueDegrees + delta * (1.0f - std::exp(-dt / smoothTime))
      );

      // Own damping constant, deliberately separate from bounceSmoothTime --
      // raw RMS jitters faster than the beat itself.
      float brightnessSmoothTime = std::max(settings.brightnessSmoothTime, 1e-4f);
      state.smoothedBrightnessFactor += (brightnessFactor - state.smoothedBrightnessFactor)
        * (1.0f - std::exp(-dt / brightnessSmoothTime));

      float effectiveValue = settings.vibrancyValue * state.smoothedBrightnessFactor;

      return Contracts::Color::fromHSV(state.currentHueDegrees, settings.vibrancySaturation, effectiveValue);
    }
  }
}
