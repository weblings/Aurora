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

    // Aurora-9z4.4's permission-recovery design: Core Audio's "System Audio
    // Recording Only" grant has no explicit pending/denied signal at all --
    // AudioDeviceStart always returns noErr regardless of grant state (see
    // docs/MacSupport.md's audio section and Aurora-9z4.1's probe). Genuine
    // silence and a silent denial are indistinguishable moment to moment,
    // so this latches false (permission fine) forever the first time a
    // real, non-zero sample arrives, and only reports true beforehand once
    // a grace window has elapsed with nothing but zeros -- ordinary startup
    // silence doesn't false-positive, a denied grant eventually does.
    //
    // Deliberately Mac-specific, not promoted to IAudioInput -- unlike
    // IVideoInput::isHealthy() (a genuinely cross-platform "can a stream
    // die" concept, even though only Mac exercises it today), Windows'
    // WASAPI loopback and Linux's PipeWire monitor source have no
    // analogous silent-TCC-denial ambiguity to model. Callers that know
    // they're on Mac (app/mac's own code) dynamic_cast to query this, the
    // same shape ScreenCaptureKitGrabber's PermissionError already uses for
    // a Mac-only permission concept.
    bool isLikelyPermissionDenied() const;

  private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
  };
}
