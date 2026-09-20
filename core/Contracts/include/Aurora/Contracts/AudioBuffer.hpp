#pragma once

#include <vector>

// The Input->Processing contract for audio, mirroring ImageData's role for
// video. Raw and uninterpreted -- IAudioInput hands this back untouched,
// all analysis happens in AudioProcessing. See docs/AudioAnalysis.md.
namespace Aurora::Contracts
{
  struct AudioBuffer
  {
    std::vector<float> samples; // interleaved if channelCount > 1
    unsigned sampleRate = 0;
    unsigned channelCount = 1;
  };
}
