#pragma once

#include <d3d11.h>
#include <dxgi1_2.h>
#include <wrl/client.h>

#include <Aurora/Input/IInput.hpp>
#include <Aurora/Input/MonitorData.hpp>

// DXGI Desktop Duplication capture. No huenicorn precedent to port --
// WindowsAdapter::_createGrabber was a bare stub -- so this follows
// Analysis/WindowsInputAnalysis.md's API research directly instead.
namespace Aurora::Input::Windows
{
  class WindowsGrabber : public IInput
  {
  public:
    struct WindowsMonitorData : public MonitorData
    {
      WindowsMonitorData(
        const std::string& name,
        unsigned width,
        unsigned height,
        double refreshRate,
        bool isPrimary,
        Microsoft::WRL::ComPtr<IDXGIAdapter1> adapter,
        Microsoft::WRL::ComPtr<IDXGIOutput1> output
      );

      // DuplicateOutput requires the device to be created on the same
      // adapter the output belongs to -- kept together so _ensureDuplication
      // can't accidentally use a mismatched pair.
      Microsoft::WRL::ComPtr<IDXGIAdapter1> adapter;
      Microsoft::WRL::ComPtr<IDXGIOutput1> output;
    };

    WindowsGrabber();
    virtual ~WindowsGrabber() {}

    const std::string& name() const override;

    bool hasCustomScreenManagement() const override
    {
      return true;
    }

    Resolution displayResolution() const override;
    RefreshRate displayRefreshRate() const override;

    void selectMonitor(unsigned monitorId) override;
    void grabFrameSubsample(Contracts::ImageData& imageData) override;

  protected:
    void _initMonitorsList() override;

  private:
    bool _ensureDuplication();
    void _releaseDuplication();

    Microsoft::WRL::ComPtr<IDXGIFactory1> m_factory;
    Microsoft::WRL::ComPtr<ID3D11Device> m_device;
    Microsoft::WRL::ComPtr<ID3D11DeviceContext> m_context;
    Microsoft::WRL::ComPtr<IDXGIOutputDuplication> m_duplication;
    Microsoft::WRL::ComPtr<ID3D11Texture2D> m_stagingTexture;

    // Returned on WAIT_TIMEOUT/ACCESS_LOST/transient failures -- see
    // Analysis/WindowsInputAnalysis.md's failure-mode table.
    Contracts::ImageData m_lastFrame;
  };
}
