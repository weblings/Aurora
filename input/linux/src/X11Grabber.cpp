#include <Aurora/Input/Linux/X11Grabber.hpp>

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <limits>
#include <stdexcept>

#include <Aurora/Input/Linux/PipewireFrameBuffer.hpp>
#include <Aurora/Input/Linux/X11Damage.hpp>

#include <X11/extensions/Xdamage.h>

#include <X11/Xutil.h>
#include <sys/shm.h>


namespace
{
  // Min time between full X11 grabs: 20 fps capture. A full grab costs
  // ~17 ms/tick at 4K (5.6 ms XShmGetImage wall + 11 ms full-buffer
  // decimate), so an uncapped grabber eats the whole tick budget on any
  // screen that damages most ticks -- and this box's root reports
  // fullscreen damage ~60% of ticks even idling. Quiet screens still skip
  // via damage (bar the kMaxStaleMs refresh); the cap only binds busy ones.
  // Tune here if 20 fps capture proves too steppy (or too rich) for
  // lights: lower costs CPU back toward 60%, higher coarsens motion.
  constexpr long long kMinGrabIntervalMs = 50;

  // Max time a frame is re-served with no damage before a full grab
  // anyway (Aurora-es51): ~1.7% of a core at 4K, and the only refresh
  // when a driver under-reports root damage (NVIDIA fullscreen flipping
  // without a compositor is the known case).
  constexpr long long kMaxStaleMs = 1000;

  long long steadyNowMs()
  {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now().time_since_epoch()).count();
  }
}


namespace Aurora::Input::Linux
{
  X11Grabber::X11MonitorData::X11MonitorData(
    const std::string& name,
    unsigned width,
    unsigned height,
    double refreshRate,
    bool isPrimary,
    int xPos,
    int yPos,
    RROutput outputId
  ):
  MonitorData(name, width, height, refreshRate, isPrimary),
  xPos(xPos),
  yPos(yPos),
  outputId(outputId)
  {}


  X11Grabber::XShmData::XShmData(
    Display* display,
    int screenId,
    unsigned width,
    unsigned height
  ):
  m_display(display)
  {
    m_shmInfo = std::make_unique<XShmSegmentInfo>();

    m_ximage.reset(XShmCreateImage(m_display,
      DefaultVisual(m_display, screenId),
      DefaultDepth(m_display, screenId),
      ZPixmap,
      nullptr,
      m_shmInfo.get(),
      width,
      height
    ));

    size_t size = static_cast<size_t>(m_ximage->bytes_per_line * m_ximage->height);

    m_shmInfo->shmid = shmget(IPC_PRIVATE, size, IPC_CREAT | 0777);
    m_shmInfo->readOnly = False;

    char* addr = reinterpret_cast<char*>(shmat(m_shmInfo->shmid, nullptr, 0));
    m_shmInfo->shmaddr = addr;
    m_ximage->data = addr;

    XShmAttach(m_display, m_shmInfo.get());
  }


  X11Grabber::XShmData::~XShmData()
  {
    shmdt(m_shmInfo->shmaddr);
    shmctl(m_shmInfo->shmid, IPC_RMID, 0);
    XShmDetach(m_display, m_shmInfo.get());
    m_shmInfo.reset();
  }


  XImage* X11Grabber::XShmData::ximage() const
  {
    return m_ximage.get();
  }


  X11Grabber::X11Grabber():
  m_grabGate(kMinGrabIntervalMs, kMaxStaleMs)
  {
    _ensureXThreadsInit();

    m_display.reset(XOpenDisplay(nullptr));

    if(!m_display){
      throw std::runtime_error("Could not open any X11 display");
    }

    m_screenId = XDefaultScreen(m_display.get());

    // Fail-soft: without the Damage extension every grab is full (the old
    // behavior), so exotic X servers keep working instead of throwing here.
    int damageErrorBase = 0;
    if(XDamageQueryExtension(m_display.get(), &m_damageEventBase, &damageErrorBase)){
      m_damage = XDamageCreate(
        m_display.get(), RootWindow(m_display.get(), m_screenId), XDamageReportRawRectangles);
    }
  }


  X11Grabber::~X11Grabber()
  {
    if(m_damage != None){
      XDamageDestroy(m_display.get(), m_damage);
    }
  }


  const std::string& X11Grabber::name() const
  {
    static const std::string s_identifier = "X11Grabber";
    return s_identifier;
  }


  IVideoInput::Resolution X11Grabber::displayResolution() const
  {
    if(auto* selectedMonitor = m_monitorSelectionData.selectedMonitor()){
      return {selectedMonitor->width, selectedMonitor->height};
    }

    return {0, 0};
  }


  IVideoInput::RefreshRate X11Grabber::displayRefreshRate() const
  {
    if(auto* selectedMonitor = m_monitorSelectionData.selectedMonitor()){
      return static_cast<IVideoInput::RefreshRate>(selectedMonitor->refreshRate);
    }

    return 0;
  }


  void X11Grabber::selectMonitor(
    unsigned monitorId
  )
  {
    m_xshmData.reset();
    m_monitorSelectionData.selectedMonitorId = monitorId;
    // The cached frame belongs to the old monitor; the next grab is full.
    m_grabGate.reset();
  }


  void X11Grabber::grabFrameSubsample(
    Contracts::ImageData& imageData
  )
  {
    if(!_ensureXShmData()){
      return;
    }

    auto* selectedMonitor = dynamic_cast<X11MonitorData*>(m_monitorSelectionData.selectedMonitor());

    // Damage skip + rate cap (Aurora-1pwk): re-serve the cached frame
    // when the monitor is undamaged, and grab at most every
    // kMinGrabIntervalMs on a busy screen. Poll every tick regardless:
    // the drain keeps the server-side region and the client queue from
    // growing. Damage drained on a capped tick stays latched in
    // m_grabGate until a grab consumes it (Aurora-es51), and a quiet
    // screen is still re-grabbed every kMaxStaleMs. m_grabbedSerial stays
    // put on a skip, so the capture/rescale nodes reuse their outputs.
    const long long nowMs = steadyNowMs();
    const bool damaged = m_grabGate.hasFrame() ? _pollDamage(selectedMonitor) : true;
    if(!m_grabGate.shouldGrab(damaged, nowMs)){
      imageData = m_lastFrame;
      return;
    }

    int width = static_cast<int>(selectedMonitor->width);
    int height = static_cast<int>(selectedMonitor->height);
    auto ximage = m_xshmData->ximage();

    XShmGetImage(m_display.get(), RootWindow(m_display.get(), m_screenId), ximage, selectedMonitor->xPos, selectedMonitor->yPos, AllPlanes);

    // Standard X11 TrueColor visuals store pixels red-mask-high on a
    // little-endian host, which lands in memory as B,G,R,X -- BGRA/BGR, not
    // RGBA/RGB (ported from huenicorn's identical mistagging, which never
    // surfaced there since its mean() ignored the tag and hardcoded
    // BGR-order indices; see docs/lessons/input.md).
    Contracts::PixelFormat format;
    int bytesPerPixel;
    if(ximage->bits_per_pixel > 24){
      format = Contracts::PixelFormat::BGRA;
      bytesPerPixel = 4;
    }
    else{
      format = Contracts::PixelFormat::BGR;
      bytesPerPixel = 3;
    }

    // Same decimate-on-copy as PipewireGrabber (Aurora-u5k0): area-average
    // straight out of the XShm buffer by an integer factor -- INTER_AREA is
    // only fast at exact integer ratios, a fractional target made CPU worse
    // -- so a 4K frame never crosses the tick at full size. bytes_per_line
    // is the real stride; XImage rows can be padded past width * bytesPerPixel.
    const int decimation = captureDecimation(m_captureWidthHint.load(), width);
    if(decimation <= 1){
      // No hint (or a small screen): keep the historic zero-copy header over
      // the persistent XShm buffer instead of cloning for nothing.
      const int cvType = bytesPerPixel == 4 ? CV_8UC4 : CV_8UC3;
      m_lastFrame.format = format;
      m_lastFrame.imageMatrix = cv::Mat(
        height, width, cvType, ximage->data, static_cast<size_t>(ximage->bytes_per_line));
    }
    else{
      m_lastFrame = toOwnedImage(
        reinterpret_cast<const uint8_t*>(ximage->data),
        width, height,
        static_cast<size_t>(ximage->bytes_per_line),
        format, decimation, bytesPerPixel);
    }

    imageData = m_lastFrame;
    m_grabGate.markGrabbed(nowMs);
    ++m_frameSerial;
    m_grabbedSerial = m_frameSerial;
  }


  void X11Grabber::setCaptureWidthHint(unsigned width)
  {
    m_captureWidthHint.store(width);
  }


  std::uint64_t X11Grabber::frameSerial() const
  {
    return m_grabbedSerial;
  }


  void X11Grabber::_initMonitorsList()
  {
    MonitorSelectionData monitorSelectionData;

    if(!m_display.get()){
      throw std::runtime_error("No display available");
    }

    Window root = DefaultRootWindow(m_display.get());
    UniqueScreenResources screenResources(XRRGetScreenResources(m_display.get(), root));
    auto monitorsQuantity = screenResources->noutput;

    if(monitorsQuantity <= 0){
      throw std::runtime_error("No screen available");
    }

    RROutput primaryId = XRRGetOutputPrimary(m_display.get(), root);

    for(int i = 0; i < monitorsQuantity; i++){
      UniqueOutputInfo outputInfo(XRRGetOutputInfo(m_display.get(), screenResources.get(), screenResources->outputs[i]));

      if(outputInfo->connection != RR_Connected || outputInfo->crtc == 0){
        continue;
      }

      UniqueCrtcInfo crtcInfo(XRRGetCrtcInfo(m_display.get(), screenResources.get(), outputInfo->crtc));

      double refreshRate = 0.0;
      RRMode modeId = crtcInfo->mode;
      for(int m = 0; m < screenResources->nmode; ++m){
        if(screenResources->modes[m].id == modeId){
          const XRRModeInfo& mode = screenResources->modes[m];
          if(mode.hTotal && mode.vTotal){
            refreshRate = static_cast<double>(mode.dotClock) / (mode.hTotal * mode.vTotal);
          }
          break;
        }
      }

      int x = crtcInfo->x;
      int y = crtcInfo->y;
      int width = static_cast<int>(crtcInfo->width);
      int height = static_cast<int>(crtcInfo->height);
      bool isPrimary = (screenResources->outputs[i] == primaryId);

      monitorSelectionData.monitors.push_back(std::make_shared<X11MonitorData>(
        outputInfo->name,
        width,
        height,
        refreshRate,
        isPrimary,
        x,
        y,
        screenResources->outputs[i]
      ));

      if(isPrimary){
        monitorSelectionData.selectedMonitorId = monitorSelectionData.monitors.size() - 1;
      }
    }

    if(monitorSelectionData.monitors.empty()){
      throw std::runtime_error("No monitor available");
    }

    if(!monitorSelectionData.selectedMonitorId.has_value()){
      monitorSelectionData.selectedMonitorId = 0;
    }

    std::swap(m_monitorSelectionData, monitorSelectionData);
  }


  void X11Grabber::_ensureXThreadsInit()
  {
    static bool initialized = [](){
      return XInitThreads();
    }();

    if(!initialized){
      throw std::runtime_error("XInitThreads failed");
    }
  }


  bool X11Grabber::_ensureXShmData()
  {
    if(m_xshmData){
      return true;
    }

    if(auto monitor = m_monitorSelectionData.selectedMonitor()){
      m_xshmData = std::make_unique<XShmData>(m_display.get(), m_screenId, monitor->width, monitor->height);
      return true;
    }

    return false;
  }


  bool X11Grabber::_pollDamage(X11MonitorData* monitor)
  {
    if(m_damage == None){
      return true;
    }

    // DamageNotify carries the root drawable where XAnyEvent has its
    // window, so the typed-window check matches our subscription.
    bool damaged = false;
    XEvent event;
    while(XCheckTypedWindowEvent(
      m_display.get(), RootWindow(m_display.get(), m_screenId),
      m_damageEventBase + XDamageNotify, &event
    )){
      const auto* notify = reinterpret_cast<XDamageNotifyEvent*>(&event);
      if(damageRectIntersectsMonitor(
        notify->area.x, notify->area.y, notify->area.width, notify->area.height,
        monitor->xPos, monitor->yPos,
        static_cast<int>(monitor->width), static_cast<int>(monitor->height)
      )){
        damaged = true;
      }
    }

    // Re-arm: clear the server-side region so only new damage reports.
    XDamageSubtract(m_display.get(), m_damage, None, None);
    return damaged;
  }
}
