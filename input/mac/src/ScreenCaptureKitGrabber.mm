#include <Aurora/Input/Mac/ScreenCaptureKitGrabber.hpp>

#include <chrono>
#include <future>
#include <mutex>
#include <optional>
#include <stdexcept>

#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>

using namespace std::chrono_literals;

namespace Aurora::Input::Mac
{
  namespace
  {
    // SCDisplay carries no human-readable name -- "Display <id>" is stable
    // and matches X11Grabber's fallback shape when Xrandr has nothing better.
    std::string displayLabel(CGDirectDisplayID displayID, bool isPrimary)
    {
      std::string label = "Display " + std::to_string(displayID);
      if(isPrimary){
        label += " (Primary)";
      }
      return label;
    }
  }
}

// The SCStreamOutput/SCStreamDelegate conformer -- protocol conformance
// needs a real NSObject, so this can't live behind the PIMPL boundary as a
// plain C++ type the way PipewireGrabber's callbacks (plain C function
// pointers) could. Holds a non-owning pointer back to Impl; the grabber
// destructor stops the stream (and this delegate's callbacks) before the
// Impl it points at is destroyed.
@interface AuroraSCKStreamOutput : NSObject <SCStreamOutput, SCStreamDelegate>
@property (nonatomic, assign) Aurora::Input::Mac::ScreenCaptureKitGrabber::Impl* impl;
@end

namespace Aurora::Input::Mac
{
  struct ScreenCaptureKitGrabber::Impl
  {
    SCStream* stream = nil;
    AuroraSCKStreamOutput* output = nil;
    CGDirectDisplayID displayID = 0; // no kCGDirectDisplayNull in this SDK; 0 is CGDirectDisplayID's own invalid sentinel
    unsigned pixelWidth = 0;
    unsigned pixelHeight = 0;
    double refreshRate = 60.0;

    // selectMonitor() tears the stream down and clears this; _ensureStream()
    // sets it before its one rebuild attempt so a display that stays
    // unreachable (permission revoked, display truly gone) doesn't cost
    // every subsequent grabFrameSubsample() call a bounded-but-real
    // SCShareableContent + SCStream round trip (unlike X11/Windows' local,
    // effectively-free per-frame retry, Mac's is a genuine async round trip
    // to another process). Self-healing beyond "try once per switch" is
    // Aurora-8mk.9 (isHealthy()) territory, not this bead's scope.
    bool rebuildAttempted = false;

    std::mutex frameMutex;
    Contracts::ImageData latestFrame;
  };
}

@implementation AuroraSCKStreamOutput

- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(SCStreamOutputType)type
{
  if(type != SCStreamOutputTypeScreen || !self.impl || !CMSampleBufferIsValid(sampleBuffer)){
    return;
  }

  CVPixelBufferRef pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
  if(pixelBuffer == nullptr){
    return;
  }

  CVPixelBufferLockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);

  void* base = CVPixelBufferGetBaseAddress(pixelBuffer);
  size_t width = CVPixelBufferGetWidth(pixelBuffer);
  size_t height = CVPixelBufferGetHeight(pixelBuffer);
  size_t bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer);

  if(base != nullptr && width > 0 && height > 0){
    // kCVPixelFormatType_32BGRA (set on SCStreamConfiguration below) maps
    // directly onto Contracts::PixelFormat::BGRA -- no channel-order or
    // byte-layout conversion needed, same "wrap then clone" shape as
    // PipewireFrameBuffer.hpp (Pipewire's buffer is invalid once this
    // callback returns, so the clone can't be deferred).
    cv::Mat view(static_cast<int>(height), static_cast<int>(width), CV_8UC4, base, bytesPerRow);

    Aurora::Contracts::ImageData captured;
    captured.imageMatrix = view.clone();
    captured.format = Aurora::Contracts::PixelFormat::BGRA;

    std::lock_guard<std::mutex> lock(self.impl->frameMutex);
    self.impl->latestFrame = std::move(captured);
  }

  CVPixelBufferUnlockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);
}


- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error
{
  // No reconnect/recovery flow yet -- Aurora-8mk.8 (permission recovery)
  // and Aurora-8mk.9 (lock/sleep health) own that. grabFrameSubsample()
  // keeps serving the last frame it had until this grabber is torn down.
}

@end

namespace Aurora::Input::Mac
{
  namespace
  {
    // Bounded fetch of the TCC-gated shareable-content list (also what
    // Aurora-8mk.4's probe used). Mirrors AudioGrabber.cpp's wait_for(5s),
    // not PipewireGrabber.cpp's unbounded .wait() (a live bug there, tracked
    // separately) -- a denied/never-answered permission shouldn't hang
    // whatever thread reaches here forever. Throws on timeout or an empty
    // display list; callers that must not throw (the per-switch lazy
    // rebuild) catch around this.
    SCShareableContent* fetchShareableContent()
    {
      auto contentPromise = std::make_shared<std::promise<SCShareableContent*>>();
      auto contentFuture = contentPromise->get_future();

      [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent* content, NSError* error){
        contentPromise->set_value(error == nil ? content : nil);
      }];

      if(contentFuture.wait_for(5s) != std::future_status::ready){
        throw PermissionError(
          PermissionErrorKind::Pending,
          "ScreenCaptureKitGrabber: SCShareableContent didn't respond within 5s -- "
          "check System Settings -> Privacy & Security -> Screen Recording"
        );
      }

      SCShareableContent* content = contentFuture.get();
      if(content == nil || content.displays.count == 0){
        throw PermissionError(
          PermissionErrorKind::Denied,
          "ScreenCaptureKitGrabber: no shareable displays -- Screen Recording "
          "permission likely not granted (System Settings -> Privacy & "
          "Security -> Screen Recording; Aurora must be launched as a real "
          ".app bundle via `open`/double-click for its own grant to apply, "
          "not exec'd directly -- see docs/MacSupport.md 'Load-bearing risk')"
        );
      }

      return content;
    }


    SCDisplay* findDisplayByID(SCShareableContent* content, CGDirectDisplayID targetDisplayID)
    {
      for(SCDisplay* display in content.displays){
        if(display.displayID == targetDisplayID){
          return display;
        }
      }

      return nil;
    }


    // Configures and starts the SCStream for `display`, writing the result
    // onto `impl` only once everything below has actually succeeded (a
    // half-built stream never gets assigned, so a throw here always leaves
    // `impl` in its prior, still-consistent state). Shared by
    // _initMonitorsList() (first start, expected to throw and abort startup
    // on failure) and _ensureStream() (post-switch rebuild, expected to
    // catch and keep serving the last frame on failure).
    void configureAndStartStream(ScreenCaptureKitGrabber::Impl& impl, SCDisplay* display)
    {
      // Points-vs-pixels (docs/MacSupport.md, input/mac's Load-bearing-risk-
      // adjacent design note): SCDisplay.width/height are POINTS;
      // SCStreamConfiguration.width/height need PIXELS, or a Retina display
      // silently captures at half resolution. SCDisplay exposes no scale
      // factor of its own -- match against NSScreen (AppKit, not
      // ScreenCaptureKit) via NSScreenNumber to get backingScaleFactor, and
      // maximumFramesPerSecond as the refresh rate while the match is in
      // hand (SCDisplay has no refresh-rate field either).
      double scaleFactor = 1.0;
      double refreshRate = 60.0;

      for(NSScreen* screen in [NSScreen screens]){
        NSNumber* screenNumber = screen.deviceDescription[@"NSScreenNumber"];
        if(screenNumber != nil && screenNumber.unsignedIntValue == display.displayID){
          scaleFactor = screen.backingScaleFactor;
          if(screen.maximumFramesPerSecond > 0){
            refreshRate = static_cast<double>(screen.maximumFramesPerSecond);
          }
          break;
        }
      }

      unsigned pixelWidth = static_cast<unsigned>(display.width * scaleFactor);
      unsigned pixelHeight = static_cast<unsigned>(display.height * scaleFactor);

      // Full display, no window exclusions -- ambient screen color capture
      // wants everything on screen, not a filtered subset.
      SCContentFilter* filter = [[SCContentFilter alloc] initWithDisplay:display excludingWindows:@[]];

      SCStreamConfiguration* streamConfig = [[SCStreamConfiguration alloc] init];
      streamConfig.width = pixelWidth;
      streamConfig.height = pixelHeight;
      streamConfig.pixelFormat = kCVPixelFormatType_32BGRA;
      streamConfig.minimumFrameInterval = CMTimeMake(1, static_cast<int32_t>(refreshRate));

      AuroraSCKStreamOutput* output = [[AuroraSCKStreamOutput alloc] init];
      output.impl = &impl;

      SCStream* stream = [[SCStream alloc] initWithFilter:filter configuration:streamConfig delegate:output];

      dispatch_queue_t sampleQueue = dispatch_queue_create("com.aurora.sck.output", DISPATCH_QUEUE_SERIAL);
      NSError* addOutputError = nil;
      bool addedOutput = [stream addStreamOutput:output
                                             type:SCStreamOutputTypeScreen
                               sampleHandlerQueue:sampleQueue
                                            error:&addOutputError];

      if(!addedOutput){
        std::string message = addOutputError != nil
          ? std::string(addOutputError.localizedDescription.UTF8String)
          : "unknown error";
        throw std::runtime_error("ScreenCaptureKitGrabber: addStreamOutput failed -- " + message);
      }

      auto startPromise = std::make_shared<std::promise<bool>>();
      auto startFuture = startPromise->get_future();

      [stream startCaptureWithCompletionHandler:^(NSError* error){
        startPromise->set_value(error == nil);
      }];

      if(startFuture.wait_for(5s) != std::future_status::ready || !startFuture.get()){
        throw std::runtime_error("ScreenCaptureKitGrabber: startCaptureWithCompletionHandler didn't succeed within 5s");
      }

      impl.displayID = display.displayID;
      impl.pixelWidth = pixelWidth;
      impl.pixelHeight = pixelHeight;
      impl.refreshRate = refreshRate;
      impl.stream = stream;
      impl.output = output;
    }


    // Bounded stop, mirroring the wait shape used everywhere else in this
    // file -- a teardown (destructor or selectMonitor()) shouldn't throw or
    // hang forever even if the stop callback never fires.
    void stopStream(ScreenCaptureKitGrabber::Impl& impl)
    {
      if(impl.stream == nil){
        return;
      }

      auto stopPromise = std::make_shared<std::promise<void>>();
      auto stopFuture = stopPromise->get_future();

      SCStream* stream = impl.stream;
      [stream stopCaptureWithCompletionHandler:^(NSError* error){
        stopPromise->set_value();
      }];

      stopFuture.wait_for(5s);

      impl.stream = nil;
      impl.output = nil;
    }
  }


  ScreenCaptureKitGrabber::SCKMonitorData::SCKMonitorData(
    const std::string& name,
    unsigned width,
    unsigned height,
    double refreshRate,
    bool isPrimary,
    std::uint32_t displayID
  ):
  MonitorData(name, width, height, refreshRate, isPrimary),
  displayID(displayID)
  {}


  ScreenCaptureKitGrabber::ScreenCaptureKitGrabber():
  m_impl(std::make_unique<Impl>())
  {
    // Real setup (permission-gated, async) happens in _initMonitorsList(),
    // per docs/MacSupport.md's "Bridging the async permission wait" -- the
    // constructor stays synchronous/trivial.
  }


  ScreenCaptureKitGrabber::~ScreenCaptureKitGrabber()
  {
    if(m_impl){
      stopStream(*m_impl);
    }
  }


  const std::string& ScreenCaptureKitGrabber::name() const
  {
    static const std::string s_name = "ScreenCaptureKitGrabber";
    return s_name;
  }


  IVideoInput::Resolution ScreenCaptureKitGrabber::displayResolution() const
  {
    return {static_cast<int>(m_impl->pixelWidth), static_cast<int>(m_impl->pixelHeight)};
  }


  IVideoInput::RefreshRate ScreenCaptureKitGrabber::displayRefreshRate() const
  {
    return static_cast<RefreshRate>(m_impl->refreshRate);
  }


  void ScreenCaptureKitGrabber::selectMonitor(
    unsigned monitorId
  )
  {
    stopStream(*m_impl);
    m_impl->rebuildAttempted = false;
    m_monitorSelectionData.selectedMonitorId = monitorId;
  }


  void ScreenCaptureKitGrabber::grabFrameSubsample(
    Contracts::ImageData& imageData
  )
  {
    _ensureStream();

    std::lock_guard<std::mutex> lock(m_impl->frameMutex);
    imageData = m_impl->latestFrame;
  }


  void ScreenCaptureKitGrabber::_ensureStream()
  {
    if(m_impl->stream != nil || m_impl->rebuildAttempted){
      return;
    }

    m_impl->rebuildAttempted = true;

    try{
      CGDirectDisplayID targetDisplayID = CGMainDisplayID();
      if(auto* selected = dynamic_cast<SCKMonitorData*>(m_monitorSelectionData.selectedMonitor())){
        targetDisplayID = selected->displayID;
      }

      SCShareableContent* content = fetchShareableContent();
      SCDisplay* chosen = findDisplayByID(content, targetDisplayID);
      if(chosen == nil){
        // Selected monitor unplugged since it was last enumerated -- fall
        // back to whatever's first rather than serve no frame at all.
        chosen = content.displays.firstObject;
      }

      configureAndStartStream(*m_impl, chosen);
    }
    catch(const std::exception&){
      // Per-frame lazy rebuild must never throw out of grabFrameSubsample()
      // -- Orchestrator::update() has no try/catch around that call.
      // Leave m_impl->stream nil; grabFrameSubsample() keeps serving the
      // last frame it had, same graceful-degradation shape as
      // WindowsGrabber's m_lastFrame-on-transient-failure. Surfacing a
      // persistent failure is Aurora-8mk.9 (isHealthy()) territory.
    }
  }


  void ScreenCaptureKitGrabber::_initMonitorsList()
  {
    SCShareableContent* content = fetchShareableContent();

    CGDirectDisplayID mainDisplayID = CGMainDisplayID();
    SCDisplay* chosen = content.displays.firstObject;
    Monitors monitors;
    std::optional<unsigned> primaryIndex;

    for(SCDisplay* display in content.displays){
      bool isPrimary = display.displayID == mainDisplayID;
      if(isPrimary){
        chosen = display;
        primaryIndex = static_cast<unsigned>(monitors.size());
      }

      // Points here -- pixel conversion (the actual displayResolution()
      // contract) happens in configureAndStartStream(), once the chosen
      // display's scale factor is known; listing every display in points is
      // enough for identification.
      monitors.push_back(std::make_shared<SCKMonitorData>(
        displayLabel(display.displayID, isPrimary),
        static_cast<unsigned>(display.width),
        static_cast<unsigned>(display.height),
        60.0,
        isPrimary,
        display.displayID
      ));
    }

    m_monitorSelectionData.monitors = std::move(monitors);
    m_monitorSelectionData.selectedMonitorId = primaryIndex;

    configureAndStartStream(*m_impl, chosen);
  }
}
