#include <Aurora/Input/Mac/ScreenCaptureKitGrabber.hpp>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <future>
#include <iostream>
#include <memory>
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
// pointers) could. Holds shared ownership of Impl: the grabber destructor
// cannot assume SCK's callbacks have finished by the time it returns (the
// stop completion handler is no documented barrier), so a raw pointer here
// raced teardown and crashed on a destroyed mutex (Aurora-eq7a).
@interface AuroraSCKStreamOutput : NSObject <SCStreamOutput, SCStreamDelegate>
// Takes shared ownership of the grabber's state, once, before the output is
// handed to the stream (Aurora-eq7a).
- (void)attach:(std::shared_ptr<Aurora::Input::Mac::ScreenCaptureKitGrabber::Impl>)impl;
@end

namespace Aurora::Input::Mac
{
  // Shared with AuroraSCKStreamOutput (Aurora-eq7a): the stream's callbacks
  // run on SCK's own queues and can still be executing, or queued, when the
  // grabber is destroyed, so the state they lock must outlive the grabber.
  // The output holds a shared_ptr back to this; this holds the output (and
  // stream) strongly, a cycle that stopStream()/didStopWithError: break by
  // clearing `output` and `stream`.
  struct ScreenCaptureKitGrabber::Impl : std::enable_shared_from_this<ScreenCaptureKitGrabber::Impl>
  {
    // stream/output/rebuildAttempted/healthy are touched both from the app's
    // own thread (grabFrameSubsample()/selectMonitor(), serialized upstream
    // by PipelineHost's own mutex) and from the SCStream delegate's callback
    // thread (didStopWithError:, its own independent dispatch queue) --
    // frameMutex guards all of them, not just latestFrame.
    SCStream* stream = nil;
    AuroraSCKStreamOutput* output = nil;
    CGDirectDisplayID displayID = 0; // no kCGDirectDisplayNull in this SDK; 0 is CGDirectDisplayID's own invalid sentinel
    unsigned pixelWidth = 0;
    unsigned pixelHeight = 0;
    double refreshRate = 60.0;

    // selectMonitor() and didStopWithError: both tear the stream down and
    // clear this; _ensureStream() sets it before its one rebuild attempt so
    // a display that stays unreachable (permission revoked, display truly
    // gone) doesn't cost every subsequent grabFrameSubsample() call a
    // bounded-but-real SCShareableContent + SCStream round trip (unlike
    // X11/Windows' local, effectively-free per-frame retry, Mac's is a
    // genuine async round trip to another process).
    bool rebuildAttempted = false;

    // False from didStopWithError: (Aurora-8mk.9 -- macOS tears the stream
    // down entirely on screen lock, it doesn't just pause) until
    // configureAndStartStream() next succeeds. IVideoInput::isHealthy()
    // defaults true, so Linux/Windows are unaffected by this existing at all.
    bool healthy = true;

    // IVideoInput::setCaptureWidthHint() -- 0 means deliver full pixel size.
    unsigned captureWidthHint = 0;

    std::mutex frameMutex;
    Contracts::ImageData latestFrame;
  };
}

@implementation AuroraSCKStreamOutput {
  std::shared_ptr<Aurora::Input::Mac::ScreenCaptureKitGrabber::Impl> _impl;
}

- (void)attach:(std::shared_ptr<Aurora::Input::Mac::ScreenCaptureKitGrabber::Impl>)impl
{
  _impl = std::move(impl);
}

- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(SCStreamOutputType)type
{
  // Local copy: keeps the state alive for the whole callback even if the
  // grabber is destroyed mid-way (Aurora-eq7a).
  std::shared_ptr<Aurora::Input::Mac::ScreenCaptureKitGrabber::Impl> impl = _impl;
  if(type != SCStreamOutputTypeScreen || !impl || !CMSampleBufferIsValid(sampleBuffer)){
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

    std::lock_guard<std::mutex> lock(impl->frameMutex);
    impl->latestFrame = std::move(captured);
  }

  CVPixelBufferUnlockBaseAddress(pixelBuffer, kCVPixelBufferLock_ReadOnly);
}


- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error
{
  // Aurora-8mk.9: observed live that macOS doesn't just pause delivery on
  // screen lock -- it first serves a run of SCFrameStatusIdle frames, then
  // tears the stream down entirely with a real error ("Failed to find any
  // displays or windows to capture"), landing here. Without this, `stream`/
  // `output` kept pointing at the now-dead objects, so _ensureStream()'s
  // `stream != nil` check thought capture was still fine and never
  // attempted a rebuild -- grabFrameSubsample() would have served one
  // frozen frame forever with no signal anything was wrong. Clearing them
  // here (and resetting rebuildAttempted) makes the next
  // grabFrameSubsample() call reuse Aurora-8mk.6's lazy-rebuild path
  // exactly as if selectMonitor() had just torn it down -- it naturally
  // recovers once the display is available again (unlock), no separate
  // reconnect mechanism needed.
  std::cerr << "ScreenCaptureKitGrabber: stream stopped ("
            << (error != nil ? std::string(error.localizedDescription.UTF8String) : std::string("no error given"))
            << ") -- will retry capture on the next frame\n";

  // Clearing impl->output below can drop the last strong reference to this
  // object; keep it (and the local state copy) alive to the end of the method.
  AuroraSCKStreamOutput* __attribute__((objc_precise_lifetime)) keepAlive = self;
  std::shared_ptr<Aurora::Input::Mac::ScreenCaptureKitGrabber::Impl> impl = _impl;
  if(!impl){
    return;
  }

  std::lock_guard<std::mutex> lock(impl->frameMutex);
  impl->stream = nil;
  impl->output = nil;
  impl->rebuildAttempted = false;
  impl->healthy = false;
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


    // What SCK delivers: full pixel size, or -- once the consumer has said
    // how narrow an image it samples -- an 8x oversample of that, at least
    // 256px wide, aspect kept. The GPU does the bulk downscale; the CPU's
    // INTER_AREA in Orchestrator still averages the final step, so zone
    // colors keep area-averaging quality. Full-Retina frames resized on the
    // CPU every tick overran a 60Hz tick and starved the WebUI (Aurora-3qh).
    SCStreamConfiguration* makeStreamConfiguration(
      unsigned pixelWidth,
      unsigned pixelHeight,
      double refreshRate,
      unsigned captureWidthHint
    )
    {
      unsigned width = pixelWidth;
      unsigned height = pixelHeight;
      if(captureWidthHint > 0 && pixelWidth > 0){
        width = std::min(pixelWidth, std::max(captureWidthHint * 8u, 256u));
        width -= width % 2; // even dimensions for the BGRA pixel buffer
        height = static_cast<unsigned>(std::lround(static_cast<double>(pixelHeight) * width / pixelWidth));
        height = std::max(2u, height - height % 2);
      }

      SCStreamConfiguration* streamConfig = [[SCStreamConfiguration alloc] init];
      streamConfig.width = width;
      streamConfig.height = height;
      streamConfig.pixelFormat = kCVPixelFormatType_32BGRA;
      streamConfig.minimumFrameInterval = CMTimeMake(1, static_cast<int32_t>(refreshRate));
      return streamConfig;
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

      unsigned captureWidthHint = 0;
      {
        std::lock_guard<std::mutex> lock(impl.frameMutex);
        captureWidthHint = impl.captureWidthHint;
      }
      SCStreamConfiguration* streamConfig = makeStreamConfiguration(pixelWidth, pixelHeight, refreshRate, captureWidthHint);

      AuroraSCKStreamOutput* output = [[AuroraSCKStreamOutput alloc] init];
      [output attach:impl.shared_from_this()];

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

      std::lock_guard<std::mutex> lock(impl.frameMutex);
      impl.displayID = display.displayID;
      impl.pixelWidth = pixelWidth;
      impl.pixelHeight = pixelHeight;
      impl.refreshRate = refreshRate;
      impl.stream = stream;
      impl.output = output;
      impl.healthy = true;
    }


    // Bounded stop, mirroring the wait shape used everywhere else in this
    // file -- a teardown (destructor or selectMonitor()) shouldn't throw or
    // hang forever even if the stop callback never fires.
    void stopStream(ScreenCaptureKitGrabber::Impl& impl)
    {
      SCStream* stream = nil;
      {
        std::lock_guard<std::mutex> lock(impl.frameMutex);
        stream = impl.stream;
      }
      if(stream == nil){
        std::lock_guard<std::mutex> lock(impl.frameMutex);
        impl.output = nil; // breaks the Impl <-> output cycle
        return;
      }

      auto stopPromise = std::make_shared<std::promise<void>>();
      auto stopFuture = stopPromise->get_future();

      [stream stopCaptureWithCompletionHandler:^(NSError* error){
        stopPromise->set_value();
      }];

      stopFuture.wait_for(5s);

      std::lock_guard<std::mutex> lock(impl.frameMutex);
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
  m_impl(std::make_shared<Impl>())
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
    {
      std::lock_guard<std::mutex> lock(m_impl->frameMutex);
      m_impl->rebuildAttempted = false;
    }
    m_monitorSelectionData.selectedMonitorId = monitorId;
  }


  void ScreenCaptureKitGrabber::setCaptureWidthHint(unsigned width)
  {
    SCStream* stream = nil;
    unsigned pixelWidth = 0;
    unsigned pixelHeight = 0;
    double refreshRate = 60.0;
    {
      std::lock_guard<std::mutex> lock(m_impl->frameMutex);
      if(m_impl->captureWidthHint == width){
        return;
      }
      m_impl->captureWidthHint = width;
      stream = m_impl->stream;
      pixelWidth = m_impl->pixelWidth;
      pixelHeight = m_impl->pixelHeight;
      refreshRate = m_impl->refreshRate;
    }

    // No live stream: configureAndStartStream() picks the hint up on the
    // next (re)build.
    if(stream == nil){
      return;
    }

    auto updatePromise = std::make_shared<std::promise<bool>>();
    auto updateFuture = updatePromise->get_future();
    [stream updateConfiguration:makeStreamConfiguration(pixelWidth, pixelHeight, refreshRate, width)
              completionHandler:^(NSError* error){
      updatePromise->set_value(error == nil);
    }];

    // Bounded like every other SCK wait here. On failure the stream keeps
    // its previous size -- slower, never broken -- so log and carry on.
    if(updateFuture.wait_for(5s) != std::future_status::ready || !updateFuture.get()){
      std::cerr << "ScreenCaptureKitGrabber: updateConfiguration for capture width hint "
                << width << " didn't succeed within 5s; keeping the previous frame size\n";
    }
  }


  bool ScreenCaptureKitGrabber::isHealthy() const
  {
    std::lock_guard<std::mutex> lock(m_impl->frameMutex);
    return m_impl->healthy;
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
    {
      std::lock_guard<std::mutex> lock(m_impl->frameMutex);
      if(m_impl->stream != nil || m_impl->rebuildAttempted){
        return;
      }
      m_impl->rebuildAttempted = true;
    }

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
