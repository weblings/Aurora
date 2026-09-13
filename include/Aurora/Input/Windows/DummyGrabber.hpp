#pragma once

#include <chrono>

#include <Aurora/Input/IInput.hpp>

// Ported as-is from Aurora-Input-Linux's DummyGrabber (itself from
// huenicorn) -- animated solid color, zero OS dependency. Useful as a
// no-display-needed fallback/dev target while WindowsGrabber doesn't exist yet.
namespace Aurora::Input::Windows
{
  class DummyGrabber : public IInput
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
