#include <catch2/catch_test_macros.hpp>

#include <chrono>
#include <iostream>
#include <thread>

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

#endif
