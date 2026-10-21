#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <exception>
#include <mutex>
#include <optional>
#include <string>
#include <thread>

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
    virtual ~WindowsGrabber();

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
    std::string captureError() const override;
    void grabFrameSubsample(Contracts::ImageData& imageData) override;

  protected:
    void _initMonitorsList() override;

  private:
    // Capture thread (Aurora-wqzp.6): owns the duplication objects below and
    // publishes the newest frame; grabFrameSubsample() only copies it out.
    void _captureLoop();
    bool _captureOnce();
    void _stopCapture();
    bool _ensureDuplication();
    void _noteDuplicationFailure(const char* call, HRESULT hr);
    void _releaseDuplication();
    void _refreshSdrWhiteScale();
    // Rotates, then hands the frame to the tick thread with a new serial.
    void _publish(Contracts::ImageData frame);
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

    std::thread m_captureThread;
    std::atomic<bool> m_stopCapture{false};
    std::mutex m_wakeMutex;
    std::condition_variable m_wake;

    // Newest frame, kept across WAIT_TIMEOUT/ACCESS_LOST/transient failures
    // -- see docs/WindowsInputAnalysis.md's failure-mode table.
    std::mutex m_latestMutex;
    Contracts::ImageData m_latest;
    std::uint64_t m_latestSerial = 0;
    // Panel rotation of the current duplication (capture thread only).
    DXGI_MODE_ROTATION m_rotation = DXGI_MODE_ROTATION_IDENTITY;
    // SDR white in scRGB units for FP16 frames, re-read each second since the
    // user can move the SDR brightness slider mid-session (capture thread only).
    float m_sdrWhiteScale = 1.0f;
    std::chrono::steady_clock::time_point m_sdrWhiteCheckedAt;
    // Last published FP16 readback, reconverted when the SDR white level moves.
    cv::Mat m_lastScRgb;
    // True once this duplication has produced an image (capture thread only).
    bool m_hasDesktopImage = false;
    std::exception_ptr m_captureError;
    // Start of the current unbroken run of failed duplication attempts
    // (capture thread only); the message is read by the tick thread.
    std::optional<std::chrono::steady_clock::time_point> m_duplicationFailingSince;
    mutable std::mutex m_failureMutex;
    std::string m_duplicationFailure;
    // Serial of the frame last handed out (tick thread only).
    std::uint64_t m_grabbedSerial = 0;
  };
}
