#pragma once

#include <cstdint>
#include <memory>
#include <stdexcept>

#include <Aurora/Input/IVideoInput.hpp>
#include <Aurora/Input/MonitorData.hpp>

// Single-display ScreenCaptureKit capture (Aurora-8mk.5, docs/MacSupport.md
// build-sequencing Phase 4). PIMPL: every ScreenCaptureKit/AppKit/CoreMedia
// type stays inside ScreenCaptureKitGrabber.mm (Objective-C++) so this
// header -- and every C++ TU that includes it -- stays plain C++, the same
// boundary input/mac's tests and app/mac's C++ call sites rely on.
//
// Monitor-switching (Aurora-8mk.6): same shape as X11Grabber/WindowsGrabber
// -- a MonitorData subclass carries the native handle needed to rebuild
// capture (here, CGDirectDisplayID; stored as plain uint32_t, its actual
// underlying type, so this header never needs a CoreGraphics include),
// selectMonitor() tears the stream down, and the next grabFrameSubsample()
// lazily rebuilds it against the newly selected display.
namespace Aurora::Input::Mac
{
  // Distinguishes the two Screen-Recording-permission-shaped
  // SCShareableContent failures from any other capture error (Aurora-8mk.8)
  // -- addStreamOutput/startCapture failures are real bugs, not permission
  // gaps, and stay plain std::runtime_error. A caller that needs to show a
  // distinct "permission denied, here's how to fix it" WebUI state catches
  // this specifically instead of pattern-matching what().
  //   Pending: the completion handler never answered within the bound (a
  //   first-run dialog still sitting unanswered -- retry later).
  //   Denied: it answered with zero displays -- macOS's Screen Recording
  //   denial is sticky, no re-ask (docs/MacSupport.md, "Recovery flow:
  //   denial is sticky").
  enum class PermissionErrorKind
  {
    Pending,
    Denied
  };

  class PermissionError : public std::runtime_error
  {
  public:
    PermissionError(PermissionErrorKind kind, const std::string& message):
    std::runtime_error(message),
    kind(kind)
    {}

    PermissionErrorKind kind;
  };


  class ScreenCaptureKitGrabber : public IVideoInput
  {
  public:
    struct SCKMonitorData : public Aurora::Input::MonitorData
    {
      SCKMonitorData(
        const std::string& name,
        unsigned width,
        unsigned height,
        double refreshRate,
        bool isPrimary,
        std::uint32_t displayID
      );

      std::uint32_t displayID{0};
    };

    ScreenCaptureKitGrabber();
    ~ScreenCaptureKitGrabber() override;

    const std::string& name() const override;

    bool hasCustomScreenManagement() const override
    {
      return true;
    }

    Resolution displayResolution() const override;
    RefreshRate displayRefreshRate() const override;

    void selectMonitor(unsigned monitorId) override;
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
    // Starts (or restarts, after selectMonitor() tore it down) the SCStream
    // for whichever monitor is currently selected -- falls back to the
    // primary display if the selected one is no longer present (unplugged
    // since _initMonitorsList()). All ScreenCaptureKit types this needs stay
    // inside the .mm; this declaration is plain C++.
    void _ensureStream();

    std::unique_ptr<Impl> m_impl;
  };
}
