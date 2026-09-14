#pragma once

#include <memory>
#include <string>

#include <Aurora/Input/IAudioInput.hpp>

// WASAPI loopback capture via miniaudio -- captures whatever the whole
// system is currently outputting (any app), not one specific process. See
// Analysis/AudioAnalysis.md for why miniaudio over hand-rolling WASAPI
// (its own internal resampler/format-conversion) and over Microsoft's own
// per-process sample (that one solves a narrower, different problem --
// isolating one app's audio, not "whatever's playing").
namespace Aurora::Input::Windows
{
  class AudioGrabber : public IAudioInput
  {
  public:
    AudioGrabber();
    ~AudioGrabber() override;

    AudioGrabber(const AudioGrabber&) = delete;
    AudioGrabber& operator=(const AudioGrabber&) = delete;

    const std::string& name() const override;

    // Push-to-pull adaptation lives here, not the interface -- miniaudio's
    // callback runs on its own real-time audio thread. This buffers
    // incoming samples under a lock and hands back whatever's accumulated
    // since the last call, possibly empty (matching AudioOrchestrator's
    // existing no-op-on-empty convention).
    void readNextBuffer(Contracts::AudioBuffer& buffer) override;

  private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
  };
}
