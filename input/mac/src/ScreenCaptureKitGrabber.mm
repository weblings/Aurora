#include <Aurora/Input/Mac/ScreenCaptureKitGrabber.hpp>

#include <chrono>
#include <future>
#include <mutex>
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
  ScreenCaptureKitGrabber::ScreenCaptureKitGrabber():
  m_impl(std::make_unique<Impl>())
  {
    // Real setup (permission-gated, async) happens in _initMonitorsList(),
    // per docs/MacSupport.md's "Bridging the async permission wait" -- the
    // constructor stays synchronous/trivial.
  }


  ScreenCaptureKitGrabber::~ScreenCaptureKitGrabber()
  {
    if(m_impl && m_impl->stream != nil){
      auto stopPromise = std::make_shared<std::promise<void>>();
      auto stopFuture = stopPromise->get_future();

      SCStream* stream = m_impl->stream;
      [stream stopCaptureWithCompletionHandler:^(NSError* error){
        stopPromise->set_value();
      }];

      // Best-effort bound -- a destructor shouldn't throw or hang forever
      // even if the stop callback never fires.
      stopFuture.wait_for(5s);
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


  void ScreenCaptureKitGrabber::grabFrameSubsample(
    Contracts::ImageData& imageData
  )
  {
    std::lock_guard<std::mutex> lock(m_impl->frameMutex);
    imageData = m_impl->latestFrame;
  }


  void ScreenCaptureKitGrabber::_initMonitorsList()
  {
    // Step 1: SCShareableContent -- the actual TCC-gated call (also what
    // Aurora-8mk.4's probe used). Bounded, mirroring AudioGrabber.cpp's
    // wait_for(5s), not PipewireGrabber.cpp's unbounded .wait() (a live bug
    // there, tracked separately) -- a denied/never-answered permission
    // shouldn't hang the HTTP request thread that reaches here via
    // Pipeline::build() forever.
    auto contentPromise = std::make_shared<std::promise<SCShareableContent*>>();
    auto contentFuture = contentPromise->get_future();

    [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent* content, NSError* error){
      contentPromise->set_value(error == nil ? content : nil);
    }];

    if(contentFuture.wait_for(5s) != std::future_status::ready){
      throw std::runtime_error(
        "ScreenCaptureKitGrabber: SCShareableContent didn't respond within 5s -- "
        "check System Settings -> Privacy & Security -> Screen Recording"
      );
    }

    SCShareableContent* content = contentFuture.get();
    if(content == nil || content.displays.count == 0){
      throw std::runtime_error(
        "ScreenCaptureKitGrabber: no shareable displays -- Screen Recording "
        "permission likely not granted (System Settings -> Privacy & "
        "Security -> Screen Recording; Aurora must be launched as a real "
        ".app bundle via `open`/double-click for its own grant to apply, "
        "not exec'd directly -- see docs/MacSupport.md 'Load-bearing risk')"
      );
    }

    // Step 2: pick the primary display and populate the monitor list. Real
    // switching is Aurora-8mk.6 -- this always ends up selecting the
    // primary regardless of what's listed here.
    CGDirectDisplayID mainDisplayID = CGMainDisplayID();
    SCDisplay* chosen = content.displays.firstObject;
    Monitors monitors;

    for(SCDisplay* display in content.displays){
      bool isPrimary = display.displayID == mainDisplayID;
      if(isPrimary){
        chosen = display;
      }

      // Points here -- pixel conversion (the actual displayResolution()
      // contract) happens below, once the chosen display's scale factor is
      // known; listing every display in points is enough for identification.
      monitors.push_back(std::make_shared<MonitorData>(
        displayLabel(display.displayID, isPrimary),
        static_cast<unsigned>(display.width),
        static_cast<unsigned>(display.height),
        60.0,
        isPrimary
      ));
    }

    m_monitorSelectionData.monitors = std::move(monitors);

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
      if(screenNumber != nil && screenNumber.unsignedIntValue == chosen.displayID){
        scaleFactor = screen.backingScaleFactor;
        if(screen.maximumFramesPerSecond > 0){
          refreshRate = static_cast<double>(screen.maximumFramesPerSecond);
        }
        break;
      }
    }

    m_impl->displayID = chosen.displayID;
    m_impl->pixelWidth = static_cast<unsigned>(chosen.width * scaleFactor);
    m_impl->pixelHeight = static_cast<unsigned>(chosen.height * scaleFactor);
    m_impl->refreshRate = refreshRate;

    // Step 3: configure and start the stream against the now-known pixel
    // resolution. Full display, no window exclusions -- ambient screen
    // color capture wants everything on screen, not a filtered subset.
    SCContentFilter* filter = [[SCContentFilter alloc] initWithDisplay:chosen excludingWindows:@[]];

    SCStreamConfiguration* streamConfig = [[SCStreamConfiguration alloc] init];
    streamConfig.width = m_impl->pixelWidth;
    streamConfig.height = m_impl->pixelHeight;
    streamConfig.pixelFormat = kCVPixelFormatType_32BGRA;
    streamConfig.minimumFrameInterval = CMTimeMake(1, static_cast<int32_t>(refreshRate));

    AuroraSCKStreamOutput* output = [[AuroraSCKStreamOutput alloc] init];
    output.impl = m_impl.get();

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

    m_impl->stream = stream;
    m_impl->output = output;
  }
}
