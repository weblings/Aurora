#pragma once

#include <memory>
#include <string>

#include <Aurora/Input/IAudioInput.hpp>

// Whole-system Core Audio process-tap capture (Aurora-9z4.3,
// docs/MacSupport.md's "Deferred: audio" build sequencing, Step 2).
// Captures whatever the whole system is currently outputting (any app),
// matching Windows' WASAPI-loopback and Linux's PipeWire-monitor-source
// AudioGrabbers -- not one specific process's audio. See
// docs/log/2026-09-28-mac-audio-tap-probe.md for the hands-on verification
// this implementation is built against.
//
// PIMPL: CATapDescription and the NSDictionary/NSString aggregate-device
// description stay inside MacAudioGrabber.mm (Objective-C++), the same
// boundary ScreenCaptureKitGrabber.hpp already established for
// ScreenCaptureKit -- this header stays plain C++.
namespace Aurora::Input::Mac
{
  class MacAudioGrabber : public IAudioInput
  {
  public:
    MacAudioGrabber();
    ~MacAudioGrabber() override;

    MacAudioGrabber(const MacAudioGrabber&) = delete;
    MacAudioGrabber& operator=(const MacAudioGrabber&) = delete;

    const std::string& name() const override;

    // Push-to-pull adaptation lives here, not the interface -- the HAL
    // IOProc callback runs on its own real-time audio thread. Buffers
    // incoming samples under a lock and hands back whatever's accumulated
    // since the last call, possibly empty (matching AudioOrchestrator's
    // existing no-op-on-empty convention).
    void readNextBuffer(Contracts::AudioBuffer& buffer) override;

  private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
  };
}
