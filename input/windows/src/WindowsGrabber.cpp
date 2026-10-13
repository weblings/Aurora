#include <Aurora/Input/Windows/WindowsGrabber.hpp>

#include <algorithm>
#include <chrono>
#include <cwchar>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <utility>
#include <vector>

#include <dxgi1_5.h>
#include <windows.h>

#include <Aurora/Input/Windows/ScRgbConversion.hpp>


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


  // SDR white in scRGB units (1.0 = 80 nits): above 1.0 only on an HDR desktop.
  // Read via DisplayConfig, which is live, unlike IDXGIOutput6::GetDesc1.
  float sdrWhiteScale(const wchar_t* gdiName)
  {
    UINT32 pathCount = 0;
    UINT32 modeCount = 0;
    if(GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &pathCount, &modeCount) != ERROR_SUCCESS){
      return 1.0f;
    }
    std::vector<DISPLAYCONFIG_PATH_INFO> paths(pathCount);
    std::vector<DISPLAYCONFIG_MODE_INFO> modes(modeCount);
    if(QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, &pathCount, paths.data(), &modeCount, modes.data(), nullptr) != ERROR_SUCCESS){
      return 1.0f;
    }

    for(UINT32 i = 0; i < pathCount; ++i){
      DISPLAYCONFIG_SOURCE_DEVICE_NAME source{};
      source.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
      source.header.size = sizeof(source);
      source.header.adapterId = paths[i].sourceInfo.adapterId;
      source.header.id = paths[i].sourceInfo.id;
      if(DisplayConfigGetDeviceInfo(&source.header) != ERROR_SUCCESS || std::wcscmp(source.viewGdiDeviceName, gdiName) != 0){
        continue;
      }

      // Wide-colour-only (ACM on an SDR panel) keeps SDR white at 1.0.
      DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO colour{};
      colour.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO;
      colour.header.size = sizeof(colour);
      colour.header.adapterId = paths[i].targetInfo.adapterId;
      colour.header.id = paths[i].targetInfo.id;
      if(DisplayConfigGetDeviceInfo(&colour.header) != ERROR_SUCCESS || !colour.advancedColorEnabled || colour.wideColorEnforced){
        return 1.0f;
      }

      DISPLAYCONFIG_SDR_WHITE_LEVEL white{};
      white.header.type = DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL;
      white.header.size = sizeof(white);
      white.header.adapterId = paths[i].targetInfo.adapterId;
      white.header.id = paths[i].targetInfo.id;
      if(DisplayConfigGetDeviceInfo(&white.header) != ERROR_SUCCESS || white.SDRWhiteLevel == 0){
        return 1.0f;
      }
      // SDRWhiteLevel is in thousandths of 80 nits.
      return static_cast<float>(white.SDRWhiteLevel) / 1000.0f;
    }
    return 1.0f;
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


  WindowsGrabber::~WindowsGrabber()
  {
    _stopCapture();
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
    _stopCapture();
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

        // AcquireNextFrame's surface resolution is the current display
        // mode -- refresh rate read via GDI since DXGI_OUTPUT_DESC
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
    // see docs/WindowsInputAnalysis.md's hybrid-graphics-laptop note.
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

    // The legacy DuplicateOutput clips an HDR desktop to BGRA8 at 80 nits,
    // blowing out SDR content. DuplicateOutput1 hands it back as scRGB FP16.
    ComPtr<IDXGIOutput5> output5;
    if(SUCCEEDED(selectedMonitor->output.As(&output5))){
      constexpr DXGI_FORMAT formats[]{DXGI_FORMAT_R16G16B16A16_FLOAT, DXGI_FORMAT_B8G8R8A8_UNORM};
      hr = output5->DuplicateOutput1(m_device.Get(), 0, static_cast<UINT>(std::size(formats)), formats, &m_duplication);
    }
    else{
      hr = selectedMonitor->output->DuplicateOutput(m_device.Get(), &m_duplication);
    }
    if(FAILED(hr)){
      // E_ACCESSDENIED (secure desktop/UAC), DXGI_ERROR_SESSION_DISCONNECTED
      // (RDP), etc. are expected/transient -- retry lazily next tick rather
      // than treating this as fatal. See WindowsInputAnalysis.md.
      m_device.Reset();
      m_context.Reset();
      return false;
    }

    // Frames arrive in the panel's native orientation (rotated monitors).
    DXGI_OUTDUPL_DESC duplDesc;
    m_duplication->GetDesc(&duplDesc);
    m_rotation = duplDesc.Rotation;
    _refreshSdrWhiteScale();

    return true;
  }


  void WindowsGrabber::_refreshSdrWhiteScale()
  {
    m_sdrWhiteCheckedAt = std::chrono::steady_clock::now();
    auto* selectedMonitor = dynamic_cast<WindowsMonitorData*>(m_monitorSelectionData.selectedMonitor());
    DXGI_OUTPUT_DESC desc;
    if(!selectedMonitor || FAILED(selectedMonitor->output->GetDesc(&desc))){
      m_sdrWhiteScale = 1.0f;
      return;
    }
    m_sdrWhiteScale = sdrWhiteScale(desc.DeviceName);
  }


  void WindowsGrabber::_releaseDuplication()
  {
    m_duplication.Reset();
    m_hasDesktopImage = false;
    m_lastScRgb.release();
    m_stagingTexture.Reset();
    m_mipView.Reset();
    m_mipTexture.Reset();
    m_context.Reset();
    m_device.Reset();
  }


  void WindowsGrabber::setCaptureWidthHint(unsigned width)
  {
    m_captureWidthHint.store(width);
  }


  std::uint64_t WindowsGrabber::frameSerial() const
  {
    return m_grabbedSerial;
  }


  ID3D11Texture2D* WindowsGrabber::_downscale(ID3D11Texture2D* frame, const D3D11_TEXTURE2D_DESC& desc, unsigned& level)
  {
    level = 0;
    const unsigned hint = m_captureWidthHint.load();
    if(hint == 0){
      return nullptr;
    }

    // Same floor as the Mac grabber: 8x the sampled width, at least 256 px.
    const unsigned target = (std::max)(hint * 8u, 256u);
    while((desc.Width >> (level + 1)) >= target && (desc.Height >> (level + 1)) > 0){
      ++level;
    }
    if(level == 0){
      return nullptr;
    }

    if(m_mipTexture){
      D3D11_TEXTURE2D_DESC existing;
      m_mipTexture->GetDesc(&existing);
      if(existing.Width != desc.Width || existing.Height != desc.Height || existing.Format != desc.Format || existing.MipLevels != level + 1){
        m_mipView.Reset();
        m_mipTexture.Reset();
      }
    }

    if(!m_mipTexture){
      D3D11_TEXTURE2D_DESC mipDesc = {};
      mipDesc.Width = desc.Width;
      mipDesc.Height = desc.Height;
      mipDesc.MipLevels = level + 1;
      mipDesc.ArraySize = 1;
      mipDesc.Format = desc.Format;
      mipDesc.SampleDesc.Count = 1;
      mipDesc.Usage = D3D11_USAGE_DEFAULT;
      mipDesc.BindFlags = D3D11_BIND_SHADER_RESOURCE | D3D11_BIND_RENDER_TARGET;
      mipDesc.MiscFlags = D3D11_RESOURCE_MISC_GENERATE_MIPS;
      if(FAILED(m_device->CreateTexture2D(&mipDesc, nullptr, &m_mipTexture))
        || FAILED(m_device->CreateShaderResourceView(m_mipTexture.Get(), nullptr, &m_mipView))){
        m_mipView.Reset();
        m_mipTexture.Reset();
        level = 0;
        return nullptr;
      }
    }

    // Each mip level is a 2x2 box average of the one above, so colours keep
    // area-averaging quality like the CPU INTER_AREA path.
    m_context->CopySubresourceRegion(m_mipTexture.Get(), 0, 0, 0, 0, frame, 0, nullptr);
    m_context->GenerateMips(m_mipView.Get());
    return m_mipTexture.Get();
  }


  void WindowsGrabber::grabFrameSubsample(
    Contracts::ImageData& imageData
  )
  {
    // Never blocks: the capture thread owns the DXGI wait, so the tick's own
    // sleep is the only pacing (Aurora-wqzp.6).
    if(!m_captureThread.joinable()){
      m_stopCapture = false;
      m_captureThread = std::thread([this]{ _captureLoop(); });
    }

    std::exception_ptr error;
    {
      std::lock_guard lock(m_latestMutex);
      error = std::exchange(m_captureError, nullptr);
      if(!error){
        imageData = m_latest;
        m_grabbedSerial = m_latestSerial;
        return;
      }
    }

    // Capture thread died on a fatal error: reap it (restarts next call).
    m_captureThread.join();
    std::rethrow_exception(error);
  }


  void WindowsGrabber::_stopCapture()
  {
    if(m_captureThread.joinable()){
      {
        std::lock_guard lock(m_wakeMutex);
        m_stopCapture = true;
      }
      m_wake.notify_all();
      m_captureThread.join();
    }

    std::lock_guard lock(m_latestMutex);
    m_latest = {};
    m_hasDesktopImage = false;
    m_latestSerial = 0;
    m_grabbedSerial = 0;
    m_captureError = nullptr;
  }


  void WindowsGrabber::_captureLoop()
  {
    while(!m_stopCapture){
      try{
        if(!_captureOnce()){
          // Transient (wait timeout, access lost, no duplication yet):
          // back off briefly so a persistent failure cannot spin.
          std::unique_lock lock(m_wakeMutex);
          m_wake.wait_for(lock, std::chrono::milliseconds(m_duplication ? 10 : 100), [this]{ return m_stopCapture.load(); });
        }
      }
      catch(...){
        std::lock_guard lock(m_latestMutex);
        m_captureError = std::current_exception();
        return;
      }
    }
  }


  bool WindowsGrabber::_captureOnce()
  {
    if(!_ensureDuplication()){
      return false;
    }

    if(std::chrono::steady_clock::now() - m_sdrWhiteCheckedAt > std::chrono::seconds(1)){
      const float previousScale = m_sdrWhiteScale;
      _refreshSdrWhiteScale();
      // Moving the SDR slider may bring one frame (converted at the old level)
      // and then none on a static desktop: reconvert the last one.
      if(m_sdrWhiteScale != previousScale && !m_lastScRgb.empty()){
        Contracts::ImageData frame;
        frame.imageMatrix = scRgbToSrgb8(m_lastScRgb, m_sdrWhiteScale);
        frame.format = Contracts::PixelFormat::RGBA;
        _publish(std::move(frame));
      }
    }

    ComPtr<IDXGIResource> resource;
    DXGI_OUTDUPL_FRAME_INFO frameInfo;
    // Only this thread waits, so a long timeout costs nothing: it returns the
    // moment a frame lands and bounds how late a stop request is seen.
    HRESULT hr = m_duplication->AcquireNextFrame(50, &frameInfo, &resource);

    if(hr == DXGI_ERROR_WAIT_TIMEOUT){
      return false;
    }

    if(hr == DXGI_ERROR_ACCESS_LOST){
      // Desktop switch / mode change / DWM toggle -- reacquire lazily next pass.
      _releaseDuplication();
      return false;
    }

    if(FAILED(hr)){
      return false;
    }

    // Cursor-only update: the desktop image is unchanged, so skip the readback
    // and keep the serial. The first frame after (re)duplication always passes.
    if(frameInfo.AccumulatedFrames == 0 && m_hasDesktopImage){
      m_duplication->ReleaseFrame();
      return true;
    }

    ComPtr<ID3D11Texture2D> frameTexture;
    if(FAILED(resource.As(&frameTexture))){
      m_duplication->ReleaseFrame();
      return false;
    }

    D3D11_TEXTURE2D_DESC desc;
    frameTexture->GetDesc(&desc);

    // DuplicateOutput1 returns FP16 on an HDR desktop and BGRA8 otherwise
    // (the all-black placeholder frame can also be tagged FP16).
    bool isHdr = desc.Format == DXGI_FORMAT_R16G16B16A16_FLOAT;
    if(!isHdr && desc.Format != DXGI_FORMAT_B8G8R8A8_UNORM){
      // Unrecognized format -- fail loud rather than silently misread bytes.
      m_duplication->ReleaseFrame();
      throw std::runtime_error("WindowsGrabber: unexpected DXGI_FORMAT " + std::to_string(static_cast<int>(desc.Format)));
    }

    unsigned level = 0;
    ID3D11Texture2D* scaled = _downscale(frameTexture.Get(), desc, level);
    const UINT outWidth = (std::max)(1u, desc.Width >> level);
    const UINT outHeight = (std::max)(1u, desc.Height >> level);

    if(m_stagingTexture){
      // The live frame's own size/format can change after the staging
      // texture was first created (display-mode change, DPI change, a
      // monitor reporting a different mode) -- copying a differently-sized
      // frame into a stale-sized staging texture is what the RowPitch guard
      // below exists to catch, but recreating it here avoids hitting that
      // path on every subsequent frame once it happens once.
      D3D11_TEXTURE2D_DESC existingStagingDesc;
      m_stagingTexture->GetDesc(&existingStagingDesc);
      if(existingStagingDesc.Width != outWidth || existingStagingDesc.Height != outHeight || existingStagingDesc.Format != desc.Format){
        m_stagingTexture.Reset();
      }
    }

    if(!m_stagingTexture){
      D3D11_TEXTURE2D_DESC stagingDesc = {};
      stagingDesc.Width = outWidth;
      stagingDesc.Height = outHeight;
      stagingDesc.MipLevels = 1;
      stagingDesc.ArraySize = 1;
      stagingDesc.Format = desc.Format;
      stagingDesc.SampleDesc.Count = 1;
      stagingDesc.Usage = D3D11_USAGE_STAGING;
      stagingDesc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;

      if(FAILED(m_device->CreateTexture2D(&stagingDesc, nullptr, &m_stagingTexture))){
        m_duplication->ReleaseFrame();
        return false;
      }
    }

    if(scaled){
      m_context->CopySubresourceRegion(m_stagingTexture.Get(), 0, 0, 0, 0, scaled, level, nullptr);
    }
    else{
      m_context->CopyResource(m_stagingTexture.Get(), frameTexture.Get());
    }

    D3D11_MAPPED_SUBRESOURCE mapped;
    if(FAILED(m_context->Map(m_stagingTexture.Get(), 0, D3D11_MAP_READ, 0, &mapped))){
      m_duplication->ReleaseFrame();
      return false;
    }

    // Belt-and-suspenders against the recreate-on-mismatch above: cv::Mat's
    // row-step constructor asserts (crashing the whole process, not just
    // this call) if RowPitch is ever smaller than this frame's own tightly
    // packed row size. RowPitch legitimately *exceeding* that (GPU row-
    // alignment padding) is expected and already handled by passing it as
    // the explicit step -- only the smaller-than-expected direction is a
    // real problem, and it should be structurally impossible after the
    // check above, but a crash here takes the whole daemon down, so it's
    // still worth failing soft instead of trusting that reasoning blindly.
    size_t bytesPerPixel = isHdr ? 8 : 4; // CV_16FC4 / CV_8UC4
    size_t minRowBytes = static_cast<size_t>(outWidth) * bytesPerPixel;
    if(mapped.RowPitch < minRowBytes){
      std::cerr << "WindowsGrabber: staging texture RowPitch (" << mapped.RowPitch
                << ") smaller than " << outWidth << "x" << outHeight
                << (isHdr ? " HDR" : " SDR") << " frame's own row size (" << minRowBytes
                << ") -- skipping this frame\n";
      m_context->Unmap(m_stagingTexture.Get(), 0);
      m_duplication->ReleaseFrame();
      m_stagingTexture.Reset(); // force a fresh, correctly-sized one next tick
      return false;
    }

    // RowPitch can exceed the tightly-packed row size, and mapped.pData
    // dies at Unmap() -- own the result, same shape as Linux's toOwnedImage().
    Contracts::ImageData frame;
    cv::Mat scRgb;
    if(isHdr){
      // Linear scRGB R,G,B,A (the mips above averaged it in linear light).
      // HDR highlights above SDR white clip, as on an SDR display.
      cv::Mat halfView(static_cast<int>(outHeight), static_cast<int>(outWidth), CV_16FC4, mapped.pData, mapped.RowPitch);
      scRgb = halfView.clone();
      frame.imageMatrix = scRgbToSrgb8(scRgb, m_sdrWhiteScale);
      frame.format = Contracts::PixelFormat::RGBA;
    }
    else{
      cv::Mat view(static_cast<int>(outHeight), static_cast<int>(outWidth), CV_8UC4, mapped.pData, mapped.RowPitch);
      frame.imageMatrix = view.clone();
      frame.format = Contracts::PixelFormat::BGRA;
    }

    m_context->Unmap(m_stagingTexture.Get(), 0);
    m_duplication->ReleaseFrame();

    // A new duplication can open with an all-black, alpha-0 placeholder (seen
    // on DuplicateOutput1): drop it and wait for the real first image.
    if(!m_hasDesktopImage && cv::mean(frame.imageMatrix)[3] == 0){
      return true;
    }

    m_lastScRgb = scRgb;
    _publish(std::move(frame));
    return true;
  }


  void WindowsGrabber::_publish(Contracts::ImageData frame)
  {
    // Rotate the small readback to the desktop's orientation, so zones map correctly.
    switch(m_rotation){
      case DXGI_MODE_ROTATION_ROTATE90:
        cv::rotate(frame.imageMatrix, frame.imageMatrix, cv::ROTATE_90_CLOCKWISE);
        break;
      case DXGI_MODE_ROTATION_ROTATE180:
        cv::rotate(frame.imageMatrix, frame.imageMatrix, cv::ROTATE_180);
        break;
      case DXGI_MODE_ROTATION_ROTATE270:
        cv::rotate(frame.imageMatrix, frame.imageMatrix, cv::ROTATE_90_COUNTERCLOCKWISE);
        break;
      default:
        break;
    }

    // Fresh buffers per frame: the tick thread may still hold the last one.
    std::lock_guard lock(m_latestMutex);
    m_latest = std::move(frame);
    ++m_latestSerial;
    m_hasDesktopImage = true;
  }
}
