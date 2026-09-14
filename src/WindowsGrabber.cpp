#include <Aurora/Input/Windows/WindowsGrabber.hpp>

#include <stdexcept>

#include <windows.h>


namespace
{
  std::string narrow(const wchar_t* wide)
  {
    if(!wide){
      return {};
    }

    int size = WideCharToMultiByte(CP_UTF8, 0, wide, -1, nullptr, 0, nullptr, nullptr);
    if(size <= 0){
      return {};
    }

    std::string result(static_cast<size_t>(size - 1), '\0');
    WideCharToMultiByte(CP_UTF8, 0, wide, -1, result.data(), size, nullptr, nullptr);
    return result;
  }
}


namespace Aurora::Input::Windows
{
  using Microsoft::WRL::ComPtr;

  WindowsGrabber::WindowsMonitorData::WindowsMonitorData(
    const std::string& name,
    unsigned width,
    unsigned height,
    double refreshRate,
    bool isPrimary,
    ComPtr<IDXGIAdapter1> adapter,
    ComPtr<IDXGIOutput1> output
  ):
  MonitorData(name, width, height, refreshRate, isPrimary),
  adapter(adapter),
  output(output)
  {}


  WindowsGrabber::WindowsGrabber()
  {
    if(FAILED(CreateDXGIFactory1(IID_PPV_ARGS(&m_factory)))){
      throw std::runtime_error("Could not create DXGI factory");
    }
  }


  const std::string& WindowsGrabber::name() const
  {
    static const std::string s_identifier = "WindowsGrabber";
    return s_identifier;
  }


  IVideoInput::Resolution WindowsGrabber::displayResolution() const
  {
    if(auto* selectedMonitor = m_monitorSelectionData.selectedMonitor()){
      return {static_cast<int>(selectedMonitor->width), static_cast<int>(selectedMonitor->height)};
    }

    return {0, 0};
  }


  IVideoInput::RefreshRate WindowsGrabber::displayRefreshRate() const
  {
    if(auto* selectedMonitor = m_monitorSelectionData.selectedMonitor()){
      return static_cast<IVideoInput::RefreshRate>(selectedMonitor->refreshRate);
    }

    return 0;
  }


  void WindowsGrabber::selectMonitor(
    unsigned monitorId
  )
  {
    _releaseDuplication();
    m_monitorSelectionData.selectedMonitorId = monitorId;
  }


  void WindowsGrabber::_initMonitorsList()
  {
    MonitorSelectionData monitorSelectionData;

    ComPtr<IDXGIAdapter1> adapter;
    for(UINT adapterIndex = 0; m_factory->EnumAdapters1(adapterIndex, &adapter) != DXGI_ERROR_NOT_FOUND; ++adapterIndex){
      ComPtr<IDXGIOutput> output;
      for(UINT outputIndex = 0; adapter->EnumOutputs(outputIndex, &output) != DXGI_ERROR_NOT_FOUND; ++outputIndex){
        ComPtr<IDXGIOutput1> output1;
        if(FAILED(output.As(&output1))){
          continue;
        }

        DXGI_OUTPUT_DESC desc;
        if(FAILED(output1->GetDesc(&desc)) || !desc.AttachedToDesktop){
          continue;
        }

        MONITORINFO monitorInfo{};
        monitorInfo.cbSize = sizeof(monitorInfo);
        bool isPrimary = GetMonitorInfoW(desc.Monitor, &monitorInfo) && (monitorInfo.dwFlags & MONITORINFOF_PRIMARY);

        // AcquireNextFrame's surface is always B8G8R8A8, but its *resolution*
        // is the current display mode -- read via GDI since DXGI_OUTPUT_DESC
        // doesn't carry a refresh rate at all.
        DEVMODEW devMode{};
        devMode.dmSize = sizeof(devMode);
        double refreshRate = 0.0;
        if(EnumDisplaySettingsW(desc.DeviceName, ENUM_CURRENT_SETTINGS, &devMode)){
          refreshRate = devMode.dmDisplayFrequency;
        }

        unsigned width = static_cast<unsigned>(desc.DesktopCoordinates.right - desc.DesktopCoordinates.left);
        unsigned height = static_cast<unsigned>(desc.DesktopCoordinates.bottom - desc.DesktopCoordinates.top);

        monitorSelectionData.monitors.push_back(std::make_shared<WindowsMonitorData>(
          narrow(desc.DeviceName),
          width,
          height,
          refreshRate,
          isPrimary,
          adapter,
          output1
        ));

        if(isPrimary){
          monitorSelectionData.selectedMonitorId = static_cast<unsigned>(monitorSelectionData.monitors.size() - 1);
        }
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


  bool WindowsGrabber::_ensureDuplication()
  {
    if(m_duplication){
      return true;
    }

    auto* selectedMonitor = dynamic_cast<WindowsMonitorData*>(m_monitorSelectionData.selectedMonitor());
    if(!selectedMonitor){
      return false;
    }

    // Must be created on the same adapter the target output belongs to --
    // see Analysis/WindowsInputAnalysis.md's hybrid-graphics-laptop note.
    D3D_FEATURE_LEVEL featureLevel;
    HRESULT hr = D3D11CreateDevice(
      selectedMonitor->adapter.Get(),
      D3D_DRIVER_TYPE_UNKNOWN,
      nullptr,
      0,
      nullptr,
      0,
      D3D11_SDK_VERSION,
      &m_device,
      &featureLevel,
      &m_context
    );

    if(FAILED(hr)){
      return false;
    }

    hr = selectedMonitor->output->DuplicateOutput(m_device.Get(), &m_duplication);
    if(FAILED(hr)){
      // E_ACCESSDENIED (secure desktop/UAC), DXGI_ERROR_SESSION_DISCONNECTED
      // (RDP), etc. are expected/transient -- retry lazily next tick rather
      // than treating this as fatal. See WindowsInputAnalysis.md.
      m_device.Reset();
      m_context.Reset();
      return false;
    }

    return true;
  }


  void WindowsGrabber::_releaseDuplication()
  {
    m_duplication.Reset();
    m_stagingTexture.Reset();
    m_context.Reset();
    m_device.Reset();
  }


  void WindowsGrabber::grabFrameSubsample(
    Contracts::ImageData& imageData
  )
  {
    if(!_ensureDuplication()){
      imageData = m_lastFrame;
      return;
    }

    ComPtr<IDXGIResource> resource;
    DXGI_OUTDUPL_FRAME_INFO frameInfo;
    // 0ms (non-blocking) verified broken on hardware -- it can starve
    // indefinitely on empty placeholder frames instead of ever seeing a
    // real one. ~16ms (one 60Hz interval) reliably gets real data.
    HRESULT hr = m_duplication->AcquireNextFrame(16, &frameInfo, &resource);

    if(hr == DXGI_ERROR_WAIT_TIMEOUT){
      imageData = m_lastFrame;
      return;
    }

    if(hr == DXGI_ERROR_ACCESS_LOST){
      // Desktop switch / mode change / DWM toggle -- reacquire lazily next call.
      _releaseDuplication();
      imageData = m_lastFrame;
      return;
    }

    if(FAILED(hr)){
      imageData = m_lastFrame;
      return;
    }

    ComPtr<ID3D11Texture2D> frameTexture;
    if(FAILED(resource.As(&frameTexture))){
      m_duplication->ReleaseFrame();
      imageData = m_lastFrame;
      return;
    }

    D3D11_TEXTURE2D_DESC desc;
    frameTexture->GetDesc(&desc);

    // MS docs claim this is always B8G8R8A8_UNORM; HDR desktops return
    // R16G16B16A16_FLOAT instead -- handled defensively (see WindowsInputAnalysis.md).
    bool isHdr = desc.Format == DXGI_FORMAT_R16G16B16A16_FLOAT;
    if(!isHdr && desc.Format != DXGI_FORMAT_B8G8R8A8_UNORM){
      // Unrecognized format -- fail loud rather than silently misread bytes.
      m_duplication->ReleaseFrame();
      throw std::runtime_error("WindowsGrabber: unexpected DXGI_FORMAT " + std::to_string(static_cast<int>(desc.Format)));
    }

    if(!m_stagingTexture){
      D3D11_TEXTURE2D_DESC stagingDesc = desc;
      stagingDesc.Usage = D3D11_USAGE_STAGING;
      stagingDesc.BindFlags = 0;
      stagingDesc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
      stagingDesc.MiscFlags = 0;

      if(FAILED(m_device->CreateTexture2D(&stagingDesc, nullptr, &m_stagingTexture))){
        m_duplication->ReleaseFrame();
        imageData = m_lastFrame;
        return;
      }
    }

    m_context->CopyResource(m_stagingTexture.Get(), frameTexture.Get());

    D3D11_MAPPED_SUBRESOURCE mapped;
    if(FAILED(m_context->Map(m_stagingTexture.Get(), 0, D3D11_MAP_READ, 0, &mapped))){
      m_duplication->ReleaseFrame();
      imageData = m_lastFrame;
      return;
    }

    // RowPitch can exceed the tightly-packed row size, and mapped.pData
    // dies at Unmap() -- own the result, same shape as toOwnedRgbaImage().
    if(isHdr){
      // scRGB linear, channel order R,G,B,A -- clamp to SDR range and
      // gamma-encode; good enough for averaging, not real HDR tone-mapping.
      cv::Mat halfView(static_cast<int>(desc.Height), static_cast<int>(desc.Width), CV_16FC4, mapped.pData, mapped.RowPitch);
      cv::Mat linear;
      halfView.convertTo(linear, CV_32FC4);
      cv::min(linear, 1.0, linear);
      cv::max(linear, 0.0, linear);
      cv::pow(linear, 1.0 / 2.2, linear);
      linear.convertTo(m_lastFrame.imageMatrix, CV_8UC4, 255.0);
      m_lastFrame.format = Contracts::PixelFormat::RGBA;
    }
    else{
      cv::Mat view(static_cast<int>(desc.Height), static_cast<int>(desc.Width), CV_8UC4, mapped.pData, mapped.RowPitch);
      m_lastFrame.imageMatrix = view.clone();
      m_lastFrame.format = Contracts::PixelFormat::BGRA;
    }

    m_context->Unmap(m_stagingTexture.Get(), 0);
    m_duplication->ReleaseFrame();

    imageData = m_lastFrame;
  }
}
