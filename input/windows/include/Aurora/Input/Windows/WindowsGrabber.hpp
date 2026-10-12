#pragma once

#include <atomic>
#include <cstdint>

#include <d3d11.h>
#include <dxgi1_2.h>
#include <wrl/client.h>

#include <Aurora/Input/IVideoInput.hpp>
#include <Aurora/Input/MonitorData.hpp>

// DXGI Desktop Duplication capture. No huenicorn precedent to port --
// WindowsAdapter::_createGrabber was a bare stub -- so this follows
// docs/WindowsInputAnalysis.md's API research directly instead.
namespace Aurora::Input::Windows
{
  class WindowsGrabber : public IVideoInput
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
    void setCaptureWidthHint(unsigned width) override;
    std::uint64_t frameSerial() const override;
    void grabFrameSubsample(Contracts::ImageData& imageData) override;

  protected:
    void _initMonitorsList() override;

  private:
    bool _ensureDuplication();
    void _releaseDuplication();
    // Halves the frame on the GPU (mip chain) down to the hint's 8x oversample,
    // as the Mac grabber does (Aurora-3qh). Null = no usable mip; copy full size.
    ID3D11Texture2D* _downscale(ID3D11Texture2D* frame, const D3D11_TEXTURE2D_DESC& desc, unsigned& level);

    Microsoft::WRL::ComPtr<IDXGIFactory1> m_factory;
    Microsoft::WRL::ComPtr<ID3D11Device> m_device;
    Microsoft::WRL::ComPtr<ID3D11DeviceContext> m_context;
    Microsoft::WRL::ComPtr<IDXGIOutputDuplication> m_duplication;
    Microsoft::WRL::ComPtr<ID3D11Texture2D> m_stagingTexture;
    Microsoft::WRL::ComPtr<ID3D11Texture2D> m_mipTexture;
    Microsoft::WRL::ComPtr<ID3D11ShaderResourceView> m_mipView;

    // Set from config apply (another thread) while the tick thread grabs.
    std::atomic<unsigned> m_captureWidthHint{0};
    std::uint64_t m_frameSerial = 0;

    // Returned on WAIT_TIMEOUT/ACCESS_LOST/transient failures -- see
    // docs/WindowsInputAnalysis.md's failure-mode table.
    Contracts::ImageData m_lastFrame;
  };
}
