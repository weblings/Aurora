#include <Aurora/Input/Linux/X11Grabber.hpp>

#include <algorithm>
#include <limits>
#include <stdexcept>

#include <X11/Xutil.h>
#include <sys/shm.h>


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


  X11Grabber::X11Grabber()
  {
    _ensureXThreadsInit();

    m_display.reset(XOpenDisplay(nullptr));

    if(!m_display){
      throw std::runtime_error("Could not open any X11 display");
    }

    m_screenId = XDefaultScreen(m_display.get());
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
  }


  void X11Grabber::grabFrameSubsample(
    Contracts::ImageData& imageData
  )
  {
    if(!_ensureXShmData()){
      return;
    }

    auto* selectedMonitor = dynamic_cast<X11MonitorData*>(m_monitorSelectionData.selectedMonitor());

    int width = static_cast<int>(selectedMonitor->width);
    int height = static_cast<int>(selectedMonitor->height);
    auto ximage = m_xshmData->ximage();

    XShmGetImage(m_display.get(), RootWindow(m_display.get(), m_screenId), ximage, selectedMonitor->xPos, selectedMonitor->yPos, AllPlanes);

    // Standard X11 TrueColor visuals store pixels red-mask-high on a
    // little-endian host, which lands in memory as B,G,R,X -- BGRA/BGR, not
    // RGBA/RGB (ported from huenicorn's identical mistagging, which never
    // surfaced there since its mean() ignored the tag and hardcoded
    // BGR-order indices; see docs/lessons/input.md).
    int cvFormat;
    if(ximage->bits_per_pixel > 24){
      cvFormat = CV_8UC4;
      m_lastFullScreenFrame.format = Contracts::PixelFormat::BGRA;
    }
    else{
      cvFormat = CV_8UC3;
      m_lastFullScreenFrame.format = Contracts::PixelFormat::BGR;
    }

    m_lastFullScreenFrame.imageMatrix = cv::Mat(height, width, cvFormat, ximage->data);

    imageData = m_lastFullScreenFrame;
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
}
