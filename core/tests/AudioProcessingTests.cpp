#include <catch2/catch_test_macros.hpp>
#include <catch2/catch_approx.hpp>

#include <cmath>

#include <Aurora/Processing/AudioProcessing.hpp>

using namespace Aurora::Contracts;
using namespace Aurora::Processing;


TEST_CASE("Color::fromHSV/toHSV round-trips the six named anchor hues", "[AudioProcessing][Color]")
{
  // The six anchors from AudioAnalysis.md's palette table -- verified via
  // the standard sector formula when the table was first derived, checked
  // again here as a regression guard.
  for(float hue : {0.0f, 30.0f, 60.0f, 90.0f, 120.0f, 150.0f}){
    Color color = Color::fromHSV(hue, 1.0f, 1.0f);
    glm::vec3 hsv = color.toHSV();
    REQUIRE(hsv.x == Catch::Approx(hue).margin(0.6f)); // uint8 rounding, not exact
    REQUIRE(hsv.y == Catch::Approx(1.0f).margin(0.01f));
    REQUIRE(hsv.z == Catch::Approx(1.0f).margin(0.01f));
  }
}


TEST_CASE("Color::fromHSV matches the verified palette table", "[AudioProcessing][Color]")
{
  Color red = Color::fromHSV(0.0f, 1.0f, 1.0f);
  REQUIRE(static_cast<int>(red.m_r) == 255);
  REQUIRE(static_cast<int>(red.m_g) == 0);
  REQUIRE(static_cast<int>(red.m_b) == 0);

  Color cyan = Color::fromHSV(180.0f, 1.0f, 1.0f);
  REQUIRE(static_cast<int>(cyan.m_r) == 0);
  REQUIRE(static_cast<int>(cyan.m_g) == 255);
  REQUIRE(static_cast<int>(cyan.m_b) == 255);

  Color orange = Color::fromHSV(30.0f, 1.0f, 1.0f);
  REQUIRE(static_cast<int>(orange.m_r) == 255);
  REQUIRE(static_cast<int>(orange.m_g) == 128);
  REQUIRE(static_cast<int>(orange.m_b) == 0);
}


TEST_CASE("extractFeatures computes real RMS from raw samples", "[AudioProcessing]")
{
  AudioBuffer buffer;
  buffer.sampleRate = 44100;
  buffer.channelCount = 1;
  buffer.samples = {0.5f, -0.5f, 0.5f, -0.5f}; // constant-magnitude, RMS should be exactly 0.5

  auto features = AudioProcessing::extractFeatures(buffer);
  REQUIRE(features.rms == Catch::Approx(0.5f).margin(0.001f));
}


TEST_CASE("extractFeatures downmixes multi-channel before computing RMS", "[AudioProcessing]")
{
  AudioBuffer buffer;
  buffer.sampleRate = 44100;
  buffer.channelCount = 2;
  // Left always +1, right always -1 -- averages to exactly 0 every frame,
  // so a correct downmix gives RMS 0 despite neither channel being silent.
  buffer.samples = {1.0f, -1.0f, 1.0f, -1.0f};

  auto features = AudioProcessing::extractFeatures(buffer);
  REQUIRE(features.rms == Catch::Approx(0.0f).margin(0.001f));
}


TEST_CASE("extractFeatures returns silence for an empty buffer", "[AudioProcessing]")
{
  AudioBuffer buffer;
  buffer.sampleRate = 44100;
  buffer.channelCount = 1;

  auto features = AudioProcessing::extractFeatures(buffer);
  REQUIRE(features.rms == 0.0f);
  REQUIRE(features.onsetDetected == false);
}


TEST_CASE("randomAnchorHue always returns one of the six named anchors", "[AudioProcessing]")
{
  for(int i = 0; i < 50; ++i){
    float hue = AudioProcessing::randomAnchorHue();
    bool isKnownAnchor = (hue == 0.0f || hue == 30.0f || hue == 60.0f ||
                          hue == 90.0f || hue == 120.0f || hue == 150.0f);
    REQUIRE(isKnownAnchor);
  }
}


TEST_CASE("updateDrift's first call only initializes state, matching Smoother's first-tick rule", "[AudioProcessing]")
{
  AudioProcessing::DriftState state;
  AudioProcessing::AudioEffectSettings settings;
  settings.fixedAnchorHue = 60.0f;

  AudioFeatures features;
  AudioProcessing::updateDrift(state, features, settings, 1.0f);

  REQUIRE(state.initialized);
  REQUIRE(state.anchorHueDegrees == Catch::Approx(60.0f));
}


TEST_CASE("updateDrift honors fixedAnchorHue only as the starting point, then keeps drifting", "[AudioProcessing]")
{
  AudioProcessing::DriftState state;
  AudioProcessing::AudioEffectSettings settings;
  settings.fixedAnchorHue = 60.0f;
  settings.driftBaseRateDegPerSec = 10.0f;
  settings.centroidStrength = 0.0f; // isolate the base rate, no centroid nudge

  AudioFeatures features;
  AudioProcessing::updateDrift(state, features, settings, 1.0f); // init tick
  float afterInit = state.anchorHueDegrees;
  AudioProcessing::updateDrift(state, features, settings, 1.0f); // one real second of drift

  // Drift direction is negative (opposite bounce's positive direction).
  REQUIRE(state.anchorHueDegrees != Catch::Approx(afterInit));
  REQUIRE(state.anchorHueDegrees == Catch::Approx(std::fmod(60.0f - 10.0f + 360.0f, 360.0f)));
}


TEST_CASE("updateDrift's rate-bias never reverses direction, only speeds or slows it", "[AudioProcessing]")
{
  AudioProcessing::AudioEffectSettings settings;
  settings.fixedAnchorHue = 100.0f;
  settings.driftBaseRateDegPerSec = 10.0f;
  settings.centroidStrength = 1.0f;
  settings.centroidRangeHz = 1000.0f;

  AudioProcessing::DriftState slow;
  AudioProcessing::DriftState fast;

  AudioFeatures initFeatures;
  AudioProcessing::updateDrift(slow, initFeatures, settings, 0.0f);
  AudioProcessing::updateDrift(fast, initFeatures, settings, 0.0f);

  AudioFeatures lowCentroid;
  lowCentroid.spectralCentroid = -1000.0f; // far below the rolling average established at init (0)
  AudioFeatures highCentroid;
  highCentroid.spectralCentroid = 1000.0f; // far above it

  AudioProcessing::updateDrift(slow, lowCentroid, settings, 1.0f);
  AudioProcessing::updateDrift(fast, highCentroid, settings, 1.0f);

  // Both should have moved in the same (negative) direction from 100 --
  // never reversed -- but by different amounts.
  REQUIRE(slow.anchorHueDegrees < 100.0f);
  REQUIRE(fast.anchorHueDegrees < 100.0f);
  REQUIRE(fast.anchorHueDegrees < slow.anchorHueDegrees); // higher centroid drifted further this tick
}


TEST_CASE("updateBounce's first call initializes at the drift anchor, not a hardcoded default", "[AudioProcessing]")
{
  AudioProcessing::DriftState driftState;
  driftState.anchorHueDegrees = 200.0f;
  driftState.initialized = true;

  AudioProcessing::BounceState bounceState;
  AudioProcessing::AudioEffectSettings settings;
  AudioFeatures features;

  AudioProcessing::updateBounce(bounceState, driftState, features, settings, 0.0f);

  REQUIRE(bounceState.initialized);
  REQUIRE(bounceState.currentHueDegrees == Catch::Approx(200.0f));
}


TEST_CASE("updateBounce's dynamism floor guarantees a visible swing even for the weakest onset", "[AudioProcessing]")
{
  AudioProcessing::DriftState driftState;
  driftState.anchorHueDegrees = 0.0f;
  driftState.initialized = true;

  AudioProcessing::BounceState bounceState;
  AudioProcessing::AudioEffectSettings settings;
  settings.dynamismFloor = 0.25f;
  settings.bounceSmoothTime = 1e-6f; // ~instant, isolates the target-setting logic from damping

  AudioFeatures weakOnset;
  weakOnset.onsetDetected = true;
  weakOnset.onsetStrength = 0.0f; // weakest possible onset

  AudioProcessing::updateBounce(bounceState, driftState, weakOnset, settings, 1.0f);

  // Floor guarantees at least dynamismFloor * 180 degrees of swing, not zero.
  REQUIRE(bounceState.targetHueDegrees == Catch::Approx(0.25f * 180.0f).margin(0.5f));
}


TEST_CASE("updateBounce's brightness floor keeps the color visible even in silence", "[AudioProcessing]")
{
  AudioProcessing::DriftState driftState;
  driftState.anchorHueDegrees = 0.0f;
  driftState.initialized = true;

  AudioProcessing::BounceState bounceState;
  AudioProcessing::AudioEffectSettings settings;
  settings.brightnessFloor = 0.15f;
  settings.vibrancyValue = 1.0f;

  AudioFeatures silence;
  silence.rms = 0.0f;

  Color result = AudioProcessing::updateBounce(bounceState, driftState, silence, settings, 0.0f);

  REQUIRE(result.brightness() > 0.0f); // floor prevents fully black, not a specific value
}
