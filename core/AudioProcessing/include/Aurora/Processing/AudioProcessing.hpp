#pragma once

#include <optional>

#include <Aurora/Contracts/AudioBuffer.hpp>
#include <Aurora/Contracts/AudioFeatures.hpp>
#include <Aurora/Contracts/Color.hpp>

// The audio-reactive default effect's actual logic -- mirrors
// Aurora::Processing::ImageProcessing's shape (small, pure, independently
// testable functions) but for audio instead of pixels. See
// docs/AudioAnalysis.md for the reasoning and formulas behind every
// piece here. A separate Core target from ImageProcessing/Processing
// deliberately -- only audio-enabled consumers need this linked.
namespace Aurora::Processing
{
  namespace AudioProcessing
  {
    // Tunable knobs for the color model. Meant to be read from Config and
    // passed in here rather than hardcoded, so a future settings UI needs
    // zero changes to this module -- see AudioAnalysis.md's
    // "making the tunable constants genuinely UI-editable" section. Every
    // default below was tuned against a real listening test (speech and
    // music, live Hue lights) -- see docs/lessons for the tuning notes.
    struct AudioEffectSettings
    {
      // Unset = random pick among the six named pairs at cold start,
      // matching Config::activeMonitorName's "empty means auto" pattern.
      // Only affects the *starting* anchor -- drift still runs afterward.
      std::optional<float> fixedAnchorHue;

      float bounceSmoothTime = 0.45f;     // seconds, exponential damping time constant
      float dynamismFloor = 0.22f;        // minimum swing fraction, even for the weakest onset
      float centroidStrength = 0.3f;      // how much spectral centroid can speed/slow drift; 0 = no effect
      float driftBaseRateDegPerSec = 6.0f;// base drift speed -- a full rotation every 60s by default
      float vibrancySaturation = 0.95f;   // HSV S for every generated color, constant
      float vibrancyValue = 0.95f;        // HSV V ceiling, before RMS brightness scaling
      float referenceRms = 0.5f;          // RMS level mapped to full brightness
      float brightnessFloor = 0.4f;       // never fully dark, even in quiet passages
      float centroidRangeHz = 2250.0f;    // spread normalizing centroid-vs-rolling-average delta to [-1,1]

      // Brightness gets its own damping, separate from bounceSmoothTime --
      // raw RMS jitters tick-to-tick, so smoothing it at the beat's own
      // (tighter) time constant would either flash or blunt the beat.
      float brightnessSmoothTime = 0.45f;
    };

    // Persistent state for palette drift, owned by whoever drives the tick
    // loop (AudioOrchestrator) -- updateDrift is pure given this state, not
    // global/static, so it's independently testable with literal values.
    struct DriftState
    {
      float anchorHueDegrees = 0.0f; // current base hue; the pair's other color is +180
      float rollingCentroid = 0.0f;
      bool initialized = false;
    };

    // Persistent state for the beat-driven bounce.
    struct BounceState
    {
      float currentHueDegrees = 0.0f; // the actually-displayed position
      float targetHueDegrees = 0.0f;  // where currentHueDegrees is damping toward
      float smoothedBrightnessFactor = 0.0f; // damped separately from hue, see brightnessSmoothTime
      bool initialized = false;
    };

    // Extracts the interpreted features the color model consumes from a raw
    // buffer. Mono downmix happens here, not per-plugin, keeping
    // IAudioInput's contract genuinely raw. rms is real (pure math, no
    // dependency). onsetDetected/onsetStrength/spectralCentroid are
    // placeholders (always false/0) -- wiring these to aubio is a follow-up
    // step needing aubio's actual C API verified first, not assumed; see
    // AudioAnalysis.md's "verify a library's real behavior" habit.
    Contracts::AudioFeatures extractFeatures(const Contracts::AudioBuffer& buffer);

    // Picks one of the six named vibrant complementary pairs at random (see
    // AudioAnalysis.md's palette table), returning the anchor hue. A free
    // function so cold-start is independently testable, not baked into
    // updateDrift.
    float randomAnchorHue();

    // Slow process: the anchor hue creeps at a fixed rate in a fixed
    // rotational direction (negative -- opposite bounce's positive
    // direction, so the two motions stay visually distinct), nudged (not
    // overridden) by spectralCentroid via a rolling-average-referenced
    // rate-bias. First call initializes state from settings.fixedAnchorHue
    // or randomAnchorHue(). dt in seconds.
    void updateDrift(
      DriftState& state,
      const Contracts::AudioFeatures& features,
      const AudioEffectSettings& settings,
      float dt
    );

    // Fast process: continuous exponential damping (RockyRoad's
    // shortest-arc formula, see AudioAnalysis.md) toward a target that
    // advances -- in bounce's fixed positive direction, from wherever
    // current already is -- by a fraction of 180 degrees on each detected
    // onset, scaled by that onset's strength with a dynamism floor so even
    // the weakest beat still moves it. Returns the actual color to send,
    // combining the current hue with RMS-scaled brightness (gated by a
    // floor, never fully dark).
    Contracts::Color updateBounce(
      BounceState& state,
      const DriftState& driftState,
      const Contracts::AudioFeatures& features,
      const AudioEffectSettings& settings,
      float dt
    );
  }
}
