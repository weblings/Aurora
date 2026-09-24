#pragma once

#include <chrono>

#include <Aurora/Input/IVideoInput.hpp>

// Ported from input/linux's DummyGrabber (itself ported as-is from
// huenicorn's) -- animated solid color, zero OS dependency. Useful as a
// no-display-needed fallback/dev target, and what app/mac's skeleton
// wires up before ScreenCaptureKit exists (Aurora-8mk.5).
namespace Aurora::Input::Mac
{
  class DummyGrabber : public IVideoInput
  {
  public:
    DummyGrabber();

    const std::string& name() const override;

    Resolution displayResolution() const override;
    RefreshRate displayRefreshRate() const override;

    void grabFrameSubsample(Contracts::ImageData& imageData) override;

  private:
    Resolution m_resolution{16, 9};
    RefreshRate m_refreshRate{60};
    std::chrono::steady_clock::time_point m_startTime;
    Contracts::ImageData m_imageData;
  };
}
