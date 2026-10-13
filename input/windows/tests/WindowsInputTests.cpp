#include <catch2/catch_test_macros.hpp>

#include <chrono>
#include <iostream>
#include <optional>
#include <thread>
#include <vector>

#include <Aurora/Input/Windows/DummyGrabber.hpp>

#ifdef AURORA_INPUT_WINDOWS_DXGI_AVAILABLE
#include <Aurora/Input/Windows/WindowsGrabber.hpp>
#endif

using namespace Aurora::Input;
using namespace Aurora::Input::Windows;
using namespace Aurora::Contracts;


TEST_CASE("DummyGrabber produces a correctly-sized, tagged frame", "[DummyGrabber]")
{
  DummyGrabber grabber;
  CHECK(grabber.name() == "DummyGrabber");

  ImageData image;
  grabber.grabFrameSubsample(image);

  REQUIRE(image.hasData());
  CHECK(image.width() == grabber.displayResolution().x);
  CHECK(image.height() == grabber.displayResolution().y);
  CHECK(image.format == PixelFormat::BGR);
}


#ifdef AURORA_INPUT_WINDOWS_DXGI_AVAILABLE
// Real capture, not unit-testable (needs a real interactive desktop) --
// same category as X11Grabber/PipewireGrabber. Tagged [.] (Catch2's
// "hidden" convention) so it's excluded from normal `ctest` runs; invoke
// explicitly with `AuroraInputWindowsTests.exe [manual]` to actually verify
// capture on a given machine.
TEST_CASE("WindowsGrabber captures real, non-empty frames", "[.][manual][WindowsGrabber]")
{
  WindowsGrabber grabber;
  grabber.init();

  // A powered-off-but-attached monitor reads back as real, valid, all-black
  // data -- list every enumerated monitor so that's diagnosable, not mistaken for a bug.
  for(const auto& monitor : grabber.monitors()){
    std::cerr << "  found monitor: " << monitor->name << " " << monitor->width
               << "x" << monitor->height << " primary=" << monitor->isPrimary << "\n";
  }

  std::cerr << "Monitor: " << grabber.displayResolution().x << "x"
            << grabber.displayResolution().y << " @ "
            << grabber.displayRefreshRate() << "Hz\n";

  for(int i = 0; i < 5; ++i){
    ImageData image;
    // Capture runs on its own thread: the first grab may precede any frame.
    for(int wait = 0; wait < 100 && !image.hasData(); ++wait){
      grabber.grabFrameSubsample(image);
      std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }

    // BGRA (SDR) or RGBA (HDR desktop, converted) -- both valid, see WindowsGrabber.
    REQUIRE(image.hasData());
    CHECK((image.format == PixelFormat::BGRA || image.format == PixelFormat::RGBA));

    auto mean = cv::mean(image.imageMatrix);
    std::cerr << "Frame " << i << ": " << image.width() << "x" << image.height()
               << " mean BGRA = (" << mean[0] << ", " << mean[1] << ", " << mean[2] << ", " << mean[3] << ")\n";
  }
}


// Static desktop required. Drives the real cursor (SetCursorPos) and checks
// that cursor-only DXGI frames neither bump the serial nor lose the image.
TEST_CASE("WindowsGrabber skips cursor-only frames", "[.][manual][WindowsGrabber]")
{
  WindowsGrabber grabber;
  grabber.init();

  ImageData image;
  for(int wait = 0; wait < 100 && !image.hasData(); ++wait){
    grabber.grabFrameSubsample(image);
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
  }
  // First frame after duplication is captured even on a static desktop.
  REQUIRE(image.hasData());

  std::this_thread::sleep_for(std::chrono::milliseconds(500));
  grabber.grabFrameSubsample(image);
  const auto before = grabber.frameSerial();

  POINT origin;
  GetCursorPos(&origin);
  constexpr int moves = 200;
  for(int i = 0; i < moves; ++i){
    SetCursorPos(origin.x + (i % 40), origin.y + (i % 40));
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
  }
  SetCursorPos(origin.x, origin.y);
  std::this_thread::sleep_for(std::chrono::milliseconds(100));

  grabber.grabFrameSubsample(image);
  const auto bumps = grabber.frameSerial() - before;
  std::cerr << "cursor moves " << moves << ", serial bumps " << bumps << "\n";
  CHECK(image.hasData());
  // Baseline (no skip) bumps ~14 per 200 moves; allow a little real desktop activity.
  CHECK(bumps <= 2);
}


// Static desktop required. Full-size capture resized by CPU INTER_AREA to the
// mip size vs the GPU mip chain's own level: records the per-channel gap.
TEST_CASE("WindowsGrabber GPU mips match CPU INTER_AREA", "[.][manual][WindowsGrabber]")
{
  auto grab = [](unsigned hint){
    WindowsGrabber grabber;
    grabber.init();
    grabber.setCaptureWidthHint(hint);
    ImageData image;
    // Skip the leading all-black placeholder frames.
    for(int i = 0; i < 100; ++i){
      std::this_thread::sleep_for(std::chrono::milliseconds(50));
      grabber.grabFrameSubsample(image);
      if(image.hasData() && cv::mean(image.imageMatrix)[3] > 0){
        break;
      }
    }
    REQUIRE(image.hasData());
    return image.imageMatrix.clone();
  };

  cv::Mat full = grab(0);
  cv::Mat mip = grab(32);
  REQUIRE(mip.cols < full.cols);

  cv::Mat cpu;
  cv::resize(full, cpu, mip.size(), 0, 0, cv::INTER_AREA);
  cv::Mat diff;
  cv::absdiff(cpu, mip, diff);
  double maxDiff = 0;
  cv::minMaxLoc(diff.reshape(1), nullptr, &maxDiff);
  auto meanDiff = cv::mean(diff);
  std::cerr << "full " << full.cols << "x" << full.rows << " -> mip " << mip.cols << "x" << mip.rows
            << " mean |diff| (B,G,R) = " << meanDiff[0] << ", " << meanDiff[1] << ", " << meanDiff[2]
            << " max = " << maxDiff << "\n";
  CHECK(meanDiff[0] < 2.0);
  CHECK(meanDiff[1] < 2.0);
  CHECK(meanDiff[2] < 2.0);
}


// Switching monitors stops and restarts the capture thread.
TEST_CASE("WindowsGrabber selectMonitor re-captures on each monitor", "[.][manual][WindowsGrabber]")
{
  WindowsGrabber grabber;
  grabber.init();

  for(unsigned id = 0; id < grabber.monitors().size(); ++id){
    grabber.selectMonitor(id);
    ImageData image;
    for(int wait = 0; wait < 100 && !image.hasData(); ++wait){
      grabber.grabFrameSubsample(image);
      std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    REQUIRE(image.hasData());
    std::cerr << "monitor " << id << ": " << image.width() << "x" << image.height()
              << " serial " << grabber.frameSerial() << "\n";
    // Frame size vs reported resolution is logged, not asserted: they differ on
    // a scaled display when the exe is DPI-unaware (Aurora-wqzp.6).
    std::cerr << "  reported " << grabber.displayResolution().x << "x" << grabber.displayResolution().y << "\n";
  }
}

// Needs a rotated (e.g. portrait) monitor. Checks every monitor: frame aspect
// must match the desktop-space resolution, not the panel's native one.
TEST_CASE("WindowsGrabber frames match the rotated desktop orientation", "[.][manual][WindowsGrabber]")
{
  WindowsGrabber grabber;
  grabber.init();

  for(unsigned id = 0; id < grabber.monitors().size(); ++id){
    grabber.selectMonitor(id);
    ImageData image;
    for(int wait = 0; wait < 100 && !image.hasData(); ++wait){
      grabber.grabFrameSubsample(image);
      std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    REQUIRE(image.hasData());

    const auto resolution = grabber.displayResolution();
    std::cerr << "monitor " << id << ": reported " << resolution.x << "x" << resolution.y
              << ", frame " << image.width() << "x" << image.height() << "\n";
    CHECK((image.width() > image.height()) == (resolution.x > resolution.y));
  }
}


namespace
{
  // Topmost borderless window filled with one colour, covering a monitor.
  struct SolidWindow
  {
    HWND hwnd = nullptr;

    SolidWindow(const RECT& rect, COLORREF color)
    {
      WNDCLASSW wc{};
      wc.lpfnWndProc = DefWindowProcW;
      wc.hInstance = GetModuleHandleW(nullptr);
      wc.lpszClassName = L"AuroraSolidTestWindow";
      RegisterClassW(&wc); // fails harmlessly once already registered
      hwnd = CreateWindowExW(WS_EX_TOPMOST | WS_EX_TOOLWINDOW, wc.lpszClassName, L"", WS_POPUP,
                             rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top,
                             nullptr, nullptr, wc.hInstance, nullptr);
      SetClassLongPtrW(hwnd, GCLP_HBRBACKGROUND, reinterpret_cast<LONG_PTR>(CreateSolidBrush(color)));
      ShowWindow(hwnd, SW_SHOWNOACTIVATE);
      UpdateWindow(hwnd);
    }

    ~SolidWindow()
    {
      auto brush = reinterpret_cast<HBRUSH>(GetClassLongPtrW(hwnd, GCLP_HBRBACKGROUND));
      DestroyWindow(hwnd);
      DeleteObject(brush);
    }
  };

  void pumpFor(std::chrono::milliseconds duration)
  {
    const auto end = std::chrono::steady_clock::now() + duration;
    while(std::chrono::steady_clock::now() < end){
      MSG msg;
      while(PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)){
        DispatchMessageW(&msg);
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
  }

  RECT monitorRect(const std::string& deviceName)
  {
    struct Search { std::string name; RECT rect{}; } search{deviceName};
    EnumDisplayMonitors(nullptr, nullptr, [](HMONITOR monitor, HDC, LPRECT, LPARAM param) -> BOOL {
      auto* s = reinterpret_cast<Search*>(param);
      MONITORINFOEXA info{};
      info.cbSize = sizeof(info);
      if(GetMonitorInfoA(monitor, &info) && s->name == info.szDevice){
        s->rect = info.rcMonitor;
        return FALSE;
      }
      return TRUE;
    }, reinterpret_cast<LPARAM>(&search));
    return search.rect;
  }
}


// Shows solid greys on every monitor in turn, so it takes over the screen
// briefly. SDR content must capture at its sRGB value on HDR monitors too.
TEST_CASE("WindowsGrabber captures SDR greys at their sRGB value on every monitor", "[.][manual][WindowsGrabber]")
{
  WindowsGrabber grabber;
  grabber.init();

  for(unsigned id = 0; id < grabber.monitors().size(); ++id){
    const std::string name = grabber.monitors()[id]->name; // monitors() returns a copy
    grabber.selectMonitor(id);

    for(int grey : {64, 128, 192}){
      SolidWindow window(monitorRect(name), RGB(grey, grey, grey));
      pumpFor(std::chrono::milliseconds(500));

      // Skip the all-black, alpha-0 placeholder frame a new duplication starts with.
      ImageData image;
      for(int wait = 0; wait < 100; ++wait){
        grabber.grabFrameSubsample(image);
        if(image.hasData() && cv::mean(image.imageMatrix)[3] > 0){
          break;
        }
        pumpFor(std::chrono::milliseconds(20));
      }
      REQUIRE(image.hasData());

      // Centre half only: keeps the window edges out of the mean.
      cv::Rect centre(image.width() / 4, image.height() / 4, image.width() / 2, image.height() / 2);
      auto mean = cv::mean(image.imageMatrix(centre));
      std::cerr << name << " grey " << grey << ": "
                << (image.format == PixelFormat::RGBA ? "RGBA(FP16)" : "BGRA") << " captured ("
                << mean[0] << ", " << mean[1] << ", " << mean[2] << ")\n";
      for(int channel = 0; channel < 3; ++channel){
        CHECK(std::abs(mean[channel] - grey) < 3.0);
      }
    }
  }
}


namespace
{
  // A DisplayConfig target plus the GDI name the grabber knows it by.
  struct DisplayTarget
  {
    LUID adapterId{};
    UINT32 id = 0;
    std::string gdiName;
    bool hdrCapable = false;
    bool primary = false;
  };

  std::vector<DisplayTarget> displayTargets()
  {
    std::vector<DisplayTarget> targets;
    UINT32 pathCount = 0;
    UINT32 modeCount = 0;
    GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &pathCount, &modeCount);
    std::vector<DISPLAYCONFIG_PATH_INFO> paths(pathCount);
    std::vector<DISPLAYCONFIG_MODE_INFO> modes(modeCount);
    if(QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, &pathCount, paths.data(), &modeCount, modes.data(), nullptr) != ERROR_SUCCESS){
      return targets;
    }
    for(UINT32 i = 0; i < pathCount; ++i){
      DISPLAYCONFIG_SOURCE_DEVICE_NAME source{};
      source.header = {DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME, sizeof(source), paths[i].sourceInfo.adapterId, paths[i].sourceInfo.id};
      DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO colour{};
      colour.header = {DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO, sizeof(colour), paths[i].targetInfo.adapterId, paths[i].targetInfo.id};
      if(DisplayConfigGetDeviceInfo(&source.header) != ERROR_SUCCESS || DisplayConfigGetDeviceInfo(&colour.header) != ERROR_SUCCESS){
        continue;
      }
      DisplayTarget target;
      target.adapterId = paths[i].targetInfo.adapterId;
      target.id = paths[i].targetInfo.id;
      char name[CCHDEVICENAME]{};
      WideCharToMultiByte(CP_UTF8, 0, source.viewGdiDeviceName, -1, name, sizeof(name), nullptr, nullptr);
      target.gdiName = name;
      target.hdrCapable = colour.advancedColorSupported && !colour.wideColorEnforced;
      DEVMODEA mode{};
      mode.dmSize = sizeof(mode);
      target.primary = EnumDisplaySettingsA(name, ENUM_CURRENT_SETTINGS, &mode) && mode.dmPosition.x == 0 && mode.dmPosition.y == 0;
      targets.push_back(target);
    }
    return targets;
  }

  bool hdrEnabled(const DisplayTarget& target)
  {
    DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO colour{};
    colour.header = {DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO, sizeof(colour), target.adapterId, target.id};
    return DisplayConfigGetDeviceInfo(&colour.header) == ERROR_SUCCESS && colour.advancedColorEnabled;
  }

  bool setHdr(const DisplayTarget& target, bool enable)
  {
    DISPLAYCONFIG_SET_ADVANCED_COLOR_STATE state{};
    state.header = {DISPLAYCONFIG_DEVICE_INFO_SET_ADVANCED_COLOR_STATE, sizeof(state), target.adapterId, target.id};
    state.enableAdvancedColor = enable ? 1 : 0;
    return DisplayConfigSetDeviceInfo(&state.header) == ERROR_SUCCESS;
  }

  UINT32 sdrWhiteLevel(const DisplayTarget& target)
  {
    DISPLAYCONFIG_SDR_WHITE_LEVEL white{};
    white.header = {DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL, sizeof(white), target.adapterId, target.id};
    return DisplayConfigGetDeviceInfo(&white.header) == ERROR_SUCCESS ? white.SDRWhiteLevel : 0;
  }

  // Undocumented setter behind the Settings app's SDR brightness slider:
  // type 0xFFFFFFEE, level in thousandths of 80 nits.
  bool setSdrWhiteLevel(const DisplayTarget& target, UINT32 level)
  {
    struct
    {
      DISPLAYCONFIG_DEVICE_INFO_HEADER header;
      UINT32 SDRWhiteLevel;
      BYTE finalValue;
    } white{};
    white.header = {static_cast<DISPLAYCONFIG_DEVICE_INFO_TYPE>(0xFFFFFFEE), sizeof(white), target.adapterId, target.id};
    white.SDRWhiteLevel = level;
    white.finalValue = 1;
    return DisplayConfigSetDeviceInfo(&white.header) == ERROR_SUCCESS;
  }

  // Puts HDR and SDR white back however the test left them.
  struct RestoreDisplay
  {
    DisplayTarget target;
    bool hdr;
    UINT32 white;

    ~RestoreDisplay()
    {
      if(hdrEnabled(target) != hdr){
        setHdr(target, hdr);
      }
      if(hdr && white && sdrWhiteLevel(target) != white){
        setSdrWhiteLevel(target, white);
      }
    }
  };

  // Waits for a frame newer than afterSerial (skipping alpha-0 placeholders)
  // and returns its centre mean, or nullopt on timeout.
  std::optional<cv::Scalar> freshCentreMean(WindowsGrabber& grabber, std::uint64_t afterSerial, PixelFormat& format)
  {
    for(int wait = 0; wait < 250; ++wait){
      ImageData image;
      grabber.grabFrameSubsample(image);
      if(grabber.frameSerial() > afterSerial && image.hasData() && cv::mean(image.imageMatrix)[3] > 0){
        format = image.format;
        cv::Rect centre(image.width() / 4, image.height() / 4, image.width() / 2, image.height() / 2);
        return cv::mean(image.imageMatrix(centre));
      }
      pumpFor(std::chrono::milliseconds(20));
    }
    return std::nullopt;
  }
}


// Toggles HDR and moves the SDR white level on one HDR-capable, preferably
// non-primary monitor, restoring both after. One grabber lives throughout.
TEST_CASE("WindowsGrabber keeps SDR greys exact across HDR toggles and SDR white changes", "[.][manual][WindowsGrabber]")
{
  auto targets = displayTargets();
  std::optional<DisplayTarget> target;
  for(const auto& candidate : targets){
    if(candidate.hdrCapable && (!target || target->primary)){
      target = candidate;
    }
  }
  if(!target){
    SKIP("no HDR-capable monitor");
  }
  RestoreDisplay restore{*target, hdrEnabled(*target), sdrWhiteLevel(*target)};
  std::cerr << "monitor " << target->gdiName << ": HDR " << restore.hdr << ", SDR white "
            << restore.white * 80 / 1000 << " nits\n";

  WindowsGrabber grabber;
  grabber.init();
  const auto monitors = grabber.monitors();
  unsigned monitorId = 0;
  while(monitorId < monitors.size() && monitors[monitorId]->name != target->gdiName){
    ++monitorId;
  }
  REQUIRE(monitorId < monitors.size());
  grabber.selectMonitor(monitorId);

  SolidWindow window(monitorRect(target->gdiName), RGB(128, 128, 128));
  std::uint64_t serial = 0;
  auto expectGrey = [&](const char* step){
    PixelFormat format{};
    auto mean = freshCentreMean(grabber, serial, format);
    serial = grabber.frameSerial();
    INFO(step);
    REQUIRE(mean.has_value());
    std::cerr << step << ": " << (format == PixelFormat::RGBA ? "RGBA(FP16)" : "BGRA") << " captured ("
              << (*mean)[0] << ", " << (*mean)[1] << ", " << (*mean)[2] << ")\n";
    for(int channel = 0; channel < 3; ++channel){
      CHECK(std::abs((*mean)[channel] - 128) < 3.0);
    }
  };

  // Mode changes blank the panel briefly; DWM settles within a couple of seconds.
  const auto settle = std::chrono::milliseconds(2500);
  if(!restore.hdr){
    REQUIRE(setHdr(*target, true));
    pumpFor(settle);
  }
  expectGrey("HDR on");

  const UINT32 whiteNow = sdrWhiteLevel(*target);
  const UINT32 otherWhite = whiteNow > 3000 ? 2000 : 5000; // 160 or 400 nits
  if(setSdrWhiteLevel(*target, otherWhite) && sdrWhiteLevel(*target) == otherWhite){
    pumpFor(settle);
    expectGrey("SDR white changed");
    setSdrWhiteLevel(*target, whiteNow);
    pumpFor(settle);
  }
  else{
    WARN("SDR white level setter refused; slider change not exercised");
  }

  REQUIRE(setHdr(*target, false));
  pumpFor(settle);
  expectGrey("HDR off");

  REQUIRE(setHdr(*target, true));
  pumpFor(settle);
  expectGrey("HDR back on");
}

#endif
