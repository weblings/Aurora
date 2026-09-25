#pragma once

#include <memory>

#include <Aurora/Input/IVideoInput.hpp>

// Single-display ScreenCaptureKit capture (Aurora-8mk.5, docs/MacSupport.md
// build-sequencing Phase 4). PIMPL: every ScreenCaptureKit/AppKit/CoreMedia
// type stays inside ScreenCaptureKitGrabber.mm (Objective-C++) so this
// header -- and every C++ TU that includes it -- stays plain C++, the same
// boundary input/mac's tests and app/mac's C++ call sites rely on.
//
// No monitor-switching yet: hasCustomScreenManagement()/selectMonitor() are
// Aurora-8mk.6 -- this always captures CGMainDisplayID(), the primary
// display, though _initMonitorsList() does populate the full monitor list
// for that later work to build on.
namespace Aurora::Input::Mac
{
  class ScreenCaptureKitGrabber : public IVideoInput
  {
  public:
    ScreenCaptureKitGrabber();
    ~ScreenCaptureKitGrabber() override;

    const std::string& name() const override;
    Resolution displayResolution() const override;
    RefreshRate displayRefreshRate() const override;

    void grabFrameSubsample(Contracts::ImageData& imageData) override;

  protected:
    // Bridges SCShareableContent's async completion handler to IVideoInput's
    // synchronous init() contract with a BOUNDED wait (AudioGrabber.cpp's
    // wait_for(5s) pattern, not PipewireGrabber's unbounded .wait() -- see
    // docs/MacSupport.md, "Bridging the async permission wait"). Also
    // configures and starts the SCStream itself, since that's the point at
    // which the display (and its point-vs-pixel scale factor) is known.
    void _initMonitorsList() override;

  public:
    // Public only so ScreenCaptureKitGrabber.mm's Objective-C stream-output
    // delegate (a real NSObject, can't live behind this PIMPL boundary
    // itself) can be typed against it -- never named outside that TU.
    struct Impl;

  private:
    std::unique_ptr<Impl> m_impl;
  };
}
