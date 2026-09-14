#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>

#include <cmath>

#include <Aurora/Processing/AudioFeatureExtractor.hpp>

using namespace Aurora::Contracts;
using namespace Aurora::Processing;

namespace
{
  constexpr unsigned kSampleRate = 44100;

  // startSample lets consecutive calls continue the same waveform's phase
  // instead of each restarting at t=0 -- a phase reset at every call
  // boundary injects a discontinuity (broadband noise) that skews spectral
  // measurements, a real mistake this test file made and fixed once already.
  AudioBuffer sineWave(float freqHz, size_t sampleCount, float amplitude = 0.8f, size_t startSample = 0)
  {
    AudioBuffer buffer;
    buffer.sampleRate = kSampleRate;
    buffer.channelCount = 1;
    buffer.samples.resize(sampleCount);

    for(size_t i = 0; i < sampleCount; ++i){
      float t = static_cast<float>(startSample + i) / static_cast<float>(kSampleRate);
      buffer.samples[i] = amplitude * std::sin(2.0f * 3.14159265f * freqHz * t);
    }

    return buffer;
  }

  AudioBuffer silence(size_t sampleCount)
  {
    AudioBuffer buffer;
    buffer.sampleRate = kSampleRate;
    buffer.channelCount = 1;
    buffer.samples.assign(sampleCount, 0.0f);
    return buffer;
  }
}


TEST_CASE("AudioFeatureExtractor's centroid lands near a pure tone's actual frequency", "[AudioFeatureExtractor]")
{
  AudioProcessing::AudioFeatureExtractor extractor(kSampleRate);

  // One continuous buffer, not repeated per-hop calls -- generating a fresh
  // sineWave() per call restarts phase at t=0 each time, injecting a phase
  // discontinuity (broadband noise) at every hop boundary and skewing the
  // centroid upward. process() ring-buffers internally, so one call over
  // enough samples for several hops is both correct and sufficient.
  auto features = extractor.process(sineWave(1000.0f, 512 * 20));

  // Bin resolution at bufSize 1024 / 44100Hz is ~43Hz -- a generous
  // tolerance around the true 1000Hz tone, not an exact match.
  REQUIRE(features.spectralCentroid == Catch::Approx(1000.0f).margin(100.0f));
}


TEST_CASE("AudioFeatureExtractor's centroid is higher for a higher-pitched tone", "[AudioFeatureExtractor]")
{
  AudioProcessing::AudioFeatureExtractor lowExtractor(kSampleRate);
  AudioProcessing::AudioFeatureExtractor highExtractor(kSampleRate);

  auto lowFeatures = lowExtractor.process(sineWave(500.0f, 512 * 20));
  auto highFeatures = highExtractor.process(sineWave(4000.0f, 512 * 20));

  REQUIRE(highFeatures.spectralCentroid > lowFeatures.spectralCentroid);
}


TEST_CASE("AudioFeatureExtractor detects an onset on a sudden loud transient after silence", "[AudioFeatureExtractor]")
{
  AudioProcessing::AudioFeatureExtractor extractor(kSampleRate);

  // Prime with silence so the detector has a quiet baseline established.
  for(int i = 0; i < 10; ++i){
    extractor.process(silence(512));
  }

  // A sudden full-amplitude tone should register as a real onset somewhere
  // across these hops, not necessarily the very first one. Continuous
  // phase across calls -- see sineWave()'s comment.
  bool detectedAny = false;
  for(int i = 0; i < 5; ++i){
    auto features = extractor.process(sineWave(440.0f, 512, 1.0f, static_cast<size_t>(i) * 512));
    detectedAny = detectedAny || features.onsetDetected;
  }

  REQUIRE(detectedAny);
}


TEST_CASE("AudioFeatureExtractor's onsetStrength is normalized to [0,1]", "[AudioFeatureExtractor]")
{
  AudioProcessing::AudioFeatureExtractor extractor(kSampleRate);

  for(int i = 0; i < 10; ++i){
    extractor.process(silence(512));
  }

  for(int i = 0; i < 5; ++i){
    auto features = extractor.process(sineWave(440.0f, 512, 1.0f, static_cast<size_t>(i) * 512));
    CHECK(features.onsetStrength >= 0.0f);
    CHECK(features.onsetStrength <= 1.0f);
  }
}


TEST_CASE("AudioFeatureExtractor still computes real RMS, unaffected by hop-chunking", "[AudioFeatureExtractor]")
{
  AudioProcessing::AudioFeatureExtractor extractor(kSampleRate);

  AudioBuffer buffer;
  buffer.sampleRate = kSampleRate;
  buffer.channelCount = 1;
  buffer.samples = {0.5f, -0.5f, 0.5f, -0.5f};

  auto features = extractor.process(buffer);
  REQUIRE(features.rms == Catch::Approx(0.5f).margin(0.001f));
}
