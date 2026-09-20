#pragma once

#include <string>

#include <Aurora/Contracts/AudioBuffer.hpp>

// Stable interface an audio plugin repo implements (e.g. a new target in
// Aurora-Input-Windows/-Linux). Deliberately no shared base with
// IVideoInput -- checked directly, IVideoInput's real contract is almost
// entirely screen/resolution-shaped, a generic parent would hold next to
// nothing. See docs/AudioAnalysis.md's naming section.
namespace Aurora::Input
{
  class IAudioInput
  {
  public:
    virtual ~IAudioInput() = default;

    virtual const std::string& name() const = 0;

    // Pull model, matching IVideoInput -- a live-capture implementation
    // adapts its platform's push-driven callback internally, exposing this
    // same pull-style read either way. Hands back raw, uninterpreted
    // samples; all analysis happens in AudioProcessing, not here.
    virtual void readNextBuffer(Contracts::AudioBuffer& buffer) = 0;
  };
}
